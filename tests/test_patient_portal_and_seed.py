"""
SynapseHealth — Tests for Demo Seeding and Patient Portal Endpoints
Validates:
1. Demo patient seeding generates Trauma ER Patient and Arjun Rao with grounded multi-document histories.
2. Unauthenticated public access to Patient Portal endpoints (/api/portal/patients, /api/portal/patients/{code}).
3. Patient self-upload to health locker (/api/portal/upload) without requiring clinician credentials.
"""

from io import BytesIO
from pathlib import Path

from scripts.seed_demo_patients import seed_demo_patients
from src.db.models import Patient, SafetyAlert


def test_seed_demo_patients_creates_valid_cohort(db):
    """Seed script must create both demonstration patients with full clinical facts."""
    res = seed_demo_patients(db)
    assert res["status"] == "success"

    # 1. Trauma ER Patient
    p1 = db.query(Patient).filter_by(patient_code="ER-TRAUMA-01").first()
    assert p1 is not None
    assert p1.full_name == "Trauma ER Patient"
    assert p1.blood_group == "O-"
    assert p1.age == 34
    assert any(a.substance == "Penicillin" and a.severity == "severe" for a in p1.allergies)
    assert any("Coronary Artery" in c.name for c in p1.conditions)
    assert any("Stent" in i.name for i in p1.implants)
    assert len(p1.medications) >= 2

    # 2. Arjun Rao OPD Patient
    p2 = db.query(Patient).filter_by(patient_code="OPD-ARJUN").first()
    assert p2 is not None
    assert p2.full_name == "Arjun Rao"
    assert p2.blood_group == "A+"
    assert p2.age == 62
    assert len(p2.documents) == 3

    # Multi-document reconciliation check
    med_names = [m.name.lower() for m in p2.medications]
    assert "warfarin" in med_names
    assert "aspirin" in med_names
    assert "metformin" in med_names

    # Grounded citations check
    for med in p2.medications:
        assert med.source_document_id is not None
        assert med.source_span is not None
        assert med.source_confidence is not None
        assert med.source_confidence >= 0.90

    # Deterministic interaction check (Warfarin + Aspirin NSAID DD-001)
    alerts = db.query(SafetyAlert).filter_by(patient_id=p2.id).all()
    assert any(a.severity == "critical" and "warfarin" in a.title.lower() for a in alerts)


def test_portal_list_and_profile_endpoints(anon_client, db):
    """Patient portal endpoints must return profiles without requiring doctor credentials."""
    seed_demo_patients(db)

    # 1. Portal patient list
    resp = anon_client.get("/api/portal/patients")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 2
    codes = [p["patient_code"] for p in data]
    assert "OPD-ARJUN" in codes
    assert "ER-TRAUMA-01" in codes

    # 2. Portal patient profile
    profile_resp = anon_client.get("/api/portal/patients/OPD-ARJUN")
    assert profile_resp.status_code == 200
    profile = profile_resp.json()
    assert profile["patient"]["patient_code"] == "OPD-ARJUN"
    assert profile["patient"]["full_name"] == "Arjun Rao"
    assert len(profile["medications"]) >= 3
    assert len(profile["conditions"]) >= 3
    assert len(profile["documents"]) == 3
    assert len(profile["safety_alerts"]) >= 1


def test_portal_upload_record(anon_client, corpus_dir, db):
    """Patient self-upload creates document, processes pipeline, and logs portal audit event."""
    # Using sample synthetic PDF from corpus
    sample_pdf = next(corpus_dir.glob("*.pdf"))
    pdf_bytes = sample_pdf.read_bytes()

    files = {"file": ("my_prescription.pdf", BytesIO(pdf_bytes), "application/pdf")}
    data = {"patient_code": "OPD-ARJUN"}

    resp = anon_client.post("/api/portal/upload", files=files, data=data)
    assert resp.status_code == 201
    out = resp.json()
    assert out["patient_code"] == "OPD-ARJUN"
    assert out["document_id"] > 0
    assert "Ingested" in out["message"]


