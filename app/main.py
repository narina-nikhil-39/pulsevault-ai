"""
SynapseHealth — FastAPI Gateway
Exposes REST endpoints for doctor authentication, record ingestion, patient search,
the clinical profile, the emergency flashcard, and the access audit trail.
"""

import os
import sys
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

_PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

import json
from fastapi import (
    BackgroundTasks,
    Depends,
    FastAPI,
    File,
    Form,
    HTTPException,
    Response,
    UploadFile,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import (
    DOCTORS,
    AuthenticationError,
    AuthenticatedDoctor,
    authenticate,
    get_current_doctor,
    require_scope,
    require_standard_clinician,
)
from app.break_glass import (
    BreakGlassAuthorizationError,
    create_ephemeral_token,
    record_break_glass_block,
    validate_dual_authorization,
    verify_audit_chain,
)
from app.schemas import (
    AppointmentCheckinRequest,
    AppointmentCheckinResponse,
    AppointmentOut,
    AppointmentStatusUpdate,
    AsyncJobResponse,
    AuditChainBlockOut,
    AuditChainVerifyResponse,
    AuditEventOut,
    BreakGlassRequest,
    BreakGlassResponse,
    GraphCypherResponse,
    GraphSubgraphResponse,
    GraphSyncResponse,
    JobStatusOut,
    LoginRequest,
    LoginResponse,
    PatientSearchResult,
    PatientSummary,
    PipelineResult,
    PipelineStep,
    RagChunkOut,
    RagQueryRequest,
    RagQueryResponse,
    UploadResponse,
)
from src.agents.flashcard_agent import FlashcardAgent
from src.agents.pipeline import _STEP_ORDER, ClinicalIngestionPipeline
from src.db.database import SessionLocal, get_db, get_upload_dir, init_db
from src.db.models import (
    Allergy,
    Appointment,
    Condition,
    Medication,
    Patient,
    SafetyAlert,
    SourceDocument,
)
from src.db.patient_service import PatientService
from src.engine.audit_logger import AuditLogger
from src.services.fhir_service import FHIRService
from src.services.job_service import job_manager
from src.services.neo4j_adapter import neo4j_adapter
from src.services.ocr_service import sha256_of
from src.services.rag_service import rag_service

@asynccontextmanager
async def lifespan(_: FastAPI):
    """Create the schema once at startup and ensure demo patients are seeded in dev runtime."""
    init_db()
    is_testing = bool(
        "PYTEST_CURRENT_TEST" in os.environ
        or "test" in os.getenv("DATABASE_URL", "").lower()
    )
    if not is_testing:
        try:
            from scripts.seed_demo_patients import seed_demo_patients
            db = SessionLocal()
            try:
                if not db.scalar(select(Patient).where(Patient.patient_code == "OPD-ARJUN")):
                    seed_demo_patients(db)
            finally:
                db.close()
        except Exception:
            pass
    yield


app = FastAPI(
    title="SynapseHealth API Gateway",
    description=(
        "Agentic multimodal clinical intelligence: fragmented medical records in, "
        "a verified patient profile, deterministic safety alerts, and a precomputed "
        "emergency flashcard out."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:8000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

patient_service = PatientService()
flashcard_agent = FlashcardAgent()
pipeline = ClinicalIngestionPipeline(patient_service=patient_service)
audit_logger = AuditLogger()
fhir_service = FHIRService()

_ALLOWED_SUFFIXES = (".pdf", ".png", ".jpg", ".jpeg", ".tif", ".tiff", ".webp")
_MAX_UPLOAD_BYTES = 20 * 1024 * 1024


@app.get("/")
def root() -> Dict[str, Any]:
    """Service banner and health probe."""
    return {
        "service": "SynapseHealth API Gateway",
        "version": app.version,
        "status": "operational",
        "docs": "/docs",
    }


@app.get("/api/health")
def health() -> Dict[str, Any]:
    """Health check used by the frontend before enabling upload."""
    return {"status": "healthy", "gemini_configured": pipeline.extraction_agent.vision_service.is_configured}


@app.post("/api/auth/login", response_model=LoginResponse)
def login(request: LoginRequest) -> LoginResponse:
    """Exchange doctor credentials for a bearer token."""
    try:
        token = authenticate(request.doctor_id, request.password)
    except AuthenticationError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    record = DOCTORS[request.doctor_id]
    return LoginResponse(
        access_token=token,
        doctor_id=request.doctor_id,
        display_name=record["display_name"],
        role=record["role"],
        expires_in=8 * 60 * 60,
    )


@app.post(
    "/api/records",
    response_model=UploadResponse,
    status_code=status.HTTP_201_CREATED,
)
def upload_record(
    file: UploadFile = File(..., description="Medical record PDF or image."),
    patient_code: str = Form(default="SH-1024"),
    patient_name: str = Form(default="Unknown Patient"),
    db: Session = Depends(get_db),
    doctor: AuthenticatedDoctor = Depends(require_standard_clinician),
) -> UploadResponse:
    """Accept a medical record and run it through the full agent pipeline."""
    filename = file.filename or "upload"
    suffix = f".{filename.rsplit('.', 1)[-1].lower()}" if "." in filename else ""
    if suffix not in _ALLOWED_SUFFIXES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported file type '{suffix or filename}'. Upload a PDF, PNG, JPEG, TIFF, or WEBP.",
        )

    file_bytes = file.file.read()
    if not file_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty."
        )
    if len(file_bytes) > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds the {_MAX_UPLOAD_BYTES // (1024 * 1024)} MB prototype limit.",
        )

    patient = patient_service.get_or_create_patient(
        db, patient_code=patient_code, full_name=patient_name
    )

    document = SourceDocument(
        patient_id=patient.id,
        filename=filename,
        mime_type=file.content_type,
        size_bytes=len(file_bytes),
        sha256=sha256_of(file_bytes),
    )
    db.add(document)
    db.flush()

    audit_logger.record(
        db,
        actor=doctor.doctor_id,
        action="record.uploaded",
        resource_type="source_document",
        # Anchored to the patient code, not just the document id, so the event is reachable
        # from that patient's audit trail. Without this, "who added this record" is
        # unanswerable from the patient view even though the row exists.
        resource_id=patient.patient_code,
        detail={"document_id": document.id, "filename": filename, "sha256": document.sha256},
    )

    safe_filename = Path(filename).name
    (get_upload_dir() / f"{document.id}_{safe_filename}").write_bytes(file_bytes)

    outcome = pipeline.run(db, patient, document, file_bytes)

    audit_logger.record(
        db,
        actor=doctor.doctor_id,
        action="record.processed",
        resource_type="source_document",
        resource_id=patient.patient_code,
        detail={
            "document_id": document.id,
            "entities": outcome.as_dict()["entities_extracted"],
            "alerts": outcome.as_dict()["safety_alerts"],
        },
    )
    db.commit()

    return UploadResponse(
        document_id=document.id,
        patient_code=patient.patient_code,
        filename=filename,
        message=f"Processed {outcome.as_dict()['entities_extracted']} entities with {outcome.as_dict()['safety_alerts']} safety finding(s).",
    )


def _run_ingestion_background(
    job_id: str,
    patient_id: int,
    document_id: int,
    file_bytes: bytes,
    actor_id: str,
    action_type: str = "record.processed",
) -> None:
    """Execute clinical pipeline in background and update JobManager progress."""
    db = SessionLocal()
    try:
        patient = db.get(Patient, patient_id)
        document = db.get(SourceDocument, document_id)
        if not patient or not document:
            job_manager.mark_failed(job_id, "Patient or source document could not be resolved.")
            return

        def _step_cb(step_key: str, status_str: str, detail: Optional[str] = None) -> None:
            job_manager.update_step(job_id, step_key, status_str, detail)

        outcome = pipeline.run(db, patient, document, file_bytes, step_callback=_step_cb)

        audit_logger.record(
            db,
            actor=actor_id,
            action=action_type,
            resource_type="source_document",
            resource_id=patient.patient_code,
            detail={
                "document_id": document.id,
                "entities": outcome.as_dict()["entities_extracted"],
                "alerts": outcome.as_dict()["safety_alerts"],
                "job_id": job_id,
            },
        )
        db.commit()
        job_manager.mark_completed(job_id, outcome.as_dict())
    except Exception as exc:
        db.rollback()
        job_manager.mark_failed(job_id, str(exc))
    finally:
        db.close()


@app.post(
    "/api/records/async",
    response_model=AsyncJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def upload_record_async(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(..., description="Medical record PDF or image."),
    patient_code: str = Form(default="SH-1024"),
    patient_name: str = Form(default="Unknown Patient"),
    db: Session = Depends(get_db),
    doctor: AuthenticatedDoctor = Depends(require_standard_clinician),
) -> AsyncJobResponse:
    """Accept a medical record and queue it for asynchronous background ingestion."""
    filename = file.filename or "upload"
    suffix = f".{filename.rsplit('.', 1)[-1].lower()}" if "." in filename else ""
    if suffix not in _ALLOWED_SUFFIXES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported file type '{suffix or filename}'. Upload a PDF, PNG, JPEG, TIFF, or WEBP.",
        )

    file_bytes = file.file.read()
    if not file_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty."
        )
    if len(file_bytes) > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds the {_MAX_UPLOAD_BYTES // (1024 * 1024)} MB prototype limit.",
        )

    patient = patient_service.get_or_create_patient(
        db, patient_code=patient_code, full_name=patient_name
    )

    document = SourceDocument(
        patient_id=patient.id,
        filename=filename,
        mime_type=file.content_type,
        size_bytes=len(file_bytes),
        sha256=sha256_of(file_bytes),
    )
    db.add(document)
    db.flush()

    audit_logger.record(
        db,
        actor=doctor.doctor_id,
        action="record.uploaded_async",
        resource_type="source_document",
        resource_id=patient.patient_code,
        detail={"document_id": document.id, "filename": filename, "sha256": document.sha256},
    )

    safe_filename = Path(filename).name
    (get_upload_dir() / f"{document.id}_{safe_filename}").write_bytes(file_bytes)
    db.commit()

    job = job_manager.create_job(
        patient_code=patient.patient_code,
        patient_name=patient.full_name,
        filename=filename,
        document_id=document.id,
    )

    background_tasks.add_task(
        _run_ingestion_background,
        job.job_id,
        patient.id,
        document.id,
        file_bytes,
        doctor.doctor_id,
        "record.processed",
    )

    return AsyncJobResponse(
        job_id=job.job_id,
        document_id=document.id,
        patient_code=patient.patient_code,
        filename=filename,
        status="queued",
        status_url=f"/api/jobs/{job.job_id}",
        message="Medical record accepted and queued for asynchronous ingestion.",
    )



