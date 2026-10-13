"""
PulseVault AI — HL7 FHIR Release 4 (R4) Serialization Service
Transforms internal clinical models (Patient, Medication, Condition, Allergy, LabResult, Procedure)
into fully compliant HL7 FHIR R4 JSON Bundles using standard ontologies (RxNorm, ICD-10-CM/PCS,
LOINC, SNOMED CT).
"""

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from src.db.models import Allergy, Condition, LabValue, Medication, Patient, Procedure


class FHIRService:
    """Serializes patient clinical profiles into HL7 FHIR Release 4 JSON representations."""

    def export_patient_bundle(self, db: Session, patient: Patient) -> Dict[str, Any]:
        """Convert a patient's complete longitudinal record into an HL7 FHIR R4 Bundle."""
        patient_ref_id = f"patient-{patient.patient_code.lower()}"
        patient_urn = f"urn:uuid:{uuid.uuid5(uuid.NAMESPACE_DNS, f'patient.{patient.patient_code}')}"

        entries: List[Dict[str, Any]] = []

        # 1. Patient Resource
        patient_resource = self._build_patient_resource(patient, patient_ref_id)
        entries.append({
            "fullUrl": patient_urn,
            "resource": patient_resource,
        })

        # 2. Condition Resources
        for condition in patient.conditions:
            cond_urn = f"urn:uuid:{uuid.uuid5(uuid.NAMESPACE_DNS, f'condition.{condition.id}')}"
            entries.append({
                "fullUrl": cond_urn,
                "resource": self._build_condition_resource(condition, patient, patient_ref_id),
            })

        # 3. MedicationStatement Resources
        for med in patient.medications:
            med_urn = f"urn:uuid:{uuid.uuid5(uuid.NAMESPACE_DNS, f'medication.{med.id}')}"
            entries.append({
                "fullUrl": med_urn,
                "resource": self._build_medication_resource(med, patient, patient_ref_id),
            })

        # 4. AllergyIntolerance Resources
        for allergy in patient.allergies:
            allergy_urn = f"urn:uuid:{uuid.uuid5(uuid.NAMESPACE_DNS, f'allergy.{allergy.id}')}"
            entries.append({
                "fullUrl": allergy_urn,
                "resource": self._build_allergy_resource(allergy, patient, patient_ref_id),
            })

        # 5. Observation (Lab Values) Resources
        for lab in patient.lab_values:
            lab_urn = f"urn:uuid:{uuid.uuid5(uuid.NAMESPACE_DNS, f'lab.{lab.id}')}"
            entries.append({
                "fullUrl": lab_urn,
                "resource": self._build_observation_resource(lab, patient, patient_ref_id),
            })

        # 6. Procedure Resources
        for proc in patient.procedures:
            proc_urn = f"urn:uuid:{uuid.uuid5(uuid.NAMESPACE_DNS, f'procedure.{proc.id}')}"
            entries.append({
                "fullUrl": proc_urn,
                "resource": self._build_procedure_resource(proc, patient, patient_ref_id),
            })

        now_utc = datetime.now(timezone.utc).isoformat()
        bundle_id = f"bundle-{patient.patient_code.lower()}"

        return {
            "resourceType": "Bundle",
            "id": bundle_id,
            "meta": {
                "lastUpdated": now_utc,
                "profile": ["http://hl7.org/fhir/StructureDefinition/Bundle"],
            },
            "identifier": {
                "system": "https://pulsevault.ai/fhir/bundles",
                "value": f"BUNDLE-{patient.patient_code}",
            },
            "type": "collection",
            "timestamp": now_utc,
            "total": len(entries),
            "entry": entries,
        }

    def _build_patient_resource(self, patient: Patient, ref_id: str) -> Dict[str, Any]:
        """Generate FHIR R4 Patient resource."""
        name_parts = (patient.full_name or "Unknown Patient").strip().split()
        family = name_parts[-1] if len(name_parts) > 1 else ""
        given = name_parts[:-1] if len(name_parts) > 1 else name_parts

        gender_map = {
            "m": "male",
            "male": "male",
            "f": "female",
            "female": "female",
            "other": "other",
        }
        gender = gender_map.get((patient.sex or "").lower().strip(), "unknown")

        telecom: List[Dict[str, Any]] = []
        if getattr(patient, "contact", None):
            telecom.append({
                "system": "phone",
                "value": patient.contact,
                "use": "mobile",
            })
        if getattr(patient, "emergency_contact", None):
            telecom.append({
                "system": "phone",
                "value": patient.emergency_contact,
                "use": "emergency",
            })

        extensions: List[Dict[str, Any]] = []
        if patient.blood_group:
            extensions.append({
                "url": "http://hl7.org/fhir/StructureDefinition/patient-bloodGroup",
                "valueString": patient.blood_group,
            })

        birth_date = None
        if getattr(patient, "date_of_birth", None):
            birth_date = patient.date_of_birth.isoformat()
        elif getattr(patient, "age", None) is not None:
            approx_year = datetime.now().year - patient.age
            birth_date = f"{approx_year}-01-01"

        return {
            "resourceType": "Patient",
            "id": ref_id,
            "identifier": [
                {
                    "system": "https://pulsevault.ai/fhir/patient-id",
                    "value": patient.patient_code,
                }
            ],
            "active": True,
            "name": [
                {
                    "use": "official",
                    "text": patient.full_name,
                    "family": family,
                    "given": given,
                }
            ],
            "gender": gender,
            "birthDate": birth_date,
            "telecom": telecom,
            "extension": extensions,
        }

    def _build_condition_resource(
        self, condition: Condition, patient: Patient, patient_ref_id: str
    ) -> Dict[str, Any]:
        """Generate FHIR R4 Condition resource."""
        codings: List[Dict[str, Any]] = []
        if condition.icd10_code:
            codings.append({
                "system": "http://hl7.org/fhir/sid/icd-10-cm",
                "code": condition.icd10_code,
                "display": condition.name,
            })
        if condition.snomed_code:
            codings.append({
                "system": "http://snomed.info/sct",
                "code": condition.snomed_code,
                "display": condition.name,
            })
        if not codings:
            codings.append({
                "system": "https://pulsevault.ai/clinical/local-lexicon",
                "code": "UNCODED",
                "display": condition.name,
            })

        clinical_status = "active" if condition.status == "active" else "resolved"

        return {
            "resourceType": "Condition",
            "id": f"condition-{condition.id}",
            "clinicalStatus": {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/condition-clinical",
                        "code": clinical_status,
                    }
                ]
            },
            "verificationStatus": {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/condition-ver-status",
                        "code": "confirmed",
                    }
                ]
            },
            "code": {
                "coding": codings,
                "text": condition.name,
            },
            "subject": {
                "reference": f"Patient/{patient_ref_id}",
                "display": patient.full_name,
            },
            "onsetDateTime": (
                condition.onset_date.isoformat() if getattr(condition, "onset_date", None) else None
            ),
        }

    def _build_medication_resource(
        self, med: Medication, patient: Patient, patient_ref_id: str
    ) -> Dict[str, Any]:
        """Generate FHIR R4 MedicationStatement resource."""
        codings: List[Dict[str, Any]] = []
        if med.rxnorm_code:
            codings.append({
                "system": "http://www.nlm.nih.gov/research/umls/rxnorm",
                "code": med.rxnorm_code,
                "display": med.name,
            })
        else:
            codings.append({
                "system": "https://pulsevault.ai/clinical/local-rx",
                "code": "UNCODED",
                "display": med.name,
            })

        status_val = "active" if med.status == "active" else "stopped"

        dosages: List[Dict[str, Any]] = []
        dose_text = f"{med.dose or ''} {med.dose_unit or ''} {med.frequency or ''} {med.route or ''}".strip()
        dosage_item: Dict[str, Any] = {"text": dose_text or med.name}
        if med.dose is not None:
            dosage_item["doseAndRate"] = [
                {
                    "doseQuantity": {
                        "value": med.dose,
                        "unit": med.dose_unit or "mg",
                        "system": "http://unitsofmeasure.org",
                    }
                }
            ]
        if med.route:
            dosage_item["route"] = {"text": med.route}
        dosages.append(dosage_item)

        effective_period: Dict[str, Optional[str]] = {}
        if med.start_date:
            effective_period["start"] = med.start_date.isoformat()
        if med.end_date:
            effective_period["end"] = med.end_date.isoformat()

        return {
            "resourceType": "MedicationStatement",
            "id": f"medication-{med.id}",
            "status": status_val,
            "medicationCodeableConcept": {
                "coding": codings,
                "text": med.name,
            },
            "subject": {
                "reference": f"Patient/{patient_ref_id}",
                "display": patient.full_name,
            },
            "effectivePeriod": effective_period if effective_period else None,
            "dosage": dosages,
        }

    def _build_allergy_resource(
        self, allergy: Allergy, patient: Patient, patient_ref_id: str
    ) -> Dict[str, Any]:
        """Generate FHIR R4 AllergyIntolerance resource."""
        codings: List[Dict[str, Any]] = []
        if allergy.snomed_code:
            codings.append({
                "system": "http://snomed.info/sct",
                "code": allergy.snomed_code,
                "display": allergy.substance,
            })
        else:
            codings.append({
                "system": "https://pulsevault.ai/clinical/local-allergies",
                "code": "UNCODED",
                "display": allergy.substance,
            })

        criticality = (
            "high" if (allergy.severity or "").lower() in ("critical", "severe") else "low"
        )

        reactions: List[Dict[str, Any]] = []
        if allergy.reaction:
            reactions.append({
                "manifestation": [{"text": allergy.reaction}],
                "severity": "severe" if criticality == "high" else "moderate",
            })

        return {
            "resourceType": "AllergyIntolerance",
            "id": f"allergy-{allergy.id}",
            "clinicalStatus": {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical",
                        "code": "active",
                    }
                ]
            },
            "verificationStatus": {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/allergyintolerance-verification",
                        "code": "confirmed",
                    }
                ]
            },
            "criticality": criticality,
            "code": {
                "coding": codings,
                "text": allergy.substance,
            },
            "patient": {
                "reference": f"Patient/{patient_ref_id}",
                "display": patient.full_name,
            },
            "reaction": reactions,
        }

    def _build_observation_resource(
        self, lab: LabValue, patient: Patient, patient_ref_id: str
    ) -> Dict[str, Any]:
        """Generate FHIR R4 Observation resource for a laboratory measurement."""
        codings: List[Dict[str, Any]] = []
        if lab.loinc_code:
            codings.append({
                "system": "http://loinc.org",
                "code": lab.loinc_code,
                "display": lab.test_name,
            })
        else:
            codings.append({
                "system": "https://pulsevault.ai/clinical/local-loinc",
                "code": "UNCODED",
                "display": lab.test_name,
            })

        res: Dict[str, Any] = {
            "resourceType": "Observation",
            "id": f"lab-{lab.id}",
            "status": "final",
            "category": [
                {
                    "coding": [
                        {
                            "system": "http://terminology.hl7.org/CodeSystem/observation-category",
                            "code": "laboratory",
                            "display": "Laboratory",
                        }
                    ]
                }
            ],
            "code": {
                "coding": codings,
                "text": lab.test_name,
            },
            "subject": {
                "reference": f"Patient/{patient_ref_id}",
                "display": patient.full_name,
            },
            "effectiveDateTime": lab.collected_date.isoformat() if lab.collected_date else None,
        }

        if lab.value is not None:
            res["valueQuantity"] = {
                "value": lab.value,
                "unit": lab.unit or "",
                "system": "http://unitsofmeasure.org",
            }
        elif lab.value_text:
            res["valueString"] = lab.value_text

        if lab.ref_low is not None or lab.ref_high is not None:
            range_entry: Dict[str, Any] = {}
            if lab.ref_low is not None:
                range_entry["low"] = {"value": lab.ref_low, "unit": lab.unit or ""}
            if lab.ref_high is not None:
                range_entry["high"] = {"value": lab.ref_high, "unit": lab.unit or ""}
            res["referenceRange"] = [range_entry]

        if lab.flag:
            flag_code = "H" if lab.flag.lower() == "high" else ("L" if lab.flag.lower() == "low" else "N")
            res["interpretation"] = [
                {
                    "coding": [
                        {
                            "system": "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation",
                            "code": flag_code,
                            "display": lab.flag.capitalize(),
                        }
                    ]
                }
            ]

        return res

    def _build_procedure_resource(
        self, proc: Procedure, patient: Patient, patient_ref_id: str
    ) -> Dict[str, Any]:
        """Generate FHIR R4 Procedure resource."""
        codings: List[Dict[str, Any]] = []
        is_icd10pcs = proc.snomed_code and len(proc.snomed_code) == 7
        if is_icd10pcs:
            codings.append({
                "system": "http://hl7.org/fhir/sid/icd-10-pcs",
                "code": proc.snomed_code,
                "display": proc.name,
            })
        elif proc.snomed_code:
            codings.append({
                "system": "http://snomed.info/sct",
                "code": proc.snomed_code,
                "display": proc.name,
            })
        else:
            codings.append({
                "system": "https://pulsevault.ai/clinical/local-procedures",
                "code": "UNCODED",
                "display": proc.name,
            })

        return {
            "resourceType": "Procedure",
            "id": f"procedure-{proc.id}",
            "status": "completed",
            "code": {
                "coding": codings,
                "text": proc.name,
            },
            "subject": {
                "reference": f"Patient/{patient_ref_id}",
                "display": patient.full_name,
            },
            "performedDateTime": (
                proc.performed_date.isoformat() if proc.performed_date else None
            ),
        }
