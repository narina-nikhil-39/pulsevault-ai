"""
SynapseHealth — Patient Profile Assembly Service
Persists extraction payloads as clinical entities and assembles the consolidated
patient profile, longitudinal timeline, and active medication list that back the
Emergency Flashcard and the doctor dashboard.
"""

from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.db.models import (
    Allergy,
    Condition,
    Implant,
    LabValue,
    Medication,
    Patient,
    Procedure,
    SafetyAlert,
    SourceDocument,
)
from src.services.drug_lookup_service import DrugLookupService
from src.services.vision_service import partial_date


@dataclass
class PersistResult:
    """Counts of entities written by one extraction payload, for pipeline reporting."""

    conditions: int = 0
    medications: int = 0
    allergies: int = 0
    lab_values: int = 0
    procedures: int = 0
    implants: int = 0
    normalized: int = 0
    skipped_dates: int = 0

    def as_dict(self) -> Dict[str, int]:
        return {
            "conditions": self.conditions,
            "medications": self.medications,
            "allergies": self.allergies,
            "lab_values": self.lab_values,
            "procedures": self.procedures,
            "implants": self.implants,
            "normalized": self.normalized,
            "skipped_dates": self.skipped_dates,
        }

    @property
    def total(self) -> int:
        return (
            self.conditions
            + self.medications
            + self.allergies
            + self.lab_values
            + self.procedures
            + self.implants
        )


