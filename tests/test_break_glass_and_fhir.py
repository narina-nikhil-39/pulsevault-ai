"""
Tests for Break-Glass Dual-Signature Protocol, Cryptographic Audit Hash Chaining,
and HL7 FHIR Release 4 JSON Export Engine.
"""

from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict

import jwt
import pytest
from fastapi.testclient import TestClient

from app.auth import _SECRET_KEY
from app.break_glass import (
    GENESIS_HASH,
    BreakGlassAuthorizationError,
    create_ephemeral_token,
    record_break_glass_block,
    validate_dual_authorization,
    verify_audit_chain,
)
from app.main import app
from src.db.models import (
    Allergy,
    AuditChainBlock,
    Condition,
    LabValue,
    Medication,
    Patient,
    Procedure,
)


@pytest.fixture
def sample_patient(db):
    """Seed a rich clinical patient record with all entity types."""
    patient = db.query(Patient).filter(Patient.patient_code == "BG-TEST-01").first()
    if patient:
        return patient

    patient = Patient(
        patient_code="BG-TEST-01",
        full_name="Rajesh V. Patel",
        age=48,
        sex="male",
        blood_group="O+",
        contact="+91-9876543210",
        emergency_contact="Sunita Patel (+91-9876543210)",
    )
    db.add(patient)
    db.flush()

    cond = Condition(
        patient_id=patient.id,
        name="Type 2 Diabetes Mellitus",
        icd10_code="E11.9",
        status="active",
        onset_date=date(2021, 3, 10),
    )
    med = Medication(
        patient_id=patient.id,
        name="Metformin Hydrochloride 500 MG",
        rxnorm_code="860975",
        dose=500.0,
        dose_unit="mg",
        frequency="twice daily",
        route="oral",
        status="active",
        start_date=date(2021, 3, 11),
    )
    allergy = Allergy(
        patient_id=patient.id,
        substance="Penicillin",
        snomed_code="764146007",
        reaction="Anaphylaxis and urticaria",
        severity="critical",
    )
    lab = LabValue(
        patient_id=patient.id,
        test_name="Creatinine [Mass/volume] in Serum",
        loinc_code="2160-0",
        value=1.4,
        unit="mg/dL",
        ref_low=0.7,
        ref_high=1.3,
        flag="high",
        collected_date=date(2026, 4, 1),
    )
    proc = Procedure(
        patient_id=patient.id,
        name="Coronary Angiography",
        snomed_code="B2111ZZ",  # Valid 7-character ICD-10-PCS
        performed_date=date(2022, 11, 20),
        outcome="Successful stent placement",
    )

    db.add_all([cond, med, allergy, lab, proc])
    db.commit()
    db.refresh(patient)
    return patient


# ---------------------------------------------------------------------------
# Unit Tests: Dual-Signature Authorization
# ---------------------------------------------------------------------------


def test_dual_auth_rejects_same_physician_and_nurse():
    """Attending doctor and co-signing nurse cannot be the same user ID."""
    with pytest.raises(BreakGlassAuthorizationError) as exc_info:
        validate_dual_authorization(
            doctor_license_id="DR-001",
            doctor_password="demo1234",
            nurse_cosigner_id="DR-001",
            nurse_password="demo1234",
            clinical_reason_code="TRAUMA_UNCONSCIOUS",
        )
    assert "distinct clinicians" in str(exc_info.value)


def test_dual_auth_rejects_invalid_doctor_credentials():
    """Wrong doctor password must fail closed."""
    with pytest.raises(BreakGlassAuthorizationError) as exc_info:
        validate_dual_authorization(
            doctor_license_id="DR-001",
            doctor_password="wrong-password",
            nurse_cosigner_id="RN-001",
            nurse_password="nurse1234",
            clinical_reason_code="TRAUMA_UNCONSCIOUS",
        )
    assert "doctor credentials" in str(exc_info.value).lower()


def test_dual_auth_rejects_invalid_nurse_credentials():
    """Wrong nurse password must fail closed."""
    with pytest.raises(BreakGlassAuthorizationError) as exc_info:
        validate_dual_authorization(
            doctor_license_id="DR-001",
            doctor_password="demo1234",
            nurse_cosigner_id="RN-001",
            nurse_password="wrong-nurse-password",
            clinical_reason_code="TRAUMA_UNCONSCIOUS",
        )
    assert "nurse credentials" in str(exc_info.value).lower()


def test_dual_auth_rejects_invalid_reason_code():
    """Unrecognized clinical justification code must be rejected."""
    with pytest.raises(BreakGlassAuthorizationError) as exc_info:
        validate_dual_authorization(
            doctor_license_id="DR-001",
            doctor_password="demo1234",
            nurse_cosigner_id="RN-001",
            nurse_password="nurse1234",
            clinical_reason_code="INVALID_REASON_CODE",
        )
    assert "Invalid clinical reason code" in str(exc_info.value)


