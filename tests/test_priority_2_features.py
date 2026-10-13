"""
Tests for Priority 2 Features:
1. Asynchronous Ingestion Worker Queue (JobManager & FastAPI Background Tasks)
2. Production Neo4j Graph Database Adapter (Cypher, Constraints, Topology)
"""

import io
from unittest.mock import MagicMock
from fastapi.testclient import TestClient
import pytest

from app.auth import authenticate
from app.main import app
from src.db.models import Allergy, Condition, Medication, Patient, SafetyAlert
from src.services.job_service import JobManager, STEP_PROGRESS_PERCENT
from src.services.neo4j_adapter import Neo4jGraphAdapter, sanitize_cypher_string


# =============================================================================
# 1. JobManager Unit Tests
# =============================================================================

def test_job_manager_lifecycle():
    jm = JobManager()
    job = jm.create_job(
        patient_code="TEST-PAT-01",
        patient_name="Test Ingestion Patient",
        filename="discharge_summary.pdf",
        document_id=101,
    )

    assert job.job_id.startswith("job_")
    assert job.status == "queued"
    assert job.progress == 5
    assert job.patient_code == "TEST-PAT-01"

    # Step transitions
    jm.update_step(job.job_id, "ocr_completed", "in_progress", "Running Tesseract OCR")
    retrieved = jm.get_job(job.job_id)
    assert retrieved is not None
    assert retrieved.status == "processing"
    assert retrieved.progress == STEP_PROGRESS_PERCENT["ocr_completed"]
    assert retrieved.current_step == "ocr_completed"
    assert len(retrieved.steps) == 1
    assert retrieved.steps[0]["key"] == "ocr_completed"

    jm.update_step(job.job_id, "entities_extracted", "in_progress", "Identified 8 entities")
    assert retrieved.progress == STEP_PROGRESS_PERCENT["entities_extracted"]

    # Mark completed
    outcome = {"entities_extracted": 8, "safety_alerts": 1}
    jm.mark_completed(job.job_id, outcome)
    assert retrieved.status == "completed"
    assert retrieved.progress == 100
    assert retrieved.result == outcome
    assert retrieved.completed_at is not None

    # List jobs
    all_jobs = jm.list_jobs(limit=10)
    assert any(j.job_id == job.job_id for j in all_jobs)


def test_job_manager_failure_handling():
    jm = JobManager()
    job = jm.create_job(patient_code="FAIL-01", patient_name="Fail Test", filename="bad.pdf")
    jm.mark_failed(job.job_id, "Corrupt PDF document stream")

    retrieved = jm.get_job(job.job_id)
    assert retrieved is not None
    assert retrieved.status == "failed"
    assert retrieved.error == "Corrupt PDF document stream"
    assert retrieved.completed_at is not None


# =============================================================================
# 2. Asynchronous Ingestion API Endpoints
# =============================================================================

@pytest.fixture
def auth_headers():
    token = authenticate("DR-001", "demo1234")
    return {"Authorization": f"Bearer {token}"}



def test_async_record_upload_and_status(auth_headers):
    client = TestClient(app)
    pdf_content = b"%PDF-1.4 Mock medical discharge summary with Metformin 500mg daily"

    response = client.post(
        "/api/records/async",
        headers=auth_headers,
        data={"patient_code": "ASYNC-TEST-01", "patient_name": "Async Test Patient"},
        files={"file": ("record.pdf", io.BytesIO(pdf_content), "application/pdf")},
    )

    assert response.status_code == 202
    data = response.json()
    assert "job_id" in data
    assert data["patient_code"] == "ASYNC-TEST-01"
    assert data["status_url"].startswith("/api/jobs/")

    # Check status endpoint
    job_id = data["job_id"]
    status_resp = client.get(f"/api/jobs/{job_id}")
    assert status_resp.status_code == 200
    job_data = status_resp.json()
    assert job_data["job_id"] == job_id
    assert job_data["status"] in ("queued", "processing", "completed")

    # List jobs endpoint
    jobs_resp = client.get("/api/jobs")
    assert jobs_resp.status_code == 200
    assert any(j["job_id"] == job_id for j in jobs_resp.json())


def test_async_portal_upload():
    client = TestClient(app)
    png_content = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR Mock Lab Blood Report"

    response = client.post(
        "/api/portal/upload/async",
        data={"patient_code": "PORTAL-ASYNC-01"},
        files={"file": ("lab_report.png", io.BytesIO(png_content), "image/png")},
    )

    assert response.status_code == 202
    data = response.json()
    assert "job_id" in data
    assert data["patient_code"] == "PORTAL-ASYNC-01"

    # Verify job exists
    status_resp = client.get(f"/api/jobs/{data['job_id']}")
    assert status_resp.status_code == 200


def test_get_nonexistent_job():
    client = TestClient(app)
    response = client.get("/api/jobs/job_nonexistent_9999")
    assert response.status_code == 404


# =============================================================================
# 3. Neo4j Graph Adapter & Cypher Generation
# =============================================================================

