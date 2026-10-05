"""
SynapseHealth — Agent 3: Temporal Health Graph
Builds the longitudinal view of a patient's history and resolves conflicts between
documents. The production design stores this in Neo4j; the prototype models the same
relationships as explicit date-bounded rows so the timeline is queryable with SQL and
the swap to a graph store stays confined to this module.
"""

from dataclasses import dataclass, field
from datetime import date
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.db.models import Condition, Medication, Patient, Procedure
from src.db.patient_service import PatientService

# A condition recorded as active with no resolution and no recent re-dating is treated
# as chronic for timeline purposes only; the database flag remains the source of truth.
_CHRONIC_MARKERS = (
    "diabet", "hypertens", "coronary artery disease", "atrial fibrillation",
    "chronic kidney disease", "asthma", "copd", "hypothyroid", "hyperlipid",
    "osteoarthritis", "epilep", "depression", "tuberculosis",
)


@dataclass
class GraphNode:
    """A single node in the reconstructed clinical history."""

    node_id: str
    node_type: str
    label: str
    date: Optional[date] = None
    date_precision: str = "day"
    detail: Optional[str] = None
    code: Optional[str] = None
    status: Optional[str] = None
    source_document_id: Optional[int] = None

    def as_dict(self) -> Dict[str, Any]:
        return {
            "node_id": self.node_id,
            "node_type": self.node_type,
            "label": self.label,
            "date": self.date.isoformat() if self.date else None,
            "date_precision": self.date_precision,
            "detail": self.detail,
            "code": self.code,
            "status": self.status,
            "source_document_id": self.source_document_id,
        }


@dataclass
class GraphEdge:
    """A directed relationship between two clinical events."""

    source: str
    target: str
    relation: str

    def as_dict(self) -> Dict[str, str]:
        return {"source": self.source, "target": self.target, "relation": self.relation}


@dataclass
class ConflictResolution:
    """One disagreement between documents that the graph agent had to settle."""

    entity_type: str
    entity_name: str
    resolution: str
    retained_source_document_id: Optional[int] = None
    superseded_source_document_id: Optional[int] = None
    reason: str = ""

    def as_dict(self) -> Dict[str, Any]:
        return {
            "entity_type": self.entity_type,
            "entity_name": self.entity_name,
            "resolution": self.resolution,
            "retained_source_document_id": self.retained_source_document_id,
            "superseded_source_document_id": self.superseded_source_document_id,
            "reason": self.reason,
        }


@dataclass
class TemporalGraph:
    """The reconstructed patient history plus any conflicts that were resolved."""

    nodes: List[GraphNode] = field(default_factory=list)
    edges: List[GraphEdge] = field(default_factory=list)
    conflicts: List[ConflictResolution] = field(default_factory=list)
    chronic_conditions: List[str] = field(default_factory=list)

    def as_dict(self) -> Dict[str, Any]:
        return {
            "node_count": len(self.nodes),
            "edge_count": len(self.edges),
            "nodes": [node.as_dict() for node in self.nodes],
            "edges": [edge.as_dict() for edge in self.edges],
            "conflicts": [conflict.as_dict() for conflict in self.conflicts],
            "chronic_conditions": self.chronic_conditions,
        }

    def ordered_nodes(self) -> List[GraphNode]:
        """Return nodes in chronological order, undated nodes last."""
        dated = [node for node in self.nodes if node.date]
        undated = [node for node in self.nodes if not node.date]
        dated.sort(key=lambda node: (node.date, node.node_type))
        return dated + undated