@app.get("/api/pipeline/{document_id}", response_model=PipelineResult)
def pipeline_result(
    document_id: int,
    db: Session = Depends(get_db),
    doctor: AuthenticatedDoctor = Depends(get_current_doctor),
) -> PipelineResult:
    """Return the recorded agent-pipeline breakdown for one processed document."""
    document = db.get(SourceDocument, document_id)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

    patient = db.get(Patient, document.patient_id)
    if patient is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found.")

    profile = patient_service.build_profile(db, patient)
    entity_keys = ("conditions", "medications", "allergies", "lab_values", "procedures")
    code_keys = (("conditions", "icd10_code"), ("medications", "rxnorm_code"), ("lab_values", "loinc_code"))

    return PipelineResult(
        document_id=document.id,
        patient_code=patient.patient_code,
        document_type=document.doc_type or "unknown",
        steps=[
            PipelineStep(key=key, label=label, status="complete")
            for key, label in _STEP_ORDER
        ],
        entities_extracted=sum(len(profile[key]) for key in entity_keys),
        normalized_count=sum(
            1
            for group, code_key in code_keys
            for item in profile[group]
            if item.get(code_key)
        ),
        safety_alerts=len(profile["safety_alerts"]),
        critical_alerts=sum(
            1 for alert in profile["safety_alerts"] if alert["severity"] == "critical"
        ),
        warnings=[
            f"{alert['severity'].upper()}: {alert['title']}" for alert in profile["safety_alerts"]
        ],
        flashcard=flashcard_agent.retrieve(db, patient),
    )


