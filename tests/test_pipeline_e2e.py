"""
End-to-end pipeline test: ingest real synthetic PDFs through the API and assert the
five agents produce a correct profile, safety alerts, and emergency flashcard.
"""

import pytest
from sqlalchemy import select

from src.db.models import Condition, EmergencyFlashcard, Patient, SafetyAlert


def _upload(client, corpus_dir, filename, patient_code, patient_name):
    path = corpus_dir / filename
    with path.open("rb") as handle:
        response = client.post(
            "/api/records",
            files={"file": (filename, handle.read(), "application/pdf")},
            data={"patient_code": patient_code, "patient_name": patient_name},
        )
    assert response.status_code == 201, response.text
    return response.json()


def test_full_pipeline_for_high_risk_patient(client, corpus_dir, db):
    """The maximum-alert record must surface every critical safety finding."""
    upload = _upload(client, corpus_dir, "SH-2048_prescription.pdf", "SH-2048", "Lakshmi Devi")
    assert upload["patient_code"] == "SH-2048"

    profile = client.get("/api/patients/SH-2048/profile")
    assert profile.status_code == 200
    body = profile.json()

    assert body["patient"]["full_name"] == "Lakshmi Devi"
    assert body["patient"]["age"] == 64

    condition_names = {item["name"] for item in body["conditions"]}
    assert "Atrial Fibrillation" in condition_names
    assert "Chronic Kidney Disease" in condition_names
    assert "Peptic Ulcer Disease" in condition_names

    medication_names = {item["name"] for item in body["medications"]}
    assert {"Warfarin", "Aspirin", "Sertraline", "Metformin"} <= medication_names

    allergy_substances = {item["substance"] for item in body["allergies"]}
    assert "Penicillin" in allergy_substances

    assert len(body["timeline"]) > 0


def test_safety_alerts_fire_for_high_risk_patient(client, corpus_dir, db):
    """Aspirin + warfarin, penicillin allergy + amoxicillin, and CKD + metformin must all alert."""
    _upload(client, corpus_dir, "SH-2048_prescription.pdf", "SH-2048", "Lakshmi Devi")

    patient = db.scalar(select(Patient).where(Patient.patient_code == "SH-2048"))
    assert patient is not None

    alerts = db.scalars(select(SafetyAlert).where(SafetyAlert.patient_id == patient.id)).all()
    titles = [alert.title for alert in alerts]
    rendered = " | ".join(titles)

    assert any("Aspirin" in title and "Warfarin" in title for title in titles), rendered
    assert any("penicillin" in title.lower() for title in titles), rendered
    assert any("Metformin" in title and "kidney" in title.lower() for title in titles), rendered
    assert any(alert.severity == "critical" for alert in alerts), rendered

    # Every finding must be independently identifiable, so no two titles may repeat.
    assert len(titles) == len(set(titles)), rendered


def test_emergency_flashcard_is_computed_and_cached(client, corpus_dir, db):
    """The flashcard must build on first access and be served from cache thereafter."""
    _upload(client, corpus_dir, "SH-2048_prescription.pdf", "SH-2048", "Lakshmi Devi")

    first = client.get("/api/patients/SH-2048/flashcard")
    assert first.status_code == 200
    body = first.json()

    assert body["patient_code"] == "SH-2048"
    assert body["full_name"] == "Lakshmi Devi"

    badges = {badge["label"]: badge for badge in body["badges"]}
    assert "Critical Alerts" in badges
    assert "Severe Allergies" in badges
    assert "Blood Group" in badges

    assert "Atrial Fibrillation" in body["critical_conditions"]
    assert any(item["substance"] == "Penicillin" for item in body["severe_allergies"])

    # The pipeline already cached it during ingestion, so the first read is a cache hit.
    assert body["retrieval"]["cache_hit"] is True
    assert body["retrieval"]["target_ms"] == 3000


def test_flashcard_version_increments_on_reingest(client, corpus_dir, db):
    """Re-ingesting a document must bump the cached flashcard version."""
    _upload(client, corpus_dir, "SH-2048_prescription.pdf", "SH-2048", "Lakshmi Devi")
    before = client.get("/api/patients/SH-2048/flashcard").json()

    _upload(client, corpus_dir, "SH-2048_lab_report.pdf", "SH-2048", "Lakshmi Devi")
    after = client.get("/api/patients/SH-2048/flashcard").json()

    assert after["version"] > before["version"]
    assert after["record_count"] == 2