def test_patient_portal_auth_pin_success_and_failure(anon_client, db):
    """Patient PIN login verifies registered PIN, issues 24h JWT, and rejects incorrect PINs."""
    seed_demo_patients(db)

    # Valid PIN login with default demo PIN '1234'
    valid_resp = anon_client.post(
        "/api/portal/auth/login",
        json={"patient_code": "OPD-ARJUN", "pin": "1234"},
    )
    assert valid_resp.status_code == 200
    auth_data = valid_resp.json()
    assert auth_data["patient_code"] == "OPD-ARJUN"
    assert auth_data["full_name"] == "Arjun Rao"
    assert "access_token" in auth_data
    assert auth_data["token_type"] == "Bearer"
    assert auth_data["auth_method"] == "pin"

    # Invalid PIN returns 401 Unauthorized
    invalid_resp = anon_client.post(
        "/api/portal/auth/login",
        json={"patient_code": "OPD-ARJUN", "pin": "9999"},
    )
    assert invalid_resp.status_code == 401

    # Non-existent patient returns 404
    missing_resp = anon_client.post(
        "/api/portal/auth/login",
        json={"patient_code": "UNKNOWN-999", "pin": "1234"},
    )
    assert missing_resp.status_code == 404


def test_patient_portal_auth_otp_flow(anon_client, db):
    """Patient OTP dispatch and verification issues valid portal session."""
    seed_demo_patients(db)

    # Request OTP for Arjun Rao
    otp_req_resp = anon_client.post(
        "/api/portal/auth/request-otp",
        json={"contact_or_code": "OPD-ARJUN"},
    )
    assert otp_req_resp.status_code == 200
    otp_data = otp_req_resp.json()
    assert otp_data["patient_code"] == "OPD-ARJUN"
    assert "masked_contact" in otp_data
    assert "simulated_otp" in otp_data

    # Verify with generated OTP
    verify_resp = anon_client.post(
        "/api/portal/auth/verify-otp",
        json={"contact_or_code": "OPD-ARJUN", "otp": otp_data["simulated_otp"]},
    )
    assert verify_resp.status_code == 200
    session_data = verify_resp.json()
    assert session_data["patient_code"] == "OPD-ARJUN"
    assert session_data["auth_method"] == "otp"
    assert "access_token" in session_data

    # Verify with fallback demo OTP '123456'
    fallback_resp = anon_client.post(
        "/api/portal/auth/verify-otp",
        json={"contact_or_code": "OPD-ARJUN", "otp": "123456"},
    )
    assert fallback_resp.status_code == 200

    # Invalid OTP returns 400 Bad Request
    bad_resp = anon_client.post(
        "/api/portal/auth/verify-otp",
        json={"contact_or_code": "OPD-ARJUN", "otp": "000000"},
    )
    assert bad_resp.status_code == 400


def test_patient_portal_auth_me_endpoint(anon_client, db):
    """GET /api/portal/auth/me validates patient token and returns session metadata."""
    seed_demo_patients(db)

    login_resp = anon_client.post(
        "/api/portal/auth/login",
        json={"patient_code": "OPD-ARJUN", "pin": "1234"},
    )
    token = login_resp.json()["access_token"]

    # Valid bearer authorization
    me_resp = anon_client.get(
        "/api/portal/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me_resp.status_code == 200
    me_data = me_resp.json()
    assert me_data["patient_code"] == "OPD-ARJUN"
    assert me_data["full_name"] == "Arjun Rao"
    assert me_data["blood_group"] == "A+"

    # Missing authorization header returns 401
    anon_resp = anon_client.get("/api/portal/auth/me")
    assert anon_resp.status_code == 401

    # Invalid authorization token returns 401
    fake_resp = anon_client.get(
        "/api/portal/auth/me",
        headers={"Authorization": "Bearer invalid.jwt.token"},
    )
    assert fake_resp.status_code == 401
