"""
SynapseHealth — FastAPI Gateway
Exposes REST endpoints for doctor authentication, record ingestion, patient search,
the clinical profile, the emergency flashcard, and the access audit trail.
"""

from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import (
    DOCTORS,
    AuthenticationError,
    AuthenticatedDoctor,
    authenticate,
    get_current_doctor,
)
from app.schemas import (
    AuditEventOut,
    LoginRequest,
    LoginResponse,
    PatientSummary,
    PipelineResult,
    PipelineStep,
    UploadResponse,
)
from src.agents.flashcard_agent import FlashcardAgent
from src.agents.pipeline import _STEP_ORDER, ClinicalIngestionPipeline
from src.db.database import get_db, get_upload_dir, init_db
from src.db.models import Patient, SafetyAlert, SourceDocument
from src.db.patient_service import PatientService
from src.engine.audit_logger import AuditLogger
from src.services.ocr_service import sha256_of

@asynccontextmanager
async def lifespan(_: FastAPI):
    """Create the schema once at startup so the first request is not blocked by DDL."""
    init_db()
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
    doctor: AuthenticatedDoctor = Depends(get_current_doctor),
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
    doctor: AuthenticatedDoctor = Depends(get_current_doctor),
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
    doctor: AuthenticatedDoctor = Depends(get_current_doctor),
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
    doctor: AuthenticatedDoctor = Depends(get_current_doctor),
) -> Dict[str, Any]:
    """Return the cached emergency flashcard, computing it on first access."""
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
    doctor: AuthenticatedDoctor = Depends(get_current_doctor),
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


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)