def test_stopped_medication_is_superseded_not_deleted(client, corpus_dir, db):
    """A stopped drug must be dated and excluded from the active list."""
    _upload(client, corpus_dir, "SH-3072_discharge_summary.pdf", "SH-3072", "Ananya Iyer")

    profile = client.get("/api/patients/SH-3072/profile").json()
    active_names = {item["name"] for item in profile["medications"]}

    assert "Ferrous Sulphate" not in active_names
    assert "Paracetamol" in active_names

    from src.db.models import Medication

    patient_id = select(Patient.id).where(Patient.patient_code == "SH-3072").scalar_subquery()
    ferrous = db.scalar(
        select(Medication).where(
            Medication.patient_id == patient_id,
            Medication.name == "Ferrous Sulphate",
        )
    )
    assert ferrous is not None, "stopped medication must be retained for the longitudinal history"
    assert ferrous.status == "stopped"
    assert ferrous.end_date is not None


def test_lab_values_are_extracted_with_units(client, corpus_dir, db):
    """Lab rows must survive extraction with value, unit, and LOINC mapping."""
    _upload(client, corpus_dir, "SH-1024_lab_report.pdf", "SH-1024", "Ramesh Kumar")

    profile = client.get("/api/patients/SH-1024/profile").json()
    labs = {item["test_name"]: item for item in profile["lab_values"]}

    assert "HbA1c" in labs
    assert labs["HbA1c"]["value"] == pytest.approx(8.2)
    assert labs["HbA1c"]["unit"] == "%"
    assert labs["HbA1c"]["loinc_code"], "HbA1c must map to a LOINC code"


def test_multiple_documents_consolidate_into_one_patient(client, corpus_dir, db):
    """Two documents for the same code must resolve to a single patient record."""
    _upload(client, corpus_dir, "SH-1024_discharge_summary.pdf", "SH-1024", "Ramesh Kumar")
    _upload(client, corpus_dir, "SH-1024_lab_report.pdf", "SH-1024", "Ramesh Kumar")

    patients = db.scalars(select(Patient).where(Patient.patient_code == "SH-1024")).all()
    assert len(patients) == 1

    profile = client.get("/api/patients/SH-1024/profile").json()
    assert profile["record_count"] == 2

    condition_names = {item["name"] for item in profile["conditions"]}
    medication_names = {item["name"] for item in profile["medications"]}
    assert "Type 2 Diabetes Mellitus" in condition_names
    assert "Metformin" in medication_names


def test_patient_search_filters_by_code(client, corpus_dir, db):
    """The dashboard search must match on both name and patient code."""
    _upload(client, corpus_dir, "SH-1024_discharge_summary.pdf", "SH-1024", "Ramesh Kumar")
    _upload(client, corpus_dir, "SH-2048_prescription.pdf", "SH-2048", "Lakshmi Devi")

    all_patients = client.get("/api/patients").json()
    assert len(all_patients) == 2

    by_code = client.get("/api/patients", params={"search": "SH-2048"}).json()
    assert len(by_code) == 1
    assert by_code[0]["patient_code"] == "SH-2048"

    by_name = client.get("/api/patients", params={"search": "Ramesh"}).json()
    assert len(by_name) == 1
    assert by_name[0]["patient_code"] == "SH-1024"


def test_pipeline_endpoint_reports_all_stages(client, corpus_dir, db):
    """The pipeline breakdown endpoint must report every stage complete."""
    upload = _upload(client, corpus_dir, "SH-1024_discharge_summary.pdf", "SH-1024", "Ramesh Kumar")

    result = client.get(f"/api/pipeline/{upload['document_id']}")
    assert result.status_code == 200
    body = result.json()

    assert len(body["steps"]) == 7
    assert all(step["status"] == "complete" for step in body["steps"])
    assert body["entities_extracted"] > 0
    assert body["normalized_count"] > 0


def test_flashcard_row_persisted_for_caching(client, corpus_dir, db):
    """The flashcard must be stored as a cached row, not recomputed per request."""
    _upload(client, corpus_dir, "SH-1024_discharge_summary.pdf", "SH-1024", "Ramesh Kumar")

    patient = db.scalar(select(Patient).where(Patient.patient_code == "SH-1024"))
    record = db.scalar(
        select(EmergencyFlashcard).where(EmergencyFlashcard.patient_id == patient.id)
    )
    assert record is not None
    assert record.version >= 1
    assert "Ramesh Kumar" in record.payload_json


def test_conditions_persist_chronology(client, corpus_dir, db):
    """Conditions must be stored with their onset dates intact."""
    _upload(client, corpus_dir, "SH-1024_discharge_summary.pdf", "SH-1024", "Ramesh Kumar")

    patient = db.scalar(select(Patient).where(Patient.patient_code == "SH-1024"))
    conditions = db.scalars(select(Condition).where(Condition.patient_id == patient.id)).all()

    by_name = {condition.name: condition for condition in conditions}
    assert by_name["Type 2 Diabetes Mellitus"].onset_date.isoformat() == "2019-06-14"
    assert by_name["Type 2 Diabetes Mellitus"].icd10_code
