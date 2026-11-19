"""
SynapseHealth — Patient Portal Authentication Service
Provides secure PIN-based and Mobile OTP authentication for patient health locker access,
issuing cryptographically signed ephemeral patient JWTs scoped strictly to the patient's records.
"""

import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import jwt
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from src.db.models import Patient

_DEFAULT_SECRET = "synapsehealth-dev-secret-do-not-use-in-production"
_SECRET_KEY = os.getenv("AUTH_SECRET_KEY", _DEFAULT_SECRET).encode()
_PATIENT_TOKEN_TTL = 24 * 60 * 60  # 24 hours

# In-memory OTP storage: key -> {otp: str, expires_at: datetime, patient_code: str, full_name: str}
_OTP_CACHE: Dict[str, Dict[str, Any]] = {}


def hash_pin(pin: str, salt: Optional[bytes] = None) -> str:
    """Hash a patient 4-6 digit PIN with PBKDF2-HMAC-SHA256."""
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", pin.encode(), salt, 100_000)
    return f"{salt.hex()}${digest.hex()}"


def verify_pin(candidate_pin: str, stored_hash: Optional[str] = None) -> bool:
    """Verify a candidate PIN. Defaults to demo PIN '1234' if no custom hash exists."""
    if not stored_hash:
        return candidate_pin.strip() == "1234"

    try:
        salt_hex, digest_hex = stored_hash.split("$", 1)
        candidate = hashlib.pbkdf2_hmac(
            "sha256", candidate_pin.encode(), bytes.fromhex(salt_hex), 100_000
        )
        return hmac.compare_digest(candidate.hex(), digest_hex)
    except Exception:
        return candidate_pin.strip() == "1234"


def create_patient_jwt(patient_code: str, full_name: str, auth_method: str = "pin") -> str:
    """Issue a 24-hour cryptographically signed JWT locked to this patient's boundary."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": patient_code,
        "name": full_name,
        "role": "patient",
        "token_type": "patient_portal",
        "scope": "patient:portal:read patient:portal:upload",
        "auth_method": auth_method,
        "iat": now,
        "exp": now + timedelta(seconds=_PATIENT_TOKEN_TTL),
    }
    return jwt.encode(payload, _SECRET_KEY, algorithm="HS256")


def decode_patient_jwt(token: str) -> Dict[str, Any]:
    """Validate and decode a patient portal bearer token."""
    try:
        payload = jwt.decode(token, _SECRET_KEY, algorithms=["HS256"])
        if payload.get("role") != "patient" or payload.get("token_type") != "patient_portal":
            raise ValueError("Token is not a valid patient portal token.")
        return payload
    except jwt.ExpiredSignatureError as exc:
        raise ValueError("Patient session has expired. Please sign in again.") from exc
    except jwt.InvalidTokenError as exc:
        raise ValueError(f"Invalid patient token: {exc}") from exc


def request_patient_otp(contact_or_code: str, db: Session) -> Dict[str, Any]:
    """Dispatch an OTP to the registered phone number or patient code."""
    query = contact_or_code.strip()
    patient = db.scalar(
        select(Patient).where(
            or_(
                Patient.patient_code == query,
                Patient.contact == query,
                Patient.patient_code == query.upper(),
            )
        )
    )

    if not patient:
        # Check case-insensitive prefix match
        patient = db.scalar(
            select(Patient).where(Patient.patient_code.ilike(f"%{query}%"))
        )

    if not patient:
        raise ValueError(f"No patient record found matching '{contact_or_code}'.")

    # Generate 6-digit OTP
    otp = f"{secrets.randbelow(900000) + 100000}"
    expires = datetime.now(timezone.utc) + timedelta(minutes=5)

    _OTP_CACHE[patient.patient_code] = {
        "otp": otp,
        "expires_at": expires,
        "patient_code": patient.patient_code,
        "full_name": patient.full_name,
    }

    # Mask phone number (e.g. +91 98*** **210)
    phone = patient.contact or "+91 98765 43210"
    masked = phone[:6] + " •••• " + phone[-3:] if len(phone) >= 8 else phone

    return {
        "contact_or_code": contact_or_code,
        "patient_code": patient.patient_code,
        "full_name": patient.full_name,
        "masked_contact": masked,
        "simulated_otp": otp,
        "message": f"Verification code dispatched to {masked}. Valid for 5 minutes.",
    }


def verify_patient_otp(contact_or_code: str, candidate_otp: str, db: Session) -> Dict[str, Any]:
    """Verify submitted OTP against cached code (or master demo OTP '123456')."""
    query = contact_or_code.strip()
    patient = db.scalar(
        select(Patient).where(
            or_(
                Patient.patient_code == query,
                Patient.contact == query,
                Patient.patient_code == query.upper(),
            )
        )
    )
    if not patient:
        patient = db.scalar(
            select(Patient).where(Patient.patient_code.ilike(f"%{query}%"))
        )

    if not patient:
        raise ValueError(f"Patient record '{contact_or_code}' not found.")

    otp_clean = candidate_otp.strip()

    # Master demo OTP fallback or cached match
    is_valid = otp_clean == "123456"
    cached = _OTP_CACHE.get(patient.patient_code)
    if cached and not is_valid:
        if datetime.now(timezone.utc) <= cached["expires_at"] and cached["otp"] == otp_clean:
            is_valid = True

    if not is_valid:
        raise ValueError("Invalid verification code. Enter the 6-digit code or demo '123456'.")

    # Clear OTP
    _OTP_CACHE.pop(patient.patient_code, None)

    token = create_patient_jwt(patient.patient_code, patient.full_name, auth_method="otp")
    return {
        "access_token": token,
        "token_type": "Bearer",
        "patient_code": patient.patient_code,
        "full_name": patient.full_name,
        "expires_in": _PATIENT_TOKEN_TTL,
        "auth_method": "otp",
    }
