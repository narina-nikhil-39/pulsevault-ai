"""
SynapseHealth — API Schemas
Pydantic request and response contracts for the FastAPI gateway.
"""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class PipelineStep(BaseModel):
    """One stage of the visible ingestion pipeline shown on the processing screen."""

    key: str = Field(example="document_uploaded")
    label: str = Field(example="Document uploaded")
    status: str = Field(default="pending", example="complete")
    detail: Optional[str] = Field(default=None, example="discharge_summary.pdf")


class PipelineResult(BaseModel):
    """The full outcome of running one document through the agent pipeline."""

    document_id: int
    patient_code: str
    document_type: str
    steps: List[PipelineStep]
    entities_extracted: int
    normalized_count: int
    safety_alerts: int
    critical_alerts: int
    warnings: List[str] = []
    flashcard: Optional[Dict[str, Any]] = None


class LoginRequest(BaseModel):
    """Doctor sign-in credentials."""

    doctor_id: str = Field(default="DR-001", example="DR-001")
    password: str = Field(default="demo1234", example="demo1234")


class LoginResponse(BaseModel):
    """Issued access token and the identity it represents."""

    access_token: str
    token_type: str = "bearer"
    doctor_id: str
    display_name: str
    role: str
    expires_in: int = Field(description="Token lifetime in seconds.")


class PatientSummary(BaseModel):
    """A patient row in the dashboard search list."""

    patient_code: str
    full_name: str
    age: Optional[int] = None
    sex: Optional[str] = None
    blood_group: Optional[str] = None
    record_count: int = 0
    critical_alert_count: int = 0


class UploadResponse(BaseModel):
    """Acknowledgement returned immediately after a document is accepted."""

    document_id: int
    patient_code: str
    filename: str
    status: str = "accepted"
    message: str = Field(
        default="Document queued for processing.",
        example="Document queued for processing.",
    )


class AuditEventOut(BaseModel):
    """One row of the access audit trail."""

    id: int
    actor: str
    action: str
    resource_type: Optional[str] = None
    resource_id: Optional[str] = None
    detail: Dict[str, Any] = {}
    created_at: Optional[str] = None