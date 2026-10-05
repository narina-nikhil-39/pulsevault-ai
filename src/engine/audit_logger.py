"""
SynapseHealth — Access Audit Logger
Append-only record of clinician access and pipeline execution against patient records.
The prototype writes to the local audit_events table; the production design swaps the
sink for an immutable external store without changing call sites.
"""

import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.db.models import AuditEvent

# Replaced in the production design by a remote tamper-evident sink.
_HASH_PLACEHOLDER = "local-sqlite"


class AuditLogger:
    """Records and retrieves audit events for a single database session."""

    def __init__(self, db: Optional[Session] = None):
        self.db = db

    def record(
        self,
        db: Session,
        actor: str,
        action: str,
        resource_type: Optional[str] = None,
        resource_id: Optional[str] = None,
        detail: Optional[Dict[str, Any]] = None,
    ) -> AuditEvent:
        """Append one audit event and return the persisted row."""
        event = AuditEvent(
            actor=actor,
            action=action,
            resource_type=resource_type,
            resource_id=str(resource_id) if resource_id is not None else None,
            detail_json=json.dumps(detail or {}, default=str),
        )
        db.add(event)
        db.flush()
        return event

    def trail(
        self,
        db: Session,
        resource_type: Optional[str] = None,
        resource_id: Optional[str] = None,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        """Return recent audit events, newest first, optionally filtered."""
        statement = select(AuditEvent).order_by(AuditEvent.created_at.desc()).limit(limit)

        if resource_type:
            statement = statement.where(AuditEvent.resource_type == resource_type)
        if resource_id is not None:
            statement = statement.where(AuditEvent.resource_id == str(resource_id))

        events = db.scalars(statement).all()
        return [
            {
                "id": event.id,
                "actor": event.actor,
                "action": event.action,
                "resource_type": event.resource_type,
                "resource_id": event.resource_id,
                "detail": _safe_json(event.detail_json),
                "created_at": event.created_at.isoformat() if event.created_at else None,
            }
            for event in events
        ]


def _safe_json(raw: Optional[str]) -> Dict[str, Any]:
    """Parse a JSON detail column, returning an empty mapping when unreadable."""
    try:
        parsed = json.loads(raw or "{}")
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {"value": parsed}


def utc_now() -> str:
    """Return an ISO-8601 UTC timestamp."""
    return datetime.now(timezone.utc).isoformat()


global_audit_logger = AuditLogger()