class TemporalGraphAgent:
    """Reconstructs the ordered clinical history and reconciles cross-document conflicts."""

    def __init__(self, patient_service: Optional[PatientService] = None):
        self.patient_service = patient_service or PatientService()

    def build(self, db: Session, patient: Patient) -> TemporalGraph:
        """Build the temporal graph for one patient from their consolidated entities."""
        graph = TemporalGraph()
        sequence = 0

        conditions = list(
            db.scalars(select(Condition).where(Condition.patient_id == patient.id)).all()
        )
        medications = list(
            db.scalars(select(Medication).where(Medication.patient_id == patient.id)).all()
        )
        procedures = list(
            db.scalars(select(Procedure).where(Procedure.patient_id == patient.id)).all()
        )

        condition_ids: Dict[str, str] = {}
        for condition in conditions:
            sequence += 1
            node_id = f"c{sequence}"
            condition_ids[_key(condition.name)] = node_id
            is_chronic = condition.is_chronic or _looks_chronic(condition.name)
            graph.nodes.append(
                GraphNode(
                    node_id=node_id,
                    node_type="Condition",
                    label=condition.name,
                    date=condition.onset_date,
                    date_precision=_precision(condition.onset_date),
                    detail=f"ICD-10 {condition.icd10_code}" if condition.icd10_code else None,
                    code=condition.icd10_code,
                    status=condition.status,
                    source_document_id=condition.source_document_id,
                )
            )
            if is_chronic and condition.status == "active":
                graph.chronic_conditions.append(condition.name)

        procedure_ids: Dict[str, str] = {}
        for procedure in procedures:
            sequence += 1
            node_id = f"p{sequence}"
            procedure_ids[_key(procedure.name)] = node_id
            graph.nodes.append(
                GraphNode(
                    node_id=node_id,
                    node_type="Procedure",
                    label=procedure.name,
                    date=procedure.performed_date,
                    date_precision=_precision(procedure.performed_date),
                    detail=procedure.outcome,
                    code=procedure.snomed_code,
                    status="completed",
                    source_document_id=procedure.source_document_id,
                )
            )

        medication_ids: Dict[str, str] = {}
        for medication in medications:
            sequence += 1
            node_id = f"m{sequence}"
            medication_ids[_key(medication.name)] = node_id
            graph.nodes.append(
                GraphNode(
                    node_id=node_id,
                    node_type="Medication",
                    label=medication.name,
                    date=medication.start_date,
                    date_precision=_precision(medication.start_date),
                    detail=_dose_text(medication),
                    code=medication.rxnorm_code,
                    status=medication.status,
                    source_document_id=medication.source_document_id,
                )
            )

        graph.edges.extend(
            _link_treatments(condition_ids, procedure_ids, medication_ids)
        )
        graph.conflicts = self._resolve_conflicts(db, patient)

        return graph

    def _resolve_conflicts(self, db: Session, patient: Patient) -> List[ConflictResolution]:
        """Reconcile entities of the same type recorded by more than one document.

        The prototype does not delete history: where two documents disagree, the row
        sourced from the most recently ingested document is treated as authoritative
        and the disagreement is reported so a clinician can review it.
        """
        conflicts: List[ConflictResolution] = []

        medication_groups = self._group_by_document(db, patient, Medication, "name")
        for name, rows in medication_groups.items():
            if len(rows) < 2:
                continue
            ordered = sorted(rows, key=lambda row: (row["uploaded_at"], row["id"]))
            latest = ordered[-1]
            active_statuses = {row["status"] for row in ordered}
            if len(active_statuses) > 1:
                conflicts.append(
                    ConflictResolution(
                        entity_type="Medication",
                        entity_name=name,
                        resolution="kept_latest_document",
                        retained_source_document_id=latest["source_document_id"],
                        superseded_source_document_id=ordered[0]["source_document_id"],
                        reason=(
                            "Documents disagree on whether this medication is active; "
                            "the most recently ingested document was retained."
                        ),
                    )
                )

        condition_groups = self._group_by_document(db, patient, Condition, "name")
        for name, rows in condition_groups.items():
            if len(rows) < 2:
                continue
            statuses = {row["status"] for row in rows}
            if len(statuses) > 1:
                ordered = sorted(rows, key=lambda row: (row["uploaded_at"], row["id"]))
                conflicts.append(
                    ConflictResolution(
                        entity_type="Condition",
                        entity_name=name,
                        resolution="kept_latest_document",
                        retained_source_document_id=ordered[-1]["source_document_id"],
                        superseded_source_document_id=ordered[0]["source_document_id"],
                        reason=(
                            "Documents disagree on whether this condition is active or resolved; "
                            "the most recently ingested document was retained."
                        ),
                    )
                )

        return conflicts

    @staticmethod
    def _group_by_document(
        db: Session, patient: Patient, model: Any, name_field: str
    ) -> Dict[str, List[Dict[str, Any]]]:
        """Group a patient's entities of one type by name and source document."""
        from src.db.models import SourceDocument

        uploaded_at = {
            document.id: document.uploaded_at
            for document in db.scalars(
                select(SourceDocument).where(SourceDocument.patient_id == patient.id)
            ).all()
        }

        groups: Dict[str, List[Dict[str, Any]]] = {}
        for row in db.scalars(select(model).where(model.patient_id == patient.id)).all():
            name = str(getattr(row, name_field) or "").strip()
            if not name:
                continue
            groups.setdefault(name.lower(), []).append(
                {
                    "id": row.id,
                    "status": getattr(row, "status", None),
                    "source_document_id": row.source_document_id,
                    "uploaded_at": uploaded_at.get(row.source_document_id),
                }
            )

        return groups