@app.get("/api/patients", response_model=List[PatientSummary])
def list_patients(
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    doctor: AuthenticatedDoctor = Depends(require_standard_clinician),
) -> List[PatientSummary]:
    """List or search patients whose records have been ingested."""
    statement = select(Patient).order_by(Patient.full_name)
    if search:
        pattern = f"%{search.strip()}%"
        statement = statement.where(
            Patient.full_name.ilike(pattern) | Patient.patient_code.ilike(pattern)
        )

    results: List[PatientSummary] = []
    for patient in db.scalars(statement.limit(50)).all():
        record_count = db.scalar(
            select(func.count(SourceDocument.id)).where(SourceDocument.patient_id == patient.id)
        ) or 0
        critical = db.scalar(
            select(func.count(SafetyAlert.id)).where(
                SafetyAlert.patient_id == patient.id, SafetyAlert.severity == "critical"
            )
        ) or 0
        results.append(
            PatientSummary(
                patient_code=patient.patient_code,
                full_name=patient.full_name,
                age=patient.age,
                sex=patient.sex,
                blood_group=patient.blood_group,
                record_count=record_count,
                critical_alert_count=critical,
            )
        )

    return results


@app.get("/api/patients/{patient_code}/profile")
def patient_profile(
    patient_code: str,
    db: Session = Depends(get_db),
    doctor: AuthenticatedDoctor = Depends(require_standard_clinician),
) -> Dict[str, Any]:
    """Return the consolidated clinical profile and longitudinal timeline."""
    patient = db.scalar(select(Patient).where(Patient.patient_code == patient_code))
    if patient is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found.")

    audit_logger.record(
        db,
        actor=doctor.doctor_id,
        action="profile.viewed",
        resource_type="patient",
        resource_id=patient.patient_code,
    )
    db.commit()

    return patient_service.build_profile(db, patient)