class PatientService:
    """Reads and writes the consolidated clinical profile for a single patient."""

    def __init__(self, terminology: Optional[DrugLookupService] = None):
        self.terminology = terminology or DrugLookupService()

    def get_or_create_patient(
        self,
        db: Session,
        patient_code: str,
        full_name: str,
        age: Optional[int] = None,
        sex: Optional[str] = None,
        blood_group: Optional[str] = None,
        contact: Optional[str] = None,
    ) -> Patient:
        """Fetch a patient by code, creating the record on first sight."""
        patient = db.scalar(select(Patient).where(Patient.patient_code == patient_code))

        if patient is None:
            patient = Patient(patient_code=patient_code, full_name=full_name)
            db.add(patient)

        if full_name:
            patient.full_name = full_name
        for attribute, value in (
            ("age", age),
            ("sex", sex),
            ("blood_group", blood_group),
            ("contact", contact),
        ):
            if value not in (None, ""):
                setattr(patient, attribute, value)

        db.flush()
        return patient

    def persist_extraction(
        self,
        db: Session,
        patient: Patient,
        document: SourceDocument,
        payload: Dict[str, Any],
    ) -> PersistResult:
        """Write every entity in an extraction payload, normalizing terms as it goes.

        Every stored entity carries the page the extraction pass read from, so a clinician
        can trace a fact back to a specific location rather than to the whole document.
        """
        result = PersistResult()
        page_number = _source_page(document, payload)

        for item in payload.get("conditions") or []:
            name = str(item.get("name") or "").strip()
            if not name:
                continue
            mapping = self.terminology.normalize_condition(name)
            onset = self._to_date(item.get("onset_date"), result)
            resolved = self._to_date(item.get("resolved_date"), result)
            db.add(
                Condition(
                    patient_id=patient.id,
                    name=mapping.normalized_term if mapping.code else name,
                    icd10_code=mapping.code,
                    snomed_code=None,
                    status=str(item.get("status") or "active").lower(),
                    is_chronic=bool(item.get("is_chronic")),
                    onset_date=onset,
                    resolved_date=resolved,
                    source_document_id=document.id,
                    source_page=page_number,
                    source_span=str(item.get("evidence_sentence") or "")[:500] or None,
                    source_confidence=_as_float(payload.get("extraction_confidence")),
                )
            )
            result.conditions += 1
            result.normalized += 1 if mapping.code else 0

        for item in payload.get("medications") or []:
            name = str(item.get("name") or "").strip()
            if not name:
                continue
            mapping = self.terminology.normalize_drug(name)
            db.add(
                Medication(
                    patient_id=patient.id,
                    name=mapping.normalized_term if mapping.code else name,
                    rxnorm_code=mapping.code,
                    dose=_as_float(item.get("dose")),
                    dose_unit=str(item.get("dose_unit") or "").strip() or None,
                    frequency=str(item.get("frequency") or "").strip() or None,
                    route=str(item.get("route") or "").strip().lower() or None,
                    status=str(item.get("status") or "active").lower(),
                    start_date=self._to_date(item.get("start_date"), result),
                    end_date=self._to_date(item.get("end_date"), result),
                    source_document_id=document.id,
                    source_page=page_number,
                    source_span=str(item.get("evidence_sentence") or "")[:500] or None,
                    source_confidence=_as_float(payload.get("extraction_confidence")),
                )
            )
            result.medications += 1
            result.normalized += 1 if mapping.code else 0

        for item in payload.get("allergies") or []:
            substance = str(item.get("substance") or "").strip()
            if not substance:
                continue
            mapping = self.terminology.normalize_allergy(substance)
            db.add(
                Allergy(
                    patient_id=patient.id,
                    substance=mapping.normalized_term if mapping.code else substance,
                    snomed_code=mapping.code,
                    reaction=str(item.get("reaction") or "").strip() or None,
                    severity=str(item.get("severity") or "unknown").lower(),
                    source_document_id=document.id,
                    source_page=page_number,
                    source_span=str(item.get("evidence_sentence") or "")[:500] or None,
                    source_confidence=_as_float(payload.get("extraction_confidence")),
                )
            )
            result.allergies += 1
            result.normalized += 1 if mapping.code else 0

        for item in payload.get("lab_values") or []:
            test_name = str(item.get("test_name") or "").strip()
            if not test_name:
                continue
            mapping = self.terminology.normalize_lab(test_name)
            value = _as_float(item.get("value"))
            db.add(
                LabValue(
                    patient_id=patient.id,
                    test_name=mapping.normalized_term if mapping.code else test_name,
                    loinc_code=mapping.code,
                    value=value,
                    value_text=str(item.get("value_text") or "").strip() or None,
                    unit=str(item.get("unit") or "").strip() or None,
                    collected_date=self._to_date(item.get("collected_date"), result),
                    source_document_id=document.id,
                    source_page=page_number,
                    source_span=str(item.get("evidence_sentence") or "")[:500] or None,
                    source_confidence=_as_float(payload.get("extraction_confidence")),
                )
            )
            result.lab_values += 1
            result.normalized += 1 if mapping.code else 0

        for item in payload.get("procedures") or []:
            name = str(item.get("name") or "").strip()
            if not name:
                continue
            mapping = self.terminology.normalize_procedure(name)
            db.add(
                Procedure(
                    patient_id=patient.id,
                    name=mapping.normalized_term if mapping.code else name,
                    snomed_code=mapping.code,
                    performed_date=self._to_date(item.get("performed_date"), result),
                    outcome=str(item.get("outcome") or "").strip() or None,
                    source_document_id=document.id,
                    source_page=page_number,
                    source_span=str(item.get("evidence_sentence") or "")[:500] or None,
                    source_confidence=_as_float(payload.get("extraction_confidence")),
                )
            )
            result.procedures += 1
            result.normalized += 1 if mapping.code else 0

        for item in payload.get("implants") or []:
            name = str(item.get("name") or "").strip()
            if not name:
                continue
            db.add(
                Implant(
                    patient_id=patient.id,
                    name=name,
                    snomed_code=None,
                    implanted_date=self._to_date(item.get("implanted_date"), result),
                    source_document_id=document.id,
                    source_page=page_number,
                    source_span=str(item.get("evidence_sentence") or "")[:500] or None,
                    source_confidence=_as_float(payload.get("extraction_confidence")),
                )
            )
            result.implants += 1

        db.flush()
        return result

    def supersede_medications(self, db: Session, patient: Patient) -> int:
        """Backfill an end date on prescriptions that a document explicitly stopped.

        Prescriptions are superseded rather than deleted so the longitudinal history
        remains reconstructable. Only medications the extraction marked as stopped are
        touched; absence from a later prescription is never treated as discontinuation,
        because a document that lists only its own drugs would otherwise wipe the record.
        """
        stopped = list(
            db.scalars(
                select(Medication).where(
                    Medication.patient_id == patient.id,
                    Medication.status == "stopped",
                    Medication.end_date.is_(None),
                )
            ).all()
        )

        for medication in stopped:
            medication.end_date = medication.start_date or date.today()

        db.flush()
        return len(stopped)

    def active_medications(self, db: Session, patient: Patient) -> List[Medication]:
        """Return every medication currently marked active for the patient."""
        return list(
            db.scalars(
                select(Medication)
                .where(Medication.patient_id == patient.id, Medication.status == "active")
                .order_by(Medication.name)
            ).all()
        )

    def severe_allergies(self, db: Session, patient: Patient) -> List[Allergy]:
        """Return allergies that must appear on the emergency flashcard."""
        return list(
            db.scalars(
                select(Allergy)
                .where(Allergy.patient_id == patient.id, Allergy.severity == "severe")
                .order_by(Allergy.substance)
            ).all()
        )

    def build_timeline(self, db: Session, patient: Patient) -> List[Dict[str, Any]]:
        """Assemble a chronological view of diagnoses, procedures, and prescriptions."""
        events: List[Dict[str, Any]] = []

        for condition in db.scalars(
            select(Condition).where(Condition.patient_id == patient.id)
        ).all():
            events.append(
                _event(
                    when=condition.onset_date,
                    kind="condition",
                    label=condition.name,
                    detail=condition.status.title(),
                    code=condition.icd10_code,
                    chronic=condition.is_chronic,
                    document_id=condition.source_document_id,
                    span=condition.source_span,
                )
            )
            if condition.resolved_date:
                events.append(
                    _event(
                        when=condition.resolved_date,
                        kind="condition_resolved",
                        label=condition.name,
                        detail="Resolved",
                        code=condition.icd10_code,
                        document_id=condition.source_document_id,
                    )
                )

        for procedure in db.scalars(
            select(Procedure).where(Procedure.patient_id == patient.id)
        ).all():
            events.append(
                _event(
                    when=procedure.performed_date,
                    kind="procedure",
                    label=procedure.name,
                    detail=procedure.outcome or "Procedure",
                    code=procedure.snomed_code,
                    document_id=procedure.source_document_id,
                    span=procedure.source_span,
                )
            )

        for medication in db.scalars(
            select(Medication).where(Medication.patient_id == patient.id)
        ).all():
            events.append(
                _event(
                    when=medication.start_date,
                    kind="medication_started",
                    label=medication.name,
                    detail=_dose_label(medication),
                    code=medication.rxnorm_code,
                    document_id=medication.source_document_id,
                    span=medication.source_span,
                )
            )
            if medication.end_date:
                events.append(
                    _event(
                        when=medication.end_date,
                        kind="medication_stopped",
                        label=medication.name,
                        detail="Discontinued",
                        code=medication.rxnorm_code,
                        document_id=medication.source_document_id,
                    )
                )

        for lab in db.scalars(select(LabValue).where(LabValue.patient_id == patient.id)).all():
            events.append(
                _event(
                    when=lab.collected_date,
                    kind="lab",
                    label=lab.test_name,
                    detail=lab.value_text or (
                        f"{lab.value} {lab.unit}" if lab.value is not None else "—"
                    ),
                    code=lab.loinc_code,
                    document_id=lab.source_document_id,
                )
            )

        dated = [event for event in events if event["date"]]
        undated = [event for event in events if not event["date"]]
        dated.sort(key=lambda event: (event["date"], event["kind"]))
        return dated + undated

    def build_profile(self, db: Session, patient: Patient) -> Dict[str, Any]:
        """Assemble the full consolidated clinical profile returned to the dashboard."""
        documents = list(
            db.scalars(
                select(SourceDocument)
                .where(SourceDocument.patient_id == patient.id)
                .order_by(SourceDocument.uploaded_at.desc())
            ).all()
        )

        conditions = list(
            db.scalars(select(Condition).where(Condition.patient_id == patient.id)).all()
        )
        medications = self.active_medications(db, patient)
        allergies = list(
            db.scalars(select(Allergy).where(Allergy.patient_id == patient.id)).all()
        )
        procedures = list(
            db.scalars(select(Procedure).where(Procedure.patient_id == patient.id)).all()
        )
        implants = list(
            db.scalars(select(Implant).where(Implant.patient_id == patient.id)).all()
        )
        lab_values = list(
            db.scalars(select(LabValue).where(LabValue.patient_id == patient.id)).all()
        )
        alerts = list(
            db.scalars(select(SafetyAlert).where(SafetyAlert.patient_id == patient.id)).all()
        )

        return {
            "patient": {
                "id": patient.id,
                "patient_code": patient.patient_code,
                "full_name": patient.full_name,
                "age": patient.age,
                "sex": patient.sex,
                "blood_group": patient.blood_group,
                "contact": patient.contact,
            },
            "record_count": len(documents),
            "conditions": [
                _serialize(
                    condition,
                    fields=("name", "icd10_code", "status", "is_chronic", "onset_date", "resolved_date"),
                )
                for condition in conditions
            ],
            "active_conditions": [
                _serialize(condition, fields=("name", "icd10_code", "is_chronic", "onset_date"))
                for condition in conditions
                if condition.status == "active"
            ],
            "medications": [
                _serialize(
                    medication,
                    fields=("name", "rxnorm_code", "dose", "dose_unit", "frequency", "route", "start_date", "status"),
                )
                for medication in medications
            ],
            "allergies": [
                _serialize(allergy, fields=("substance", "snomed_code", "reaction", "severity"))
                for allergy in allergies
            ],
            "procedures": [
                _serialize(procedure, fields=("name", "snomed_code", "performed_date", "outcome"))
                for procedure in procedures
            ],
            "implants": [
                _serialize(implant, fields=("name", "implanted_date")) for implant in implants
            ],
            "lab_values": [
                _serialize(
                    lab,
                    fields=("test_name", "loinc_code", "value", "value_text", "unit", "collected_date", "flag"),
                )
                for lab in lab_values
            ],
            "safety_alerts": [
                {
                    "id": alert.id,
                    "severity": alert.severity,
                    "category": alert.category,
                    "title": alert.title,
                    "detail": alert.detail,
                    "involved": alert.involved,
                    "recommendation": alert.recommendation,
                }
                for alert in alerts
            ],
            "documents": [
                _serialize(
                    document,
                    fields=("id", "filename", "doc_type", "page_count", "extraction_method", "processed_at"),
                )
                for document in documents
            ],
            "timeline": self.build_timeline(db, patient),
        }

    @staticmethod
    def _to_date(value: Any, result: PersistResult) -> Optional[date]:
        """Parse a full or year-only date string, counting unparseable values."""
        text = partial_date(value)
        if not text:
            return None

        if len(text) == 4:
            result.skipped_dates += 1
            return date(int(text), 1, 1)

        try:
            return datetime.strptime(text, "%Y-%m-%d").date()
        except ValueError:
            result.skipped_dates += 1
            return None