def _link_treatments(
    condition_ids: Dict[str, str],
    procedure_ids: Dict[str, str],
    medication_ids: Dict[str, str],
) -> List[GraphEdge]:
    """Link medications and procedures to the conditions they most plausibly treat."""
    edges: List[GraphEdge] = []

    for medication_name, medication_id in medication_ids.items():
        for condition_name, condition_id in condition_ids.items():
            if _treats(medication_name, condition_name):
                edges.append(GraphEdge(condition_id, medication_id, "TREATED_BY"))

    for procedure_name, procedure_id in procedure_ids.items():
        for condition_name, condition_id in condition_ids.items():
            if _treats(procedure_name, condition_name):
                edges.append(GraphEdge(condition_id, procedure_id, "MANAGED_BY"))

    return edges


# Drug and condition stems used to infer a treatment relationship. Deliberately coarse:
# this annotates the graph for clinician navigation and never gates a safety verdict.
_TREATMENT_STEMS = {
    "metformin": ("diabet",),
    "insulin": ("diabet",),
    "glibenclamide": ("diabet",),
    "aspirin": ("coronary artery disease", "myocardial infarction", "stroke"),
    "clopidogrel": ("coronary artery disease", "myocardial infarction", "stroke"),
    "atorvastatin": ("hyperlipid", "coronary artery disease"),
    "simvastatin": ("hyperlipid", "coronary artery disease"),
    "rosuvastatin": ("hyperlipid", "coronary artery disease"),
    "losartan": ("hypertens",),
    "amlodipine": ("hypertens",),
    "lisinopril": ("hypertens", "heart failure"),
    "hydrochlorothiazide": ("hypertens",),
    "metoprolol": ("hypertens", "coronary artery disease", "atrial fibrillation"),
    "atenolol": ("hypertens",),
    "salbutamol": ("asthma", "chronic obstructive pulmonary"),
    "montelukast": ("asthma",),
    "prednisolone": ("asthma", "chronic obstructive pulmonary"),
    "levothyroxine": ("hypothyroid",),
    "pantoprazole": ("peptic ulcer", "gastritis"),
    "omeprazole": ("peptic ulcer", "gastritis"),
    "ferrous sulfate": ("anaemia",),
    "allopurinol": ("gout",),
}

_PROCEDURE_STEMS = {
    "coronary artery bypass graft": ("coronary artery disease", "myocardial infarction"),
    "percutaneous coronary intervention": ("coronary artery disease", "myocardial infarction"),
    "cardiac stent": ("coronary artery disease", "myocardial infarction"),
    "total knee replacement": ("osteoarthritis",),
    "appendectomy": (),
    "cholecystectomy": (),
    "cataract surgery": (),
}


def _treats(subject: str, condition: str) -> bool:
    """Return True when a drug or procedure plausibly treats a condition."""
    subject_key = _key(subject)
    condition_key = _key(condition)

    stems = _TREATMENT_STEMS.get(subject_key) or _PROCEDURE_STEMS.get(subject_key)
    if stems is None:
        return False

    return any(_key(stem) in condition_key for stem in stems)


def _key(value: str) -> str:
    """Reduce a clinical term to a comparable lowercase key."""
    return " ".join(str(value or "").lower().split())


def _looks_chronic(condition_name: str) -> bool:
    """Return True when a condition name matches a known chronic-disease stem."""
    lowered = _key(condition_name)
    return any(marker in lowered for marker in _CHRONIC_MARKERS)


def _precision(value: Optional[date]) -> str:
    """Report whether a date was recorded to the day or only to the year."""
    if value is None:
        return "unknown"
    return "year" if (value.month, value.day) == (1, 1) else "day"


def _dose_text(medication: Medication) -> str:
    """Render a medication's dose and frequency for graph display."""
    if medication.dose is None:
        return medication.frequency or medication.status
    unit = medication.dose_unit or ""
    dose = f"{medication.dose:g}" if isinstance(medication.dose, float) else str(medication.dose)
    parts = [f"{dose}{unit}"]
    if medication.frequency:
        parts.append(medication.frequency)
    return " ".join(parts)