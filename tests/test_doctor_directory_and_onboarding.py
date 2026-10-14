"""
SynapseHealth — Tests for Doctor Profiles & Organic Patient Onboarding
Validates:
1. Authentic doctor profile seeding (10 credentialed specialists across hospital departments).
2. GET /api/doctors returns the active doctor catalog with qualifications and NMC licenses.
3. GET /api/doctors/{identifier} supports both primary key and doctor_id resolution.
4. POST /api/portal/register creates organic patient records with unique SYN-XXXXXX codes.
5. POST /api/portal/register with file upload schedules asynchronous background extraction.
6. Database URL normalization converts postgres:// to postgresql:// for Cloud PostgreSQL.
"""

from io import BytesIO
from pathlib import Path
from sqlalchemy import select

from scripts.seed_doctors import DOCTOR_CATALOG, seed_doctors
from src.db.database import _resolve_database_url
from src.db.models import Doctor, Patient, SourceDocument


def test_seed_doctors_catalog(db):
    """seed_doctors should populate 10 authentic doctors without duplicates."""
    docs = seed_doctors(db)
    assert len(docs) == len(DOCTOR_CATALOG)
    assert len(docs) >= 10

    # Verify attributes of key specialists
    dr_rao = db.scalar(select(Doctor).where(Doctor.doctor_id == "DOC-HYD-4012"))
    assert dr_rao is not None
    assert dr_rao.name == "Dr. Ananya Rao"
    assert "Cardiology" in dr_rao.specialization
    assert "DM" in dr_rao.qualifications
    assert dr_rao.reg_number == "TSMC-68421"

    # Idempotent re-run check (adds 0 new rows, preserves all existing)
    re_seeded = seed_doctors(db)
    assert len(re_seeded) == 0
    all_docs = db.scalars(select(Doctor)).all()
    assert len(all_docs) == len(DOCTOR_CATALOG)


def test_get_doctors_api(anon_client, db):
    """GET /api/doctors should return the public list of active credentialed doctors."""
    seed_doctors(db)
    resp = anon_client.get("/api/doctors")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 10
    doc_ids = [d["doctor_id"] for d in data]
    assert "DOC-HYD-4012" in doc_ids
    assert "DOC-BLR-8190" in doc_ids


def test_get_doctor_by_identifier(anon_client, db):
    """GET /api/doctors/{id} should resolve by either doctor_id string or integer primary key."""
    seed_doctors(db)
    
    # 1. By doctor_id string
    resp1 = anon_client.get("/api/doctors/DOC-HYD-4012")
    assert resp1.status_code == 200
    d1 = resp1.json()
    assert d1["name"] == "Dr. Ananya Rao"
    assert d1["doctor_id"] == "DOC-HYD-4012"

    # 2. By integer ID
    doc_pk = d1["id"]
    resp2 = anon_client.get(f"/api/doctors/{doc_pk}")
    assert resp2.status_code == 200
    assert resp2.json()["doctor_id"] == "DOC-HYD-4012"

    # 3. Not found
    resp3 = anon_client.get("/api/doctors/DOC-UNKNOWN-9999")
    assert resp3.status_code == 404


def test_patient_portal_registration_demographics_only(anon_client, db):
    """POST /api/portal/register should create a patient with a unique SYN-XXXXXX code."""
    payload = {
        "full_name": "Siddharth Malhotra",
        "dob": "1994-06-15",
        "gender": "Male",
        "blood_group": "B+",
        "phone": "+91 98765 11223",
        "emergency_contact_name": "Kavita Malhotra",
        "emergency_contact_phone": "+91 98765 44556",
    }
    resp = anon_client.post("/api/portal/register", data=payload)
    assert resp.status_code == 201
    data = resp.json()

    assert data["patient_code"].startswith("SYN-")
    assert data["full_name"] == "Siddharth Malhotra"
    assert data["sex"] == "Male"
    assert data["blood_group"] == "B+"
    assert data["contact"] == "+91 98765 11223"
    assert "Kavita Malhotra" in data["emergency_contact"]
    assert data["age"] is not None
    assert data["age"] >= 30  # Calculated from 1994
    assert data["job_id"] is None

    # Verify patient exists in database
    p = db.scalar(select(Patient).where(Patient.patient_code == data["patient_code"]))
    assert p is not None
    assert p.full_name == "Siddharth Malhotra"


def test_patient_portal_registration_with_document_upload(anon_client, corpus_dir, db):
    """POST /api/portal/register with document should persist record and return job_id."""
    sample_pdf = next(corpus_dir.glob("*.pdf"))
    pdf_bytes = sample_pdf.read_bytes()

    files = {"file": ("intake_discharge_summary.pdf", BytesIO(pdf_bytes), "application/pdf")}
    data = {
        "full_name": "Deepika Sharma",
        "age": 38,
        "gender": "Female",
        "blood_group": "O-",
        "phone": "+91 91234 56789",
    }

    resp = anon_client.post("/api/portal/register", data=data, files=files)
    assert resp.status_code == 201
    out = resp.json()

    assert out["patient_code"].startswith("SYN-")
    assert out["full_name"] == "Deepika Sharma"
    assert out["blood_group"] == "O-"
    assert out["job_id"] is not None
    assert out["document_id"] is not None

    # Check database persistence
    p = db.scalar(select(Patient).where(Patient.patient_code == out["patient_code"]))
    assert p is not None
    assert len(p.documents) == 1
    assert p.documents[0].filename == "intake_discharge_summary.pdf"


def test_database_url_normalization():
    """Verify postgres:// is converted to postgresql:// for SQLAlchemy 2.0 compatibility."""
    assert _resolve_database_url("postgres://user:pass@host/db") == "postgresql://user:pass@host/db"
    assert _resolve_database_url("postgresql://user:pass@host/db") == "postgresql://user:pass@host/db"
    assert _resolve_database_url("sqlite:///:memory:") == "sqlite:///:memory:"
    sqlite_resolved = _resolve_database_url("sqlite:///data/test.db")
    assert sqlite_resolved.startswith("sqlite:///")
    assert "data/test.db" in sqlite_resolved