def test_dual_auth_succeeds_with_valid_credentials():
    """Valid doctor and nurse credentials return approval metadata."""
    auth_info = validate_dual_authorization(
        doctor_license_id="DR-001",
        doctor_password="demo1234",
        nurse_cosigner_id="RN-001",
        nurse_password="nurse1234",
        clinical_reason_code="TRAUMA_UNCONSCIOUS",
    )
    assert auth_info["doctor"]["display_name"] == "Dr. Ananya Rao"
    assert auth_info["nurse"]["display_name"] == "Nurse Sarah Jenkins"
    assert "unconscious" in auth_info["reason_description"].lower()


# ---------------------------------------------------------------------------
# API Tests: Break-Glass Execution & Ephemeral Token
# ---------------------------------------------------------------------------


def test_break_glass_api_rejects_nonexistent_patient(client):
    """Break-Glass on an unknown patient returns 404."""
    response = client.post(
        "/api/emergency/break-glass",
        json={
            "patient_code": "UNKNOWN-9999",
            "doctor_id": "DR-001",
            "doctor_password": "demo1234",
            "nurse_cosigner_id": "RN-001",
            "nurse_password": "nurse1234",
            "clinical_reason_code": "TRAUMA_UNCONSCIOUS",
            "justification_notes": "Emergency test override.",
        },
    )
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


def test_break_glass_api_success_and_ephemeral_token(client, sample_patient):
    """Break-Glass on a valid patient issues a 60m token and records a cryptographic block."""
    response = client.post(
        "/api/emergency/break-glass",
        json={
            "patient_code": sample_patient.patient_code,
            "doctor_id": "DR-001",
            "doctor_password": "demo1234",
            "nurse_cosigner_id": "RN-001",
            "nurse_password": "nurse1234",
            "clinical_reason_code": "TRAUMA_UNCONSCIOUS",
            "justification_notes": "Unconscious trauma victim, blunt thoracic injury, no relatives.",
        },
    )
    assert response.status_code == 200
    data = response.json()

    assert data["token_type"] == "bearer"
    assert data["scope"] == "emergency:flashcard:read"
    assert data["expires_in"] == 3600
    assert data["patient_code"] == sample_patient.patient_code
    assert data["doctor_id"] == "DR-001"
    assert data["nurse_cosigner_id"] == "RN-001"
    assert len(data["audit_block_hash"]) == 64

    # Verify the ephemeral token can be used to read the emergency flashcard
    ephemeral_token = data["access_token"]
    flashcard_res = client.get(
        f"/api/patients/{sample_patient.patient_code}/flashcard",
        headers={"Authorization": f"Bearer {ephemeral_token}"},
    )
    assert flashcard_res.status_code == 200
    flashcard = flashcard_res.json()
    assert flashcard["patient_code"] == sample_patient.patient_code
    assert flashcard["full_name"] == sample_patient.full_name
    assert any(b.get("label") == "Blood Group" and b.get("value") == "O+" for b in flashcard.get("badges", []))


def test_break_glass_expired_token_is_rejected(client, sample_patient):
    """An expired ephemeral emergency token must fail with 401."""
    # Mint token that expired 10 minutes ago
    expired_token = create_ephemeral_token(
        doctor_id="DR-001",
        nurse_cosigner_id="RN-001",
        patient_code=sample_patient.patient_code,
        clinical_reason_code="TRAUMA_UNCONSCIOUS",
        expires_in=-600,
    )

    response = client.get(
        f"/api/patients/{sample_patient.patient_code}/flashcard",
        headers={"Authorization": f"Bearer {expired_token}"},
    )
    assert response.status_code == 401
    assert "expired" in response.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Cryptographic Audit Hash-Chain Integrity Tests
# ---------------------------------------------------------------------------


def test_cryptographic_audit_chain_sequential_integrity(client, db, sample_patient):
    """Verify consecutive break-glass events produce a verifiable SHA-256 block chain."""
    # Run two separate break-glass events
    res1 = client.post(
        "/api/emergency/break-glass",
        json={
            "patient_code": sample_patient.patient_code,
            "doctor_id": "DR-001",
            "doctor_password": "demo1234",
            "nurse_cosigner_id": "RN-001",
            "nurse_password": "nurse1234",
            "clinical_reason_code": "TRAUMA_UNCONSCIOUS",
            "justification_notes": "First override event.",
        },
    )
    assert res1.status_code == 200

    res2 = client.post(
        "/api/emergency/break-glass",
        json={
            "patient_code": sample_patient.patient_code,
            "doctor_id": "DR-002",
            "doctor_password": "demo1234",
            "nurse_cosigner_id": "RN-002",
            "nurse_password": "nurse1234",
            "clinical_reason_code": "CARDIAC_ARREST",
            "justification_notes": "Second override event by emergency physician.",
        },
    )
    assert res2.status_code == 200

    # Query the verify endpoint
    verify_res = client.get("/api/emergency/audit-chain/verify")
    assert verify_res.status_code == 200
    report = verify_res.json()

    assert report["verified"] is True
    assert report["total_blocks"] >= 2
    assert report["genesis_hash"] == GENESIS_HASH
    assert len(report["latest_hash"]) == 64

    # Verify chain pointers manually
    chain = report["chain"]
    for i in range(1, len(chain)):
        assert chain[i]["prev_hash"] == chain[i - 1]["current_hash"]
        assert chain[i]["block_index"] == chain[i - 1]["block_index"] + 1