@app.get("/api/patients/{patient_code}/flashcard")
def emergency_flashcard(
    patient_code: str,
    db: Session = Depends(get_db),
    doctor: AuthenticatedDoctor = Depends(require_scope("emergency:flashcard:read")),
) -> Dict[str, Any]:
    """Return the cached emergency flashcard, computing it on first access."""
    if doctor.role == "emergency_break_glass":
        if doctor.patient_boundary != patient_code:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Forbidden: Ephemeral token is restricted to patient '{doctor.patient_boundary}' and cannot access '{patient_code}'.",
            )

    patient = db.scalar(select(Patient).where(Patient.patient_code == patient_code))
    if patient is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found.")

    started = datetime.utcnow()
    payload = flashcard_agent.retrieve(db, patient)
    cache_hit = payload is not None

    if payload is None:
        payload = flashcard_agent.compute(db, patient).as_dict()
        db.commit()

    payload["retrieval"] = {
        "cache_hit": cache_hit,
        "elapsed_ms": int((datetime.utcnow() - started).total_seconds() * 1000),
        "target_ms": 3000,
    }

    audit_logger.record(
        db,
        actor=doctor.doctor_id,
        action="flashcard.retrieved",
        resource_type="patient",
        resource_id=patient.patient_code,
        detail={"cache_hit": cache_hit},
    )
    db.commit()

    return payload


@app.get("/api/patients/{patient_code}/audit", response_model=List[AuditEventOut])
def patient_audit(
    patient_code: str,
    limit: int = 50,
    db: Session = Depends(get_db),
    doctor: AuthenticatedDoctor = Depends(require_standard_clinician),
) -> List[AuditEventOut]:
    """Return the access audit trail for one patient.

    Filtered on the patient code alone, without a resource-type filter, so the trail shows
    every event that touched the record: clinician reads, flashcard retrievals, and the
    document uploads that built the profile in the first place.
    """
    patient = db.scalar(select(Patient).where(Patient.patient_code == patient_code))
    if patient is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found.")

    return [
        AuditEventOut(**event)
        for event in audit_logger.trail(
            db, resource_id=patient.patient_code, limit=limit
        )
    ]


@app.post("/api/emergency/break-glass", response_model=BreakGlassResponse)
def break_glass_override(
    payload: BreakGlassRequest,
    db: Session = Depends(get_db),
) -> BreakGlassResponse:
    """Execute dual-signature Break-Glass emergency override for an unconscious/unattended patient."""
    try:
        validate_dual_authorization(
            doctor_license_id=payload.doctor_id,
            doctor_password=payload.doctor_password,
            nurse_cosigner_id=payload.nurse_cosigner_id,
            nurse_password=payload.nurse_password,
            clinical_reason_code=payload.clinical_reason_code,
        )
    except BreakGlassAuthorizationError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc

    patient = db.scalar(select(Patient).where(Patient.patient_code == payload.patient_code))
    if patient is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient '{payload.patient_code}' not found.",
        )

    token = create_ephemeral_token(
        doctor_id=payload.doctor_id,
        nurse_cosigner_id=payload.nurse_cosigner_id,
        patient_code=payload.patient_code,
        clinical_reason_code=payload.clinical_reason_code,
    )

    audit_block = record_break_glass_block(
        db=db,
        doctor_id=payload.doctor_id,
        nurse_cosigner_id=payload.nurse_cosigner_id,
        patient_code=payload.patient_code,
        clinical_reason_code=payload.clinical_reason_code,
        justification=payload.justification_notes,
    )

    audit_logger.record(
        db,
        actor=payload.doctor_id,
        action="emergency.break_glass_executed",
        resource_type="patient",
        resource_id=payload.patient_code,
        detail={
            "nurse_cosigner_id": payload.nurse_cosigner_id,
            "clinical_reason_code": payload.clinical_reason_code,
            "audit_block_index": audit_block.block_index,
            "audit_block_hash": audit_block.current_hash,
            "justification": payload.justification_notes,
        },
    )
    db.commit()

    return BreakGlassResponse(
        access_token=token,
        token_type="bearer",
        scope="emergency:flashcard:read",
        expires_in=3600,
        patient_code=payload.patient_code,
        doctor_id=payload.doctor_id,
        nurse_cosigner_id=payload.nurse_cosigner_id,
        clinical_reason_code=payload.clinical_reason_code,
        audit_block_hash=audit_block.current_hash,
        message="Audited emergency Break-Glass override executed successfully. 60-minute ephemeral token issued.",
    )


