"""
SynapseHealth — Agent 5: Emergency Flashcard Generator
Assembles the precomputed critical-patient summary shown to a clinician during an
emergency. The flashcard is computed once when a record finishes processing and cached,
so retrieval at the bedside is a single indexed read rather than a re-analysis.
"""

import json
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.db.models import (
    Allergy,
    Condition,
    EmergencyFlashcard,
    Implant,
    Medication,
    Patient,
    SafetyAlert,
    SourceDocument,
)
from src.engine import safety_rules as rules

# A condition counts as critical when it changes immediate resuscitation, airway
# management, or drug selection. The list is fixed and version-controlled, not inferred.
CRITICAL_CONDITIONS: frozenset = frozenset(
    {
        "myocardial infarction",
        "stroke",
        "atrial fibrillation",
        "heart failure",
        "coronary artery disease",
        "chronic kidney disease",
        "type 1 diabetes mellitus",
        "type 2 diabetes mellitus",
        "diabetes mellitus",
        "severe asthma",
        "chronic obstructive pulmonary disease",
        "epilepsy",
        "anaemia",
        "sepsis",
        "tuberculosis",
        "peptic ulcer disease",
        "thyroid disorder",
        "hypothyroidism",
        "hyperthyroidism",
    }
)


@dataclass
class FlashcardBadge:
    """A single critical datum rendered as a badge on the flashcard."""

    label: str
    value: str
    severity: str = "info"
    detail: Optional[str] = None

    def as_dict(self) -> Dict[str, Any]:
        return {
            "label": self.label,
            "value": self.value,
            "severity": self.severity,
            "detail": self.detail,
        }


@dataclass
class EmergencyFlashcardPayload:
    """The complete cached emergency summary for one patient."""

    patient_code: str
    full_name: str
    age: Optional[int]
    sex: Optional[str]
    badges: List[FlashcardBadge] = field(default_factory=list)
    critical_conditions: List[str] = field(default_factory=list)
    active_medications: List[Dict[str, Any]] = field(default_factory=list)
    severe_allergies: List[Dict[str, Any]] = field(default_factory=list)
    implants: List[str] = field(default_factory=list)
    top_alerts: List[Dict[str, Any]] = field(default_factory=list)
    record_count: int = 0
    version: int = 1
    computed_at: Optional[str] = None

    def as_dict(self) -> Dict[str, Any]:
        return {
            "patient_code": self.patient_code,
            "full_name": self.full_name,
            "age": self.age,
            "sex": self.sex,
            "badges": [badge.as_dict() for badge in self.badges],
            "critical_conditions": self.critical_conditions,
            "active_medications": self.active_medications,
            "severe_allergies": self.severe_allergies,
            "implants": self.implants,
            "top_alerts": self.top_alerts,
            "record_count": self.record_count,
            "version": self.version,
            "computed_at": self.computed_at,
        }


