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


class BreakGlassRequest(BaseModel):
    """Dual-signature emergency override request for unconscious/unattended patients."""

    patient_code: str = Field(..., example="PT-1001", description="Target patient identifier.")
    doctor_id: str = Field(default="DR-001", example="DR-001", description="Attending physician license ID.")
    doctor_password: str = Field(default="demo1234", example="demo1234", description="Doctor password.")
    nurse_cosigner_id: str = Field(default="RN-001", example="RN-001", description="Charge nurse co-signer ID.")
    nurse_password: str = Field(default="nurse1234", example="nurse1234", description="Nurse password.")
    clinical_reason_code: str = Field(
        ...,
        example="TRAUMA_UNCONSCIOUS",
        description="Mandatory emergency justification reason code.",
    )
    justification_notes: Optional[str] = Field(
        default=None,
        example="Unconscious trauma patient with severe blood loss, no phone or family available.",
        description="Free-form clinical emergency justification.",
    )


class BreakGlassResponse(BaseModel):
    """Ephemeral access token and cryptographic audit confirmation for Break-Glass triage."""

    access_token: str
    token_type: str = "bearer"
    scope: str = "emergency:flashcard:read"
    expires_in: int = Field(default=3600, description="Token lifetime in seconds (60 minutes).")
    patient_code: str
    doctor_id: str
    nurse_cosigner_id: str
    clinical_reason_code: str
    audit_block_hash: str = Field(description="SHA-256 seal of the immutable audit block.")
    message: str


class AuditChainBlockOut(BaseModel):
    """One immutable block in the cryptographic SHA-256 ledger."""

    block_index: int
    timestamp: str
    actor_doctor: str
    actor_nurse: str
    patient_code: str
    clinical_reason_code: str
    justification: str
    prev_hash: str
    payload_hash: str
    current_hash: str


class AuditChainVerifyResponse(BaseModel):
    """Cryptographic verification report for the audit ledger."""

    verified: bool
    total_blocks: int
    genesis_hash: str
    latest_hash: Optional[str] = None
    chain: List[AuditChainBlockOut] = []
    detail: str


class AppointmentOut(BaseModel):
    """Queue / appointment row."""

    id: int
    patient_code: str
    token_number: str
    patient_name: str
    department: str
    doctor_name: str
    scheduled_time: str
    status: str
    chief_complaint: Optional[str] = None
    created_at: Optional[str] = None


class AppointmentCheckinRequest(BaseModel):
    """Request to check-in or book a clinic appointment at reception."""

    patient_code: str
    patient_name: str
    department: Optional[str] = "General Medicine"
    doctor_name: Optional[str] = "Dr. Meera Thomas"
    scheduled_time: Optional[str] = "10:00 AM"
    chief_complaint: Optional[str] = None


class AppointmentCheckinResponse(BaseModel):
    """Confirmation returned after booking/checking-in."""

    id: int
    token_number: str
    patient_code: str
    patient_name: str
    visit_id: str
    scheduled_time: str
    status: str
    message: str


class AppointmentStatusUpdate(BaseModel):
    """Status change payload for an active appointment."""

    status: str


class PatientSearchResult(BaseModel):
    """Detailed patient search match for reception and clinical lookup."""

    patient_code: str
    full_name: str
    age: Optional[int] = None
    sex: Optional[str] = None
    blood_group: Optional[str] = None
    contact: Optional[str] = None
    emergency_contact: Optional[str] = None
    allergies: List[str] = []
    chronic_conditions: List[str] = []
    active_medications_count: int = 0
    record_count: int = 0


class AsyncJobResponse(BaseModel):
    """Acknowledgement returned when an asynchronous document ingestion job is accepted."""

    job_id: str
    document_id: int
    patient_code: str
    filename: str
    status: str = "queued"
    status_url: str
    message: str = "Document queued for background processing."


class JobStatusOut(BaseModel):
    """Status details of a background ingestion job."""

    job_id: str
    patient_code: str
    patient_name: str
    filename: str
    document_id: Optional[int] = None
    status: str
    progress: int
    current_step: str
    steps: List[Dict[str, Any]] = []
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    created_at: str
    completed_at: Optional[str] = None


class GraphCypherResponse(BaseModel):
    """Declarative Cypher script and metadata for Neo4j synchronization."""

    patient_code: str
    constraints: List[str]
    statements: List[str]
    cypher_script: str
    nodes_count: int
    edges_count: int
    metadata: Dict[str, Any] = {}


class GraphSyncResponse(BaseModel):
    """Result of clinical graph synchronization to Neo4j."""

    patient_code: str
    status: str
    backend: str
    nodes_created: int
    relationships_created: int
    message: str


class GraphSubgraphResponse(BaseModel):
    """Connected clinical node and edge structure for visual topology rendering."""

    patient_code: str
    nodes: List[Dict[str, Any]]
    links: List[Dict[str, Any]]
    total_nodes: int
    total_links: int


class RagChunkOut(BaseModel):
    """A single spatial text chunk retrieved from the Qdrant vector store."""

    chunk_id: str
    document_id: Optional[int] = None
    document_title: Optional[str] = None
    patient_code: str
    page: int
    bbox: List[float]  # [x0, y0, x1, y1]
    text: str
    score: float


class RagQueryRequest(BaseModel):
    """Query payload for patient-scoped clinical QA."""

    query: str
    top_k: int = 5


class RagQueryResponse(BaseModel):
    """Patient-scoped grounded retrieval answer and spatial source citations."""

    patient_code: str
    query: str
    answer: str
    results_count: int
    chunks: List[RagChunkOut]
    backend: str