@app.get("/api/emergency/audit-chain/verify", response_model=AuditChainVerifyResponse)
def verify_audit_chain_endpoint(
    db: Session = Depends(get_db),
    doctor: AuthenticatedDoctor = Depends(get_current_doctor),
) -> AuditChainVerifyResponse:
    """Cryptographically verify the tamper-evident SHA-256 audit ledger."""
    report = verify_audit_chain(db)
    return AuditChainVerifyResponse(
        verified=report["verified"],
        total_blocks=report["total_blocks"],
        genesis_hash=report["genesis_hash"],
        latest_hash=report.get("latest_hash"),
        chain=[AuditChainBlockOut(**block) for block in report.get("chain", [])],
        detail=report["detail"],
    )


@app.get("/api/patients/{patient_code}/fhir")
def export_patient_fhir(
    patient_code: str,
    db: Session = Depends(get_db),
    doctor: AuthenticatedDoctor = Depends(require_standard_clinician),
) -> Response:
    """Export patient record as a standard HL7 FHIR Release 4 JSON Bundle."""
    patient = db.scalar(select(Patient).where(Patient.patient_code == patient_code))
    if patient is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found.")

    bundle = fhir_service.export_patient_bundle(db, patient)
    audit_logger.record(
        db,
        actor=doctor.doctor_id,
        action="fhir.exported",
        resource_type="patient",
        resource_id=patient.patient_code,
        detail={"resource_type": "Bundle", "total_entries": bundle.get("total", 0)},
    )
    db.commit()

    return Response(
        content=json.dumps(bundle, indent=2),
        media_type="application/fhir+json",
        headers={"Content-Disposition": f'inline; filename="fhir_{patient_code}.json"'},
    )


@app.get("/api/patients/{patient_code}/graph/cypher", response_model=GraphCypherResponse)
def get_patient_graph_cypher(
    patient_code: str,
    db: Session = Depends(get_db),
    doctor: AuthenticatedDoctor = Depends(require_standard_clinician),
) -> GraphCypherResponse:
    """Generate declarative Neo4j Cypher statements with graph schema constraints."""
    patient = db.scalar(select(Patient).where(Patient.patient_code == patient_code))
    if patient is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found.")
    export = neo4j_adapter.generate_cypher(patient)
    return GraphCypherResponse(
        patient_code=export.patient_code,
        constraints=export.constraints,
        statements=export.statements,
        cypher_script=export.cypher_script,
        nodes_count=export.nodes_count,
        edges_count=export.edges_count,
        metadata=export.metadata,
    )


@app.post("/api/patients/{patient_code}/graph/sync", response_model=GraphSyncResponse)
def sync_patient_graph_neo4j(
    patient_code: str,
    db: Session = Depends(get_db),
    doctor: AuthenticatedDoctor = Depends(require_standard_clinician),
) -> GraphSyncResponse:
    """Synchronize clinical record graph to Neo4j instance or execute Cypher validation."""
    patient = db.scalar(select(Patient).where(Patient.patient_code == patient_code))
    if patient is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found.")
    result = neo4j_adapter.sync_patient_graph(patient)
    return GraphSyncResponse(**result)


@app.get("/api/patients/{patient_code}/graph/subgraph", response_model=GraphSubgraphResponse)
def get_patient_subgraph(
    patient_code: str,
    db: Session = Depends(get_db),
    doctor: AuthenticatedDoctor = Depends(require_standard_clinician),
) -> GraphSubgraphResponse:
    """Return structured JSON clinical graph (nodes, edges, contraindications) for graph visualization."""
    patient = db.scalar(select(Patient).where(Patient.patient_code == patient_code))
    if patient is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found.")
    subgraph = neo4j_adapter.get_connected_subgraph(patient)
    return GraphSubgraphResponse(**subgraph)


