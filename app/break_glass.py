"""
PulseVault AI — Break-Glass Emergency Protocol & Cryptographic Audit Ledger
Provides dual-signature authorization for emergency triage, issuing a 60-minute
ephemeral token restricted to emergency scopes, and recording an append-only
cryptographic block hash chain (SHA-256) for non-repudiation.
"""

import hashlib
import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import jwt
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import _SECRET_KEY, DOCTORS, NURSES, verify_password
from src.db.models import AuditChainBlock

GENESIS_HASH = "0" * 64
EPHEMERAL_TOKEN_TTL_SECONDS = 3600  # 60 minutes
EMERGENCY_SCOPE = "emergency:flashcard:read"

VALID_CLINICAL_REASONS: Dict[str, str] = {
    "TRAUMA_UNCONSCIOUS": "Unconscious trauma victim requiring immediate life-saving emergency triage.",
    "CARDIAC_ARREST": "Cardiac arrest with inaccessible medical history during resuscitation.",
    "MASS_CASUALTY": "Mass casualty event triage with unresponsive or unidentified patient.",
    "UNRESPONSIVE_OVERDOSE": "Suspected toxic ingestion or overdose in an unresponsive patient.",
    "ACUTE_ANAPHYLAXIS": "Severe anaphylactic shock requiring urgent allergy and medication verification.",
    "CRITICAL_HYPOXIA": "Acute respiratory failure requiring emergency airway and intubation history.",
}


class BreakGlassAuthorizationError(Exception):
    """Raised when dual-signature authorization fails or reason code is invalid."""

    pass


def validate_dual_authorization(
    doctor_license_id: str,
    doctor_password: str,
    nurse_cosigner_id: str,
    nurse_password: str,
    clinical_reason_code: str,
) -> Dict[str, Any]:
    """Verify credentials for both the attending physician and the co-signing nurse.

    Enforces:
    1. Attending doctor exists with valid password.
    2. Co-signing nurse exists with valid password.
    3. Doctor and nurse must be distinct individuals.
    4. Clinical reason code must be recognized.
    """
    if doctor_license_id == nurse_cosigner_id:
        raise BreakGlassAuthorizationError(
            "Dual-signature requires distinct clinicians. Doctor and co-signing nurse cannot share the same ID."
        )

    doc_rec = DOCTORS.get(doctor_license_id)
    if doc_rec is None or not verify_password(doctor_password, doc_rec["password_hash"]):
        raise BreakGlassAuthorizationError("Invalid attending doctor credentials.")

    nurse_rec = NURSES.get(nurse_cosigner_id)
    if nurse_rec is None or not verify_password(nurse_password, nurse_rec["password_hash"]):
        raise BreakGlassAuthorizationError("Invalid co-signing nurse credentials.")

    if clinical_reason_code not in VALID_CLINICAL_REASONS:
        valid_options = ", ".join(VALID_CLINICAL_REASONS.keys())
        raise BreakGlassAuthorizationError(
            f"Invalid clinical reason code '{clinical_reason_code}'. Must be one of: {valid_options}"
        )

    return {
        "doctor": doc_rec,
        "nurse": nurse_rec,
        "reason_description": VALID_CLINICAL_REASONS[clinical_reason_code],
    }


def create_ephemeral_token(
    doctor_id: str,
    nurse_cosigner_id: str,
    patient_code: str,
    clinical_reason_code: str,
    expires_in: int = EPHEMERAL_TOKEN_TTL_SECONDS,
) -> str:
    """Issue a 60-minute cryptographically signed JWT with restricted emergency scope."""
    now = datetime.now(timezone.utc)
    now_ts = int(now.timestamp())
    payload = {
        "sub": doctor_id,
        "doctor_id": doctor_id,
        "nurse_cosigner_id": nurse_cosigner_id,
        "patient_code": patient_code,
        "scope": EMERGENCY_SCOPE,
        "token_type": "break_glass",
        "clinical_reason_code": clinical_reason_code,
        "iat": now_ts,
        "exp": now_ts + expires_in,
    }
    return jwt.encode(payload, _SECRET_KEY, algorithm="HS256")


def _format_timestamp(dt: Any) -> str:
    """Format datetime as UTC ISO-8601 second-precision string for stable hash verification."""
    if not dt:
        return ""
    if isinstance(dt, datetime):
        return dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    dt_str = str(dt)
    return dt_str[:19] + "Z" if len(dt_str) >= 19 else dt_str


