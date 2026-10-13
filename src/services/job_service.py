"""
SynapseHealth — Background Ingestion Queue & Job Service
Tracks asynchronous document processing jobs with real-time percentage progress,
stage transitions, and outcome results.
"""

import threading
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional

STEP_PROGRESS_PERCENT: Dict[str, int] = {
    "document_uploaded": 15,
    "ocr_completed": 30,
    "entities_extracted": 50,
    "terminology_normalized": 65,
    "timeline_generated": 80,
    "safety_checks_completed": 90,
    "flashcard_generated": 100,
}


@dataclass
class IngestionJob:
    """An asynchronous document processing job."""

    job_id: str
    patient_code: str
    patient_name: str
    filename: str
    document_id: Optional[int] = None
    status: str = "queued"  # queued, processing, completed, failed
    progress: int = 0
    current_step: str = "document_uploaded"
    steps: List[Dict[str, Any]] = field(default_factory=list)
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    created_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    completed_at: Optional[str] = None

    def as_dict(self) -> Dict[str, Any]:
        return {
            "job_id": self.job_id,
            "patient_code": self.patient_code,
            "patient_name": self.patient_name,
            "filename": self.filename,
            "document_id": self.document_id,
            "status": self.status,
            "progress": self.progress,
            "current_step": self.current_step,
            "steps": self.steps,
            "result": self.result,
            "error": self.error,
            "created_at": self.created_at,
            "completed_at": self.completed_at,
        }


class JobManager:
    """Thread-safe registry for asynchronous ingestion jobs."""

    def __init__(self) -> None:
        self._jobs: Dict[str, IngestionJob] = {}
        self._lock = threading.Lock()

    def create_job(
        self,
        patient_code: str,
        patient_name: str,
        filename: str,
        document_id: Optional[int] = None,
    ) -> IngestionJob:
        """Create and register a new queued ingestion job."""
        job_id = f"job_{uuid.uuid4().hex[:16]}"
        job = IngestionJob(
            job_id=job_id,
            patient_code=patient_code,
            patient_name=patient_name,
            filename=filename,
            document_id=document_id,
            status="queued",
            progress=5,
            current_step="document_uploaded",
        )
        with self._lock:
            self._jobs[job_id] = job
        return job

    def get_job(self, job_id: str) -> Optional[IngestionJob]:
        """Fetch a job by ID."""
        with self._lock:
            return self._jobs.get(job_id)

    def list_jobs(self, limit: int = 50) -> List[IngestionJob]:
        """List recently created jobs in reverse chronological order."""
        with self._lock:
            jobs = list(self._jobs.values())
        jobs.sort(key=lambda j: j.created_at, reverse=True)
        return jobs[:limit]

    def update_step(
        self,
        job_id: str,
        step_key: str,
        status: str,
        detail: Optional[str] = None,
    ) -> None:
        """Advance a job stage and recalculate progress percentage."""
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return
            job.status = "processing"
            job.current_step = step_key
            job.progress = max(job.progress, STEP_PROGRESS_PERCENT.get(step_key, job.progress))

            # Update steps record list
            existing = False
            for s in job.steps:
                if s["key"] == step_key:
                    s["status"] = status
                    s["detail"] = detail
                    existing = True
                    break
            if not existing:
                job.steps.append(
                    {"key": step_key, "label": step_key.replace("_", " ").title(), "status": status, "detail": detail}
                )

    def mark_completed(self, job_id: str, outcome_dict: Dict[str, Any]) -> None:
        """Mark job as successfully finished."""
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return
            job.status = "completed"
            job.progress = 100
            job.current_step = "flashcard_generated"
            job.result = outcome_dict
            job.completed_at = datetime.now(timezone.utc).isoformat()

    def mark_failed(self, job_id: str, error_message: str) -> None:
        """Mark job as failed."""
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return
            job.status = "failed"
            job.error = error_message
            job.completed_at = datetime.now(timezone.utc).isoformat()


# Global singleton instance
job_manager = JobManager()