@app.post(
    "/api/patients/{patient_code}/rag/query",
    response_model=RagQueryResponse,
)
def query_patient_rag(
    patient_code: str,
    payload: RagQueryRequest,
    doctor: AuthenticatedDoctor = Depends(require_standard_clinician),
    db: Session = Depends(get_db),
) -> RagQueryResponse:
    """Execute patient-scoped vector similarity query in Qdrant with grounded spatial bounding boxes."""
    patient = db.scalar(select(Patient).where(Patient.patient_code == patient_code))
    if patient is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient '{patient_code}' not found.",
        )

    # 1. Search Qdrant vector index for this patient
    results = rag_service.search(
        patient_code=patient.patient_code,
        query=payload.query,
        top_k=payload.top_k,
    )

    # 2. If vector index has no chunks for this patient yet, index documents on-the-fly
    if not results and patient.documents:
        for doc in patient.documents:
            doc_bytes = b""
            if doc.filename:
                file_path = get_upload_dir() / f"{doc.id}_{Path(doc.filename).name}"
                if file_path.exists():
                    try:
                        doc_bytes = file_path.read_bytes()
                    except Exception:
                        pass
            doc_chunks = rag_service.extract_document_chunks(
                file_bytes=doc_bytes,
                document_id=doc.id,
                patient_code=patient.patient_code,
                document_title=doc.filename,
                extracted_text=doc.extracted_text,
            )
            rag_service.index_chunks(doc_chunks)

        # Re-query after on-the-fly indexing
        results = rag_service.search(
            patient_code=patient.patient_code,
            query=payload.query,
            top_k=payload.top_k,
        )

    # 3. Synthesize grounded answer
    answer = rag_service.synthesize_answer(
        patient_code=patient.patient_code,
        query=payload.query,
        chunks=results,
    )

    # 4. Audit trail
    audit_logger.record(
        db,
        actor=doctor.doctor_id,
        action="patient.rag_queried",
        resource_type="rag_index",
        resource_id=patient.patient_code,
        detail={
            "query": payload.query,
            "top_k": payload.top_k,
            "results_count": len(results),
            "backend": rag_service.backend,
        },
    )
    db.commit()

    return RagQueryResponse(
        patient_code=patient.patient_code,
        query=payload.query,
        answer=answer,
        results_count=len(results),
        chunks=[
            RagChunkOut(
                chunk_id=r["chunk_id"],
                document_id=r.get("document_id"),
                document_title=r.get("document_title"),
                patient_code=r["patient_code"],
                page=r["page"],
                bbox=r["bbox"],
                text=r["text"],
                score=r["score"],
            )
            for r in results
        ],
        backend=rag_service.backend,
    )



