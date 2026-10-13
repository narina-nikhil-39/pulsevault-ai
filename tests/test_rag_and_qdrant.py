"""
SynapseHealth — Tests for Native Qdrant Vector Indexing & Grounded RAG Retrieval
Validates:
1. In-memory graceful fallback when Qdrant server is unreachable.
2. Document chunking with spatial page coordinates [x0, y0, x1, y1].
3. Patient boundary isolation (zero cross-patient chunk leakage).
4. Grounded answer synthesis with source citation formatting.
5. FastAPI endpoint POST /api/patients/{patient_code}/rag/query (auth, scoping, payload).
"""

import uuid
from fastapi.testclient import TestClient
import pytest

from app.auth import authenticate
from app.break_glass import create_ephemeral_token
from app.main import app
from src.db.database import get_db
from src.db.models import Patient, SourceDocument
from src.services.rag_service import QdrantRagService, rag_service


# =============================================================================
# 1. Vector Store Fallback & Collection Lifecycle Tests
# =============================================================================

def test_qdrant_service_memory_fallback():
    """Verify fallback to in-memory Qdrant engine without throwing exceptions."""
    service = QdrantRagService(force_memory=True)
    assert service.backend == "qdrant_in_memory"
    assert service.collection_name == "patient_records"

    # Test unreachable server fallback
    service_unreachable = QdrantRagService(host="127.0.0.1", port=59999)
    assert service_unreachable.backend == "qdrant_in_memory"


def test_embedding_generator_deterministic():
    """Verify deterministic dense vector generation and L2 normalization."""
    service = QdrantRagService(force_memory=True)
    v1 = service.embed_text("Amoxicillin 500mg oral capsule for bacterial infection")
    v2 = service.embed_text("Amoxicillin 500mg oral capsule for bacterial infection")
    v3 = service.embed_text("Completely unrelated orthopedic knee replacement surgery")

    assert len(v1) == 384
    assert v1 == v2, "Identical text must generate identical embeddings"

    # Dot product similarity (equivalent to cosine similarity on unit vectors)
    sim_same = sum(a * b for a, b in zip(v1, v2))
    sim_diff = sum(a * b for a, b in zip(v1, v3))
    assert pytest.approx(sim_same, rel=1e-2) == 1.0
    assert sim_diff < sim_same


# =============================================================================
# 2. Chunking & Bounding Box Extraction Tests
# =============================================================================

def test_extract_document_chunks_spatial_metadata():
    """Verify chunk extraction formats valid page indices and [x0, y0, x1, y1] bounding boxes."""
    service = QdrantRagService(force_memory=True)
    sample_text = (
        "Prescription Note: Tab Metformin 500 mg PO BD with meals.\n\n"
        "Allergies: Documented severe anaphylaxis to Penicillin G.\n\n"
        "Impression: Patient has Type 2 Diabetes Mellitus with elevated HbA1c."
    )

    chunks = service.extract_document_chunks(
        file_bytes=b"",
        document_id=42,
        patient_code="PAT-CHUNKS-01",
        document_title="Prescription_Nov2026.pdf",
        extracted_text=sample_text,
    )

    assert len(chunks) == 3
    for chunk in chunks:
        assert chunk["document_id"] == 42
        assert chunk["patient_code"] == "PAT-CHUNKS-01"
        assert chunk["document_title"] == "Prescription_Nov2026.pdf"
        assert chunk["page"] >= 1
        bbox = chunk["bbox"]
        assert len(bbox) == 4
        # Validate coordinates: x0 < x1 and y0 < y1
        assert bbox[0] < bbox[2]
        assert bbox[1] < bbox[3]
        assert len(chunk["text"]) >= 5


# =============================================================================
# 3. Patient Boundary Scoping (Zero Cross-Patient Leakage)
# =============================================================================

def test_patient_scoping_prevents_leakage():
    """Verify that vector queries strictly return chunks belonging to the targeted patient."""
    service = QdrantRagService(force_memory=True)

    patient_a = "PATIENT-ALICE-100"
    patient_b = "PATIENT-BOB-200"

    chunks_a = [
        {
            "chunk_id": "a_1",
            "document_id": 1,
            "document_title": "Alice_Cardio.pdf",
            "patient_code": patient_a,
            "page": 1,
            "bbox": [50.0, 50.0, 400.0, 90.0],
            "text": "Patient taking Atorvastatin 20mg for hyperlipidemia management.",
        },
        {
            "chunk_id": "a_2",
            "document_id": 1,
            "document_title": "Alice_Cardio.pdf",
            "patient_code": patient_a,
            "page": 1,
            "bbox": [50.0, 100.0, 400.0, 140.0],
            "text": "Cardiac stress test shows normal sinus rhythm.",
        },
    ]

    chunks_b = [
        {
            "chunk_id": "b_1",
            "document_id": 2,
            "document_title": "Bob_Oncology.pdf",
            "patient_code": patient_b,
            "page": 1,
            "bbox": [50.0, 50.0, 400.0, 90.0],
            "text": "Chemotherapy cycle 3 completed with Cisplatin and Paclitaxel.",
        },
        {
            "chunk_id": "b_2",
            "document_id": 2,
            "document_title": "Bob_Oncology.pdf",
            "patient_code": patient_b,
            "page": 2,
            "bbox": [50.0, 80.0, 400.0, 120.0],
            "text": "Severe neutropenia noted on CBC differential.",
        },
    ]

    service.index_chunks(chunks_a)
    service.index_chunks(chunks_b)

    # 1. Query for Alice: Must NEVER return Bob's oncology chunks
    results_a = service.search(patient_code=patient_a, query="What medications or cancer drugs is the patient taking?")
    assert len(results_a) > 0
    for r in results_a:
        assert r["patient_code"] == patient_a
        assert "Chemotherapy" not in r["text"]
        assert "Cisplatin" not in r["text"]

    # 2. Query for Bob: Must NEVER return Alice's cardiology chunks
    results_b = service.search(patient_code=patient_b, query="Atorvastatin cholesterol statin")
    for r in results_b:
        assert r["patient_code"] == patient_b
        assert "Atorvastatin" not in r["text"]