class FlashcardAgent:
    """Builds and caches the emergency flashcard for a patient."""

    def compute(self, db: Session, patient: Patient) -> EmergencyFlashcardPayload:
        """Compute the flashcard from the current profile and cache the result."""
        payload = self.build_payload(db, patient)

        record = db.scalar(
            select(EmergencyFlashcard).where(EmergencyFlashcard.patient_id == patient.id)
        )
        serialized = json.dumps(payload.as_dict(), default=str)

        if record is None:
            record = EmergencyFlashcard(
                patient_id=patient.id, payload_json=serialized, version=1
            )
            db.add(record)
        else:
            record.payload_json = serialized
            record.version = (record.version or 0) + 1

        db.flush()
        payload.version = record.version
        return payload

    def retrieve(self, db: Session, patient: Patient) -> Optional[Dict[str, Any]]:
        """Read the cached flashcard without recomputing it."""
        record = db.scalar(
            select(EmergencyFlashcard).where(EmergencyFlashcard.patient_id == patient.id)
        )
        if record is None:
            return None

        try:
            payload = json.loads(record.payload_json)
        except json.JSONDecodeError:
            return None

        payload["version"] = record.version
        return payload

    def build_payload(self, db: Session, patient: Patient) -> EmergencyFlashcardPayload:
        """Assemble the flashcard from the consolidated clinical profile."""
        conditions = list(
            db.scalars(select(Condition).where(Condition.patient_id == patient.id)).all()
        )
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
        implants = list(
            db.scalars(select(Implant).where(Implant.patient_id == patient.id)).all()
        )
        alerts = list(
            db.scalars(select(SafetyAlert).where(SafetyAlert.patient_id == patient.id)).all()
        )
        record_count = db.scalar(
            select(func.count(SourceDocument.id)).where(
                SourceDocument.patient_id == patient.id
            )
        ) or 0

        critical_conditions = sorted(
            {
                condition.name
                for condition in conditions
                if condition.status == "active"
                and _is_critical(condition.name)
            }
        )

        severe_allergies = [
            {
                "substance": allergy.substance,
                "reaction": allergy.reaction,
                "severity": allergy.severity,
                "snomed_code": allergy.snomed_code,
            }
            for allergy in allergies
            if allergy.severity in ("severe", "moderate")
        ]

        payload = EmergencyFlashcardPayload(
            patient_code=patient.patient_code,
            full_name=patient.full_name,
            age=patient.age,
            sex=patient.sex,
            critical_conditions=critical_conditions,
            active_medications=[
                {
                    "name": medication.name,
                    "dose": _dose_text(medication),
                    "frequency": medication.frequency,
                    "route": medication.route,
                    "rxnorm_code": medication.rxnorm_code,
                }
                for medication in medications
            ],
            severe_allergies=severe_allergies,
            implants=[implant.name for implant in implants],
            top_alerts=[
                {
                    "severity": alert.severity,
                    "category": alert.category,
                    "title": alert.title,
                    "recommendation": alert.recommendation,
                }
                for alert in sorted(
                    alerts, key=lambda alert: _severity_rank(alert.severity)
                )[:5]
            ],
            record_count=record_count,
            computed_at=datetime.utcnow().isoformat() + "Z",
        )

        payload.badges = self._build_badges(patient, medications, severe_allergies, implants, alerts)
        return payload

    def _build_badges(
        self,
        patient: Patient,
        medications: List[Medication],
        severe_allergies: List[Dict[str, Any]],
        implants: List[Any],
        alerts: List[SafetyAlert],
    ) -> List[FlashcardBadge]:
        """Build the badge strip shown at the top of the flashcard."""
        badges: List[FlashcardBadge] = []

        badges.append(
            FlashcardBadge(
                label="Blood Group",
                value=patient.blood_group or "Unknown",
                severity="critical" if patient.blood_group else "unknown",
                detail="Not recorded in any ingested document" if not patient.blood_group else None,
            )
        )

        critical_alerts = [
            alert for alert in alerts if alert.severity == rules.CRITICAL
        ]
        badges.append(
            FlashcardBadge(
                label="Critical Alerts",
                value=str(len(critical_alerts)),
                severity="critical" if critical_alerts else "clear",
                detail=critical_alerts[0].title if critical_alerts else "No critical interactions detected",
            )
        )

        badges.append(
            FlashcardBadge(
                label="Severe Allergies",
                value=", ".join(item["substance"] for item in severe_allergies) or "None recorded",
                severity="critical" if severe_allergies else "clear",
                detail=(
                    severe_allergies[0]["reaction"] if severe_allergies and severe_allergies[0]["reaction"] else None
                ),
            )
        )

        badges.append(
            FlashcardBadge(
                label="Active Implants",
                value=", ".join(implant.name for implant in implants) or "None recorded",
                severity="caution" if implants else "clear",
            )
        )

        badges.append(
            FlashcardBadge(
                label="Active Medications",
                value=str(len(medications)),
                severity="info",
                detail=", ".join(medication.name for medication in medications[:6]),
            )
        )

        return badges


def _is_critical(condition_name: str) -> bool:
    """Return True when a condition belongs on the critical-conditions list."""
    lowered = " ".join(str(condition_name or "").lower().split())
    return any(marker in lowered for marker in CRITICAL_CONDITIONS)


def _dose_text(medication: Medication) -> str:
    """Render a medication dose, for example "500 mg"."""
    if medication.dose is None:
        return ""
    unit = medication.dose_unit or ""
    dose = f"{medication.dose:g}" if isinstance(medication.dose, float) else str(medication.dose)
    return f"{dose}{unit}"


def _severity_rank(severity: str) -> int:
    """Order alert severities from most to least urgent."""
    return {rules.CRITICAL: 0, rules.HIGH: 1, rules.MODERATE: 2}.get(severity, 3)