@app.get("/api/portal/patients")
def portal_list_patients(
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    """List available patient profiles for patient portal self-selection."""
    patients = db.scalars(select(Patient).order_by(Patient.full_name)).all()
    return [
        {
            "patient_code": p.patient_code,
            "full_name": p.full_name,
            "age": p.age,
            "sex": p.sex,
            "blood_group": p.blood_group,
            "contact": p.contact,
            "emergency_contact": p.emergency_contact,
        }
        for p in patients
    ]


@app.get("/api/portal/patients/{patient_code}")
def portal_patient_profile(
    patient_code: str,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Retrieve patient health locker profile without clinician credentials."""
    patient = db.scalar(select(Patient).where(Patient.patient_code == patient_code))
    if patient is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found.")
    return patient_service.build_profile(db, patient)


@app.post(
    "/api/portal/upload",
    response_model=UploadResponse,
    status_code=status.HTTP_201_CREATED,
)
def portal_upload_record(
    file: UploadFile = File(..., description="Prescription or lab report PDF/image"),
    patient_code: str = Form(default="OPD-ARJUN"),
    db: Session = Depends(get_db),
) -> UploadResponse:
    """Patient self-service upload of medical records into personal locker."""
    filename = file.filename or "upload"
    suffix = f".{filename.rsplit('.', 1)[-1].lower()}" if "." in filename else ""
    if suffix not in _ALLOWED_SUFFIXES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported file type '{suffix or filename}'. Upload a PDF, PNG, JPEG, TIFF, or WEBP.",
        )

    file_bytes = file.file.read()
    if not file_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty."
        )
    if len(file_bytes) > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds the {_MAX_UPLOAD_BYTES // (1024 * 1024)} MB limit.",
        )

    patient = db.scalar(select(Patient).where(Patient.patient_code == patient_code))
    if patient is None:
        patient = patient_service.get_or_create_patient(
            db, patient_code=patient_code, full_name="Self-Enrolled Patient"
        )

    document = SourceDocument(
        patient_id=patient.id,
        filename=filename,
        mime_type=file.content_type,
        size_bytes=len(file_bytes),
        sha256=sha256_of(file_bytes),
    )
    db.add(document)
    db.flush()

    audit_logger.record(
        db,
        actor=f"patient:{patient.patient_code}",
        action="portal.record_uploaded",
        resource_type="source_document",
        resource_id=patient.patient_code,
        detail={"document_id": document.id, "filename": filename, "sha256": document.sha256},
    )

    safe_filename = Path(filename).name
    (get_upload_dir() / f"{document.id}_{safe_filename}").write_bytes(file_bytes)

    outcome = pipeline.run(db, patient, document, file_bytes)

    audit_logger.record(
        db,
        actor=f"patient:{patient.patient_code}",
        action="portal.record_processed",
        resource_type="source_document",
        resource_id=patient.patient_code,
        detail={
            "document_id": document.id,
            "entities": outcome.as_dict()["entities_extracted"],
            "alerts": outcome.as_dict()["safety_alerts"],
        },
    )
    db.commit()

    return UploadResponse(
        document_id=document.id,
        patient_code=patient.patient_code,
        filename=filename,
        message=f"Ingested {outcome.as_dict()['entities_extracted']} entities with {outcome.as_dict()['safety_alerts']} safety alert(s).",
    )


@app.post(
    "/api/portal/upload/async",
    response_model=AsyncJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def portal_upload_record_async(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(..., description="Prescription or lab report PDF/image"),
    patient_code: str = Form(default="OPD-ARJUN"),
    db: Session = Depends(get_db),
) -> AsyncJobResponse:
    """Queue patient self-service upload for asynchronous background ingestion."""
    filename = file.filename or "upload"
    suffix = f".{filename.rsplit('.', 1)[-1].lower()}" if "." in filename else ""
    if suffix not in _ALLOWED_SUFFIXES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported file type '{suffix or filename}'. Upload a PDF, PNG, JPEG, TIFF, or WEBP.",
        )

    file_bytes = file.file.read()
    if not file_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty."
        )
    if len(file_bytes) > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds the {_MAX_UPLOAD_BYTES // (1024 * 1024)} MB limit.",
        )

    patient = db.scalar(select(Patient).where(Patient.patient_code == patient_code))
    if patient is None:
        patient = patient_service.get_or_create_patient(
            db, patient_code=patient_code, full_name="Self-Enrolled Patient"
        )

    document = SourceDocument(
        patient_id=patient.id,
        filename=filename,
        mime_type=file.content_type,
        size_bytes=len(file_bytes),
        sha256=sha256_of(file_bytes),
    )
    db.add(document)
    db.flush()

    audit_logger.record(
        db,
        actor=f"patient:{patient.patient_code}",
        action="portal.record_uploaded_async",
        resource_type="source_document",
        resource_id=patient.patient_code,
        detail={"document_id": document.id, "filename": filename, "sha256": document.sha256},
    )

    safe_filename = Path(filename).name
    (get_upload_dir() / f"{document.id}_{safe_filename}").write_bytes(file_bytes)
    db.commit()

    job = job_manager.create_job(
        patient_code=patient.patient_code,
        patient_name=patient.full_name,
        filename=filename,
        document_id=document.id,
    )

    background_tasks.add_task(
        _run_ingestion_background,
        job.job_id,
        patient.id,
        document.id,
        file_bytes,
        f"patient:{patient.patient_code}",
        "portal.record_processed",
    )

    return AsyncJobResponse(
        job_id=job.job_id,
        document_id=document.id,
        patient_code=patient.patient_code,
        filename=filename,
        status="queued",
        status_url=f"/api/jobs/{job.job_id}",
        message="Patient record accepted and queued for asynchronous ingestion.",
    )


@app.get("/api/jobs/{job_id}", response_model=JobStatusOut)
def get_job_status(job_id: str) -> JobStatusOut:
    """Fetch status and progress percentage of a background ingestion job."""
    job = job_manager.get_job(job_id)
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Ingestion job '{job_id}' not found.",
        )
    return JobStatusOut(**job.as_dict())


@app.get("/api/jobs", response_model=List[JobStatusOut])
def list_jobs(limit: int = 50) -> List[JobStatusOut]:
    """List recent background ingestion jobs."""
    return [JobStatusOut(**j.as_dict()) for j in job_manager.list_jobs(limit=limit)]



# =============================================================================
# Reception Queue & Dynamic Patient Search Endpoints
# =============================================================================

@app.get("/api/reception/queue", response_model=List[AppointmentOut])
def get_reception_queue(
    db: Session = Depends(get_db),
) -> List[AppointmentOut]:
    """Return all active appointments and queue tokens for today."""
    appointments = db.scalars(select(Appointment).order_by(Appointment.id)).all()
    return [
        AppointmentOut(
            id=app_item.id,
            patient_code=app_item.patient_code,
            token_number=app_item.token_number,
            patient_name=app_item.patient_name,
            department=app_item.department,
            doctor_name=app_item.doctor_name,
            scheduled_time=app_item.scheduled_time,
            status=app_item.status,
            chief_complaint=app_item.chief_complaint,
            created_at=app_item.created_at.isoformat() if app_item.created_at else None,
        )
        for app_item in appointments
    ]


@app.post("/api/reception/queue/checkin", response_model=AppointmentCheckinResponse)
def checkin_patient_queue(
    payload: AppointmentCheckinRequest,
    db: Session = Depends(get_db),
) -> AppointmentCheckinResponse:
    """Register an appointment or check-in a patient, assigning a token and visit ID."""
    import random

    total = db.scalar(select(func.count(Appointment.id))) or 0
    token_str = f"{total + 1:03d}"
    visit_id = f"HOSP{random.randint(100000, 999999)}"

    patient = db.scalar(select(Patient).where(Patient.patient_code == payload.patient_code))
    if patient is None:
        patient = Patient(
            patient_code=payload.patient_code,
            full_name=payload.patient_name,
        )
        db.add(patient)
        db.flush()

    new_app = Appointment(
        patient_code=payload.patient_code,
        token_number=token_str,
        patient_name=payload.patient_name,
        department=payload.department or "General Medicine",
        doctor_name=payload.doctor_name or "Dr. Meera Thomas",
        scheduled_time=payload.scheduled_time or "10:00 AM",
        status="checked_in",
        chief_complaint=payload.chief_complaint or "Clinic consultation",
    )
    db.add(new_app)
    db.commit()

    return AppointmentCheckinResponse(
        id=new_app.id,
        token_number=token_str,
        patient_code=payload.patient_code,
        patient_name=payload.patient_name,
        visit_id=visit_id,
        scheduled_time=new_app.scheduled_time,
        status=new_app.status,
        message=f"Appointment confirmed for {payload.patient_name}. Token #{token_str} assigned.",
    )


@app.patch("/api/reception/queue/{appointment_id}/status", response_model=AppointmentOut)
def update_appointment_status(
    appointment_id: int,
    payload: AppointmentStatusUpdate,
    db: Session = Depends(get_db),
) -> AppointmentOut:
    """Update status of a queue record (e.g., waiting -> in_consultation -> consulted)."""
    appointment = db.get(Appointment, appointment_id)
    if appointment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Appointment {appointment_id} not found.",
        )
    appointment.status = payload.status
    db.commit()
    return AppointmentOut(
        id=appointment.id,
        patient_code=appointment.patient_code,
        token_number=appointment.token_number,
        patient_name=appointment.patient_name,
        department=appointment.department,
        doctor_name=appointment.doctor_name,
        scheduled_time=appointment.scheduled_time,
        status=appointment.status,
        chief_complaint=appointment.chief_complaint,
        created_at=appointment.created_at.isoformat() if appointment.created_at else None,
    )


@app.get("/api/patients/search", response_model=List[PatientSearchResult])
def search_patients_dynamic(
    q: str = "",
    db: Session = Depends(get_db),
) -> List[PatientSearchResult]:
    """Dynamically search patient records across name, code, or phone number."""
    query_str = q.strip()
    statement = select(Patient)
    if query_str:
        pattern = f"%{query_str}%"
        statement = statement.where(
            Patient.patient_code.ilike(pattern)
            | Patient.full_name.ilike(pattern)
            | Patient.contact.ilike(pattern)
        )
    patients = db.scalars(statement.limit(20)).all()

    results: List[PatientSearchResult] = []
    for p in patients:
        allergies = [a.substance for a in p.allergies]
        chronic_conds = [c.name for c in p.conditions if c.is_chronic or c.status == "active"]
        active_meds = sum(1 for m in p.medications if m.status == "active")
        record_count = len(p.documents)
        results.append(
            PatientSearchResult(
                patient_code=p.patient_code,
                full_name=p.full_name,
                age=p.age,
                sex=p.sex,
                blood_group=p.blood_group,
                contact=p.contact,
                emergency_contact=p.emergency_contact,
                allergies=allergies,
                chronic_conditions=chronic_conds,
                active_medications_count=active_meds,
                record_count=record_count,
            )
        )
    return results


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)