def _source_page(document: Optional[SourceDocument], payload: Dict[str, Any]) -> int:
    """Return the 1-based page an extraction payload was read from.

    The page number comes from the extraction pass. It is never derived from the document
    length: page_count is how many pages exist, not where a fact was found.
    """
    stated = payload.get("page_number")
    if isinstance(stated, int) and stated > 0:
        return stated

    if isinstance(stated, str) and stated.strip().isdigit():
        return int(stated.strip())

    return 1


def _event(
    when: Optional[date],
    kind: str,
    label: str,
    detail: str,
    code: Optional[str] = None,
    chronic: bool = False,
    document_id: Optional[int] = None,
    span: Optional[str] = None,
) -> Dict[str, Any]:
    """Build one timeline entry."""
    return {
        "date": when.isoformat() if when else None,
        "year": when.year if when else None,
        "kind": kind,
        "label": label,
        "detail": detail,
        "code": code,
        "chronic": chronic,
        "source_document_id": document_id,
        "source_span": span,
    }


def _dose_label(medication: Medication) -> str:
    """Render a human-readable dose string for the timeline."""
    if medication.dose is None:
        return medication.frequency or medication.status.title()
    unit = medication.dose_unit or ""
    dose = f"{medication.dose:g}" if isinstance(medication.dose, float) else str(medication.dose)
    parts = [f"{dose}{unit}"]
    if medication.frequency:
        parts.append(medication.frequency)
    return " ".join(parts)


def _serialize(entity: Any, fields: tuple) -> Dict[str, Any]:
    """Project selected entity fields into a JSON-safe dictionary."""
    output: Dict[str, Any] = {}
    for field_name in fields:
        value = getattr(entity, field_name, None)
        output[field_name] = value.isoformat() if isinstance(value, (date, datetime)) else value

    output["source_document_id"] = getattr(entity, "source_document_id", None)
    output["source_span"] = getattr(entity, "source_span", None)
    output["source_confidence"] = getattr(entity, "source_confidence", None)
    return output


def _as_float(value: Any) -> Optional[float]:
    """Coerce a value to float, returning None when it is not numeric."""
    try:
        return float(value)
    except (TypeError, ValueError):
        return None