def test_sanitize_cypher_string():
    assert sanitize_cypher_string("Dr. O'Connor") == "Dr. O\\'Connor"
    assert sanitize_cypher_string("Line 1\nLine 2") == "Line 1 Line 2"
    assert sanitize_cypher_string(None) == ""


def test_neo4j_adapter_cypher_generation():
    adapter = Neo4jGraphAdapter()

    # Create mock patient
    mock_patient = MagicMock(spec=Patient)
    mock_patient.patient_code = "NEO-PAT-01"
    mock_patient.full_name = "Eleanor Vance"
    mock_patient.age = 58
    mock_patient.sex = "Female"
    mock_patient.blood_group = "A+"

    cond1 = MagicMock(spec=Condition)
    cond1.name = "Atrial Fibrillation"
    cond1.status = "active"
    cond1.icd10_code = "I48.0"
    cond1.is_chronic = True

    med1 = MagicMock(spec=Medication)
    med1.name = "Warfarin"
    med1.dosage = "5mg"
    med1.status = "active"
    med1.rxnorm_code = "11289"

    med2 = MagicMock(spec=Medication)
    med2.name = "Ibuprofen"
    med2.dosage = "400mg"
    med2.status = "active"
    med2.rxnorm_code = "5640"

    allg1 = MagicMock(spec=Allergy)
    allg1.substance = "Penicillin"
    allg1.criticality = "high"
    allg1.reaction = "Anaphylaxis"

    alert = MagicMock(spec=SafetyAlert)
    alert.description = "Severe bleeding risk: Warfarin concurrent with Ibuprofen"
    alert.severity = "critical"
    alert.rule_id = "DD-WARFARIN-NSAID"

    mock_patient.conditions = [cond1]
    mock_patient.medications = [med1, med2]
    mock_patient.allergies = [allg1]
    mock_patient.lab_values = []
    mock_patient.safety_alerts = [alert]

    export = adapter.generate_cypher(mock_patient)

    assert export.patient_code == "NEO-PAT-01"
    assert len(export.constraints) == 5
    assert export.nodes_count == 5  # Patient (1) + Cond (1) + Meds (2) + Allergy (1) = 5
    assert export.edges_count >= 5  # 4 patient edges + 1 contraindication edge

    # Verify Cypher contains key nodes and relationships
    assert "MERGE (p:Patient {patient_code: 'NEO-PAT-01'})" in export.cypher_script
    assert "MERGE (c:Condition {key: 'NEO-PAT-01:atrial_fibrillation'})" in export.cypher_script
    assert "MERGE (m:Medication {key: 'NEO-PAT-01:warfarin'})" in export.cypher_script
    assert "MERGE (m:Medication {key: 'NEO-PAT-01:ibuprofen'})" in export.cypher_script
    assert "CONTRAINDICATED_WITH" in export.cypher_script
    assert "ALLERGIC_TO" in export.cypher_script

    # Subgraph format
    subgraph = adapter.get_connected_subgraph(mock_patient)
    assert subgraph["total_nodes"] == 5
    assert any(link["type"] == "CONTRAINDICATED_WITH" for link in subgraph["links"])


def test_neo4j_api_endpoints(auth_headers, db):
    # Seed patient in test database
    p = db.query(Patient).filter(Patient.patient_code == "NEO-API-PAT").first()
    if not p:
        p = Patient(
            patient_code="NEO-API-PAT",
            full_name="Arjun V. Rao",
            age=52,
            sex="male",
            blood_group="B+",
        )
        db.add(p)
        db.flush()
        db.add(Condition(patient_id=p.id, name="Atrial Fibrillation", status="active"))
        db.add(Medication(patient_id=p.id, name="Warfarin", dose=5.0, dose_unit="mg", status="active"))
        db.add(Medication(patient_id=p.id, name="Ibuprofen", dose=400.0, dose_unit="mg", status="active"))
        db.add(Allergy(patient_id=p.id, substance="Aspirin", severity="high"))
        db.commit()

    client = TestClient(app)

    # 1. Test Cypher export endpoint
    response = client.get("/api/patients/NEO-API-PAT/graph/cypher", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["patient_code"] == "NEO-API-PAT"
    assert len(data["statements"]) > 0
    assert "CREATE CONSTRAINT" in data["cypher_script"]

    # 2. Test Sync endpoint
    sync_resp = client.post("/api/patients/NEO-API-PAT/graph/sync", headers=auth_headers)
    assert sync_resp.status_code == 200
    sync_data = sync_resp.json()
    assert sync_data["patient_code"] == "NEO-API-PAT"
    assert sync_data["status"] in ("synced", "ready_for_sync")

    # 3. Test Subgraph endpoint
    subgraph_resp = client.get("/api/patients/NEO-API-PAT/graph/subgraph", headers=auth_headers)
    assert subgraph_resp.status_code == 200
    sub_data = subgraph_resp.json()
    assert "nodes" in sub_data
    assert "links" in sub_data
    assert sub_data["total_nodes"] > 0

    # 4. Nonexistent patient
    nonexist_resp = client.get("/api/patients/NONEXISTENT/graph/cypher", headers=auth_headers)
    assert nonexist_resp.status_code == 404

