"""
SynapseHealth — Agent 4: Safety & Interaction Guardrail
Runs the deterministic rule tables in ``engine.safety_rules`` against a patient's
consolidated profile and persists the resulting alerts.

CRITICAL RULE: This agent never consults a language model to reach a verdict. The
extraction agent may be wrong; the rules are fixed, versioned, and reproducible, so
the same profile always yields the same alerts and every alert names the rule that
produced it.
"""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from src.db.models import Allergy, Condition, Medication, Patient, SafetyAlert
from src.engine import safety_rules as rules
from src.services.drug_lookup_service import DrugLookupService


@dataclass
class SafetyFinding:
    """One rule firing, before it is written to the alert table."""

    identifier: str
    severity: str
    category: str
    title: str
    detail: str
    involved: List[str] = field(default_factory=list)
    recommendation: str = ""
    evidence: str = ""

    def as_dict(self) -> Dict[str, Any]:
        return {
            "id": self.identifier,
            "severity": self.severity,
            "category": self.category,
            "title": self.title,
            "detail": self.detail,
            "involved": self.involved,
            "recommendation": self.recommendation,
            "evidence": self.evidence,
        }


@dataclass
class SafetyReport:
    """The full outcome of one safety evaluation run."""

    findings: List[SafetyFinding] = field(default_factory=list)
    medications_evaluated: int = 0
    pairs_evaluated: int = 0
    allergies_evaluated: int = 0
    conditions_evaluated: int = 0

    @property
    def critical_count(self) -> int:
        return sum(1 for f in self.findings if f.severity == rules.CRITICAL)

    @property
    def high_count(self) -> int:
        return sum(1 for f in self.findings if f.severity == rules.HIGH)

    def as_dict(self) -> Dict[str, Any]:
        return {
            "total_findings": len(self.findings),
            "critical": self.critical_count,
            "high": self.high_count,
            "moderate": sum(1 for f in self.findings if f.severity == rules.MODERATE),
            "medications_evaluated": self.medications_evaluated,
            "pairs_evaluated": self.pairs_evaluated,
            "allergies_evaluated": self.allergies_evaluated,
            "conditions_evaluated": self.conditions_evaluated,
            "findings": [finding.as_dict() for finding in self.findings],
        }


class SafetyAgent:
    """Evaluates allergies, interactions, contraindications, and duplicate therapy."""

    def __init__(self, terminology: Optional[DrugLookupService] = None):
        self.terminology = terminology or DrugLookupService()

    def evaluate(self, db: Session, patient: Patient, persist: bool = True) -> SafetyReport:
        """Evaluate every rule against the patient's profile and optionally persist alerts."""
        report = SafetyReport()

        medications = list(
            db.scalars(
                select(Medication)
                .where(Medication.patient_id == patient.id, Medication.status == "active")
                .order_by(Medication.name)
            ).all()
        )
        allergies = list(
            db.scalars(select(Allergy).where(Allergy.patient_id == patient.id)).all()
        )
        conditions = list(
            db.scalars(
                select(Condition)
                .where(Condition.patient_id == patient.id, Condition.status == "active")
            ).all()
        )

        report.medications_evaluated = len(medications)
        report.allergies_evaluated = len(allergies)
        report.conditions_evaluated = len(conditions)

        report.findings.extend(self._allergy_findings(medications, allergies))
        report.findings.extend(self._interaction_findings(medications, report))
        report.findings.extend(self._contraindication_findings(medications, conditions))
        report.findings.extend(self._duplicate_findings(medications))

        report.findings = self._dedupe(report.findings)
        report.findings.sort(key=_severity_rank)

        if persist:
            self._persist(db, patient, report.findings)

        return report

    def _allergy_findings(
        self, medications: List[Medication], allergies: List[Allergy]
    ) -> List[SafetyFinding]:
        """Flag any active medication that hits a recorded allergy."""
        findings: List[SafetyFinding] = []

        for allergy in allergies:
            reaction_note = _reaction_note(allergy)
            for medication in medications:
                for hit in rules.find_allergy_hits(allergy.substance, medication.name):
                    if reaction_note:
                        hit.detail = f"{hit.detail} {reaction_note}"
                    findings.append(_to_finding(hit, hit.evidence))

        return findings

    def _interaction_findings(
        self, medications: List[Medication], report: SafetyReport
    ) -> List[SafetyFinding]:
        """Flag every pairwise interaction among active medications."""
        findings: List[SafetyFinding] = []

        for index, first in enumerate(medications):
            for second in medications[index + 1 :]:
                report.pairs_evaluated += 1
                for hit in rules.find_interaction_hits(first.name, second.name):
                    findings.append(_to_finding(hit, hit.evidence))

        return findings

    def _contraindication_findings(
        self, medications: List[Medication], conditions: List[Condition]
    ) -> List[SafetyFinding]:
        """Flag drugs whose condition context makes them unsafe."""
        findings: List[SafetyFinding] = []
        condition_names = [condition.name for condition in conditions]

        for medication in medications:
            for hit in rules.find_contraindication_hits(medication.name, condition_names):
                findings.append(_to_finding(hit, hit.evidence))

        return findings

    def _duplicate_findings(self, medications: List[Medication]) -> List[SafetyFinding]:
        """Flag therapeutic duplication across the active medication list."""
        return [
            _to_finding(hit, hit.evidence)
            for hit in rules.find_duplicate_therapy_hits(
                [medication.name for medication in medications]
            )
        ]

    def _persist(
        self, db: Session, patient: Patient, findings: List[SafetyFinding]
    ) -> None:
        """Replace the patient's stored alerts with this run's findings."""
        db.execute(delete(SafetyAlert).where(SafetyAlert.patient_id == patient.id))

        for finding in findings:
            db.add(
                SafetyAlert(
                    patient_id=patient.id,
                    severity=finding.severity,
                    category=finding.category,
                    title=finding.title,
                    detail=finding.detail,
                    involved=", ".join(finding.involved),
                    recommendation=finding.recommendation,
                )
            )

        db.flush()

    @staticmethod
    def _dedupe(findings: List[SafetyFinding]) -> List[SafetyFinding]:
        """Collapse findings that share an identifier and the same set of involved entities."""
        seen: set = set()
        output: List[SafetyFinding] = []

        for finding in findings:
            marker = (finding.identifier, tuple(sorted(item.lower() for item in finding.involved)))
            if marker in seen:
                continue
            seen.add(marker)
            output.append(finding)

        return output


def _to_finding(hit: rules.MatchedRule, evidence: str) -> SafetyFinding:
    """Convert a matched rule into a finding."""
    return SafetyFinding(
        identifier=hit.identifier,
        severity=hit.severity,
        category=hit.category,
        title=hit.title,
        detail=hit.detail,
        involved=list(hit.involved),
        recommendation=hit.recommendation,
        evidence=evidence or hit.evidence,
    )


def _reaction_note(allergy: Allergy) -> str:
    """Return an evidence note naming the reaction recorded against an allergy."""
    reaction = (allergy.reaction or "").strip()
    if not reaction:
        return ""
    return f"Recorded reaction to {allergy.substance}: {reaction}."


def _severity_rank(finding: SafetyFinding) -> tuple:
    """Sort findings by descending severity, then category, then title."""
    order = {rules.CRITICAL: 0, rules.HIGH: 1, rules.MODERATE: 2, "low": 3}
    return (order.get(finding.severity, 4), finding.category, finding.title)