def test_cryptographic_audit_chain_detects_tampering(client, db, sample_patient):
    """Altering any byte of historical audit justification in the DB breaks verification."""
    # Record a known block
    block = record_break_glass_block(
        db=db,
        doctor_id="DR-001",
        nurse_cosigner_id="RN-001",
        patient_code=sample_patient.patient_code,
        clinical_reason_code="TRAUMA_UNCONSCIOUS",
        justification="Authentic emergency justification.",
    )
    db.commit()

    # Verify clean state
    clean_report = verify_audit_chain(db)
    assert clean_report["verified"] is True

    # Tamper with the row directly in the database
    block.justification = "Malicious altered justification by rogue actor."
    db.commit()

    # Re-verify should detect payload tampering
    tampered_report = verify_audit_chain(db)
    assert tampered_report["verified"] is False
    assert "tamper detected" in tampered_report["detail"].lower()


# ---------------------------------------------------------------------------
# HL7 FHIR Release 4 JSON Export Tests
# ---------------------------------------------------------------------------


def test_fhir_export_requires_authentication(anon_client, sample_patient):
    """Unauthenticated requests to the FHIR endpoint must return 401."""
    res = anon_client.get(f"/api/patients/{sample_patient.patient_code}/fhir")
    assert res.status_code == 401


def test_fhir_export_returns_valid_r4_bundle(client, sample_patient):
    """FHIR export endpoint returns an official HL7 FHIR R4 JSON Bundle with all clinical resources."""
    res = client.get(f"/api/patients/{sample_patient.patient_code}/fhir")
    assert res.status_code == 200
    assert "application/fhir+json" in res.headers.get("content-type", "")

    bundle = res.json()
    assert bundle["resourceType"] == "Bundle"
    assert bundle["type"] == "collection"
    assert bundle["id"] == f"bundle-{sample_patient.patient_code.lower()}"
    assert bundle["total"] > 0
    assert len(bundle["entry"]) == bundle["total"]

    resources = [entry["resource"] for entry in bundle["entry"]]
    by_type: Dict[str, list] = {}
    for r in resources:
        by_type.setdefault(r["resourceType"], []).append(r)

    # 1. Patient Resource
    assert "Patient" in by_type
    fhir_pat = by_type["Patient"][0]
    assert fhir_pat["name"][0]["text"] == sample_patient.full_name
    assert fhir_pat["gender"] == "male"
    assert fhir_pat["birthDate"].startswith(str(datetime.now().year - sample_patient.age))
    # Blood group extension
    bg_ext = next(
        (ext for ext in fhir_pat.get("extension", []) if "patient-bloodGroup" in ext["url"]),
        None,
    )
    assert bg_ext is not None
    assert bg_ext["valueString"] == "O+"

    # 2. Condition Resource (ICD-10-CM / SNOMED)
    assert "Condition" in by_type
    cond = by_type["Condition"][0]
    assert cond["clinicalStatus"]["coding"][0]["code"] == "active"
    assert any(c["code"] == "E11.9" for c in cond["code"]["coding"])

    # 3. MedicationStatement Resource (RxNorm)
    assert "MedicationStatement" in by_type
    med = by_type["MedicationStatement"][0]
    assert med["status"] == "active"
    assert any(c["code"] == "860975" for c in med["medicationCodeableConcept"]["coding"])
    assert med["dosage"][0]["doseAndRate"][0]["doseQuantity"]["value"] == 500.0

    # 4. AllergyIntolerance Resource (SNOMED CT)
    assert "AllergyIntolerance" in by_type
    allergy = by_type["AllergyIntolerance"][0]
    assert allergy["criticality"] == "high"
    assert any(c["code"] == "764146007" for c in allergy["code"]["coding"])

    # 5. Observation Resource (LOINC)
    assert "Observation" in by_type
    obs = by_type["Observation"][0]
    assert obs["status"] == "final"
    assert any(c["code"] == "2160-0" for c in obs["code"]["coding"])
    assert obs["valueQuantity"]["value"] == 1.4
    assert obs["valueQuantity"]["unit"] == "mg/dL"
    assert obs["interpretation"][0]["coding"][0]["code"] == "H"

    # 6. Procedure Resource (ICD-10-PCS)
    assert "Procedure" in by_type
    proc = by_type["Procedure"][0]
    assert proc["status"] == "completed"
    assert any(c["code"] == "B2111ZZ" for c in proc["code"]["coding"])


# =============================================================================
# Scope Boundary, Role Restriction & Reception Queue Tests
# =============================================================================

def test_break_glass_patient_boundary_enforcement(client, sample_patient):
    """Verify that a break-glass token for Patient A cannot read Patient B's flashcard."""
    # Obtain break-glass token for sample_patient (BG-TEST-01)
    res = client.post(
        "/api/emergency/break-glass",
        json={
            "patient_code": sample_patient.patient_code,
            "doctor_id": "DR-001",
            "doctor_password": "demo1234",
            "nurse_cosigner_id": "RN-001",
            "nurse_password": "nurse1234",
            "clinical_reason_code": "TRAUMA_UNCONSCIOUS",
            "justification_notes": "Emergency boundary validation test.",
        },
    )
    assert res.status_code == 200
    token = res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Accessing the authorized patient flashcard succeeds
    res_auth = client.get(f"/api/patients/{sample_patient.patient_code}/flashcard", headers=headers)
    assert res_auth.status_code == 200

    # Accessing a different patient flashcard is rejected with 403 Forbidden
    res_unauth = client.get("/api/patients/OTHER-PATIENT-99/flashcard", headers=headers)
    assert res_unauth.status_code == 403
    assert "restricted to patient" in res_unauth.json()["detail"]


def test_break_glass_token_denied_on_non_emergency_routes(client, sample_patient):
    """Verify that ephemeral break-glass tokens are blocked with 403 on non-emergency endpoints."""
    res = client.post(
        "/api/emergency/break-glass",
        json={
            "patient_code": sample_patient.patient_code,
            "doctor_id": "DR-001",
            "doctor_password": "demo1234",
            "nurse_cosigner_id": "RN-001",
            "nurse_password": "nurse1234",
            "clinical_reason_code": "CARDIAC_ARREST",
            "justification_notes": "Emergency route lockdown validation.",
        },
    )
    assert res.status_code == 200
    token = res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Profile route must reject with 403
    res_profile = client.get(f"/api/patients/{sample_patient.patient_code}/profile", headers=headers)
    assert res_profile.status_code == 403
    assert "Break-glass emergency tokens cannot access" in res_profile.json()["detail"]

    # 2. Audit route must reject with 403
    res_audit = client.get(f"/api/patients/{sample_patient.patient_code}/audit", headers=headers)
    assert res_audit.status_code == 403

    # 3. FHIR export route must reject with 403
    res_fhir = client.get(f"/api/patients/{sample_patient.patient_code}/fhir", headers=headers)
    assert res_fhir.status_code == 403

    # 4. Patient search / list must reject with 403
    res_list = client.get("/api/patients", headers=headers)
    assert res_list.status_code == 403


def test_reception_queue_and_appointment_endpoints(client, sample_patient):
    """Verify queue retrieval, patient check-in, status update, and dynamic search."""
    # 1. Check-in new appointment
    checkin_res = client.post(
        "/api/reception/queue/checkin",
        json={
            "patient_code": sample_patient.patient_code,
            "patient_name": sample_patient.full_name,
            "department": "General Medicine",
            "doctor_name": "Dr. Meera Thomas",
            "scheduled_time": "10:15 AM",
            "chief_complaint": "Follow-up consultation",
        },
    )
    assert checkin_res.status_code == 200
    checkin_data = checkin_res.json()
    assert checkin_data["patient_code"] == sample_patient.patient_code
    assert checkin_data["token_number"] != ""
    assert "visit_id" in checkin_data
    app_id = checkin_data["id"]

    # 2. Get Queue
    queue_res = client.get("/api/reception/queue")
    assert queue_res.status_code == 200
    queue_data = queue_res.json()
    assert isinstance(queue_data, list)
    assert any(item["id"] == app_id for item in queue_data)

    # 3. Patch Status
    patch_res = client.patch(
        f"/api/reception/queue/{app_id}/status",
        json={"status": "in_consultation"},
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["status"] == "in_consultation"

    # 4. Search Patients dynamically
    search_res = client.get(f"/api/patients/search?q={sample_patient.patient_code}")
    assert search_res.status_code == 200
    search_data = search_res.json()
    assert len(search_data) >= 1
    assert search_data[0]["patient_code"] == sample_patient.patient_code
    assert search_data[0]["full_name"] == sample_patient.full_name