# =============================================================================
# 4. Grounded Answer Synthesis Tests
# =============================================================================

def test_synthesize_answer_provenance():
    """Verify synthesized answer quotes source documents and page numbers."""
    service = QdrantRagService(force_memory=True)
    chunks = [
        {
            "chunk_id": "c1",
            "document_id": 99,
            "document_title": "LabReport_CBC.pdf",
            "patient_code": "PAT-CIT-01",
            "page": 2,
            "bbox": [10.0, 20.0, 300.0, 60.0],
            "text": "Hemoglobin 8.4 g/dL indicates moderate iron-deficiency anemia.",
            "score": 0.88,
        }
    ]

    answer = service.synthesize_answer("PAT-CIT-01", "Hemoglobin level", chunks)
    assert "PAT-CIT-01" in answer
    assert "LabReport_CBC.pdf" in answer
    assert "Page 2" in answer
    assert "8.4 g/dL" in answer

    # Empty chunks response
    empty_ans = service.synthesize_answer("PAT-CIT-01", "Unrecorded query", [])
    assert "No relevant clinical records" in empty_ans


# =============================================================================
# 5. FastAPI Vector Query Endpoint (Auth, Boundaries, & Bounding Boxes)
# =============================================================================

@pytest.fixture
def sample_patient(db):
    patient = Patient(
        patient_code="SYN123456",
        full_name="Meera Thomas",
        age=52,
        sex="female",
        blood_group="B+",
    )
    db.add(patient)
    db.commit()
    db.refresh(patient)
    return patient


@pytest.fixture
def break_glass_headers():
    token = create_ephemeral_token(
        doctor_id="DR-001",
        nurse_cosigner_id="RN-001",
        patient_code="SYN123456",
        clinical_reason_code="TRAUMA_UNCONSCIOUS",
    )
    return {"Authorization": f"Bearer {token}"}


def test_rag_query_endpoint_requires_auth(anon_client: TestClient, sample_patient):
    """Unauthenticated requests must be rejected with HTTP 401."""
    resp = anon_client.post("/api/patients/SYN123456/rag/query", json={"query": "Current medications"})
    assert resp.status_code == 401


def test_rag_query_endpoint_rejects_emergency_token(anon_client: TestClient, break_glass_headers, sample_patient):
    """Break-glass emergency tokens must be denied access to standard RAG query endpoint."""
    resp = anon_client.post(
        "/api/patients/SYN123456/rag/query",
        headers=break_glass_headers,
        json={"query": "Current medications"},
    )
    assert resp.status_code == 403
    assert "Break-glass emergency tokens cannot access" in resp.json()["detail"]


def test_rag_query_endpoint_success(client: TestClient, sample_patient):
    """Standard clinician can query patient vector index and receive grounded chunks with bbox."""
    rag_service.index_chunks([
        {
            "chunk_id": "demo_syn_1",
            "document_id": 10,
            "document_title": "Consultation_Summary.pdf",
            "patient_code": "SYN123456",
            "page": 1,
            "bbox": [50.0, 100.0, 500.0, 140.0],
            "text": "Patient has active Metformin 500mg BD prescription for blood glucose control.",
        }
    ])

    resp = client.post(
        "/api/patients/SYN123456/rag/query",
        json={"query": "What is the dosage of Metformin?", "top_k": 3},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["patient_code"] == "SYN123456"
    assert data["query"] == "What is the dosage of Metformin?"
    assert data["results_count"] >= 1
    assert "Metformin" in data["answer"]
    assert data["backend"] in ("qdrant_server", "qdrant_in_memory")

    # Validate chunks schema and spatial coordinates
    chunk = data["chunks"][0]
    assert chunk["patient_code"] == "SYN123456"
    assert chunk["page"] >= 1
    assert len(chunk["bbox"]) == 4
    assert isinstance(chunk["score"], float)
    assert "Metformin" in chunk["text"]


def test_rag_query_endpoint_404_on_missing_patient(client: TestClient):
    """Querying an unknown patient code returns HTTP 404."""
    resp = client.post(
        "/api/patients/NON-EXISTENT-PATIENT-999/rag/query",
        json={"query": "Any medications?"},
    )
    assert resp.status_code == 404