def record_break_glass_block(
    db: Session,
    doctor_id: str,
    nurse_cosigner_id: str,
    patient_code: str,
    clinical_reason_code: str,
    justification: Optional[str] = None,
) -> AuditChainBlock:
    """Record an immutable audit block with SHA-256 hash chaining."""
    last_block = db.scalars(
        select(AuditChainBlock).order_by(AuditChainBlock.block_index.desc()).limit(1)
    ).first()

    if last_block is None:
        block_index = 0
        prev_hash = GENESIS_HASH
    else:
        block_index = last_block.block_index + 1
        prev_hash = last_block.current_hash

    now_dt = datetime.now(timezone.utc)
    timestamp_iso = _format_timestamp(now_dt)
    justification_str = (justification or "").strip()

    payload_data = {
        "actor_doctor": doctor_id,
        "actor_nurse": nurse_cosigner_id,
        "block_index": block_index,
        "clinical_reason_code": clinical_reason_code,
        "justification": justification_str,
        "patient_code": patient_code,
        "prev_hash": prev_hash,
        "timestamp": timestamp_iso,
    }

    canonical_payload = json.dumps(payload_data, sort_keys=True).encode("utf-8")
    payload_hash = hashlib.sha256(canonical_payload).hexdigest()

    block_input = f"{prev_hash}:{payload_hash}:{timestamp_iso}".encode("utf-8")
    current_hash = hashlib.sha256(block_input).hexdigest()

    block = AuditChainBlock(
        block_index=block_index,
        timestamp=now_dt,
        actor_doctor=doctor_id,
        actor_nurse=nurse_cosigner_id,
        patient_code=patient_code,
        clinical_reason_code=clinical_reason_code,
        justification=justification_str,
        prev_hash=prev_hash,
        payload_hash=payload_hash,
        current_hash=current_hash,
    )
    db.add(block)
    db.flush()
    return block


def verify_audit_chain(db: Session) -> Dict[str, Any]:
    """Traverse all blocks in the cryptographic ledger and verify block hash integrity."""
    blocks = db.scalars(
        select(AuditChainBlock).order_by(AuditChainBlock.block_index.asc())
    ).all()

    if not blocks:
        return {
            "verified": True,
            "total_blocks": 0,
            "genesis_hash": GENESIS_HASH,
            "latest_hash": None,
            "chain": [],
            "detail": "Cryptographic audit chain is empty and valid.",
        }

    chain_details: List[Dict[str, Any]] = []

    for idx, block in enumerate(blocks):
        # 1. Verify sequence ordering
        if block.block_index != idx:
            return {
                "verified": False,
                "total_blocks": len(blocks),
                "genesis_hash": GENESIS_HASH,
                "latest_hash": blocks[-1].current_hash if blocks else None,
                "chain": chain_details,
                "tampered_block_index": idx,
                "detail": f"Block sequence anomaly: expected index {idx}, got {block.block_index}",
            }

        # 2. Verify prev_hash link
        expected_prev = GENESIS_HASH if idx == 0 else blocks[idx - 1].current_hash
        if block.prev_hash != expected_prev:
            return {
                "verified": False,
                "total_blocks": len(blocks),
                "genesis_hash": GENESIS_HASH,
                "latest_hash": blocks[-1].current_hash if blocks else None,
                "chain": chain_details,
                "tampered_block_index": idx,
                "detail": f"Hash pointer broken at block {idx}: prev_hash does not match prior block current_hash.",
            }

        # 3. Verify payload_hash
        timestamp_iso = _format_timestamp(block.timestamp)
        payload_data = {
            "actor_doctor": block.actor_doctor,
            "actor_nurse": block.actor_nurse,
            "block_index": block.block_index,
            "clinical_reason_code": block.clinical_reason_code,
            "justification": block.justification,
            "patient_code": block.patient_code,
            "prev_hash": block.prev_hash,
            "timestamp": timestamp_iso,
        }
        canonical_payload = json.dumps(payload_data, sort_keys=True).encode("utf-8")
        recomputed_payload_hash = hashlib.sha256(canonical_payload).hexdigest()

        if recomputed_payload_hash != block.payload_hash:
            return {
                "verified": False,
                "total_blocks": len(blocks),
                "genesis_hash": GENESIS_HASH,
                "latest_hash": blocks[-1].current_hash if blocks else None,
                "chain": chain_details,
                "tampered_block_index": idx,
                "detail": f"Payload tamper detected at block {idx}: recomputed payload hash differs.",
            }

        # 4. Verify current_hash
        block_input = f"{block.prev_hash}:{block.payload_hash}:{timestamp_iso}".encode("utf-8")
        recomputed_current_hash = hashlib.sha256(block_input).hexdigest()

        if recomputed_current_hash != block.current_hash:
            return {
                "verified": False,
                "total_blocks": len(blocks),
                "genesis_hash": GENESIS_HASH,
                "latest_hash": blocks[-1].current_hash if blocks else None,
                "chain": chain_details,
                "tampered_block_index": idx,
                "detail": f"Block seal tamper detected at block {idx}: current_hash signature mismatch.",
            }

        chain_details.append(
            {
                "block_index": block.block_index,
                "timestamp": timestamp_iso,
                "actor_doctor": block.actor_doctor,
                "actor_nurse": block.actor_nurse,
                "patient_code": block.patient_code,
                "clinical_reason_code": block.clinical_reason_code,
                "justification": block.justification,
                "prev_hash": block.prev_hash,
                "payload_hash": block.payload_hash,
                "current_hash": block.current_hash,
            }
        )

    return {
        "verified": True,
        "total_blocks": len(blocks),
        "genesis_hash": GENESIS_HASH,
        "latest_hash": blocks[-1].current_hash,
        "chain": chain_details,
        "detail": f"All {len(blocks)} cryptographic audit blocks verified with zero anomalies.",
    }
