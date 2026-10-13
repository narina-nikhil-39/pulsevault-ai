"""
SynapseHealth — Doctor Authentication
Prototype clinician authentication issuing a signed bearer token. Passwords are stored
as salted hashes; the production design replaces this with hospital SSO plus OTP-based
patient consent and a zero-trust break-glass path.
"""

import hashlib
import hmac
import os
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

_DEFAULT_SECRET = "synapsehealth-dev-secret-do-not-use-in-production"
_SECRET_KEY_STR = os.getenv("AUTH_SECRET_KEY", _DEFAULT_SECRET)
if os.getenv("ENVIRONMENT") == "production" and _SECRET_KEY_STR == _DEFAULT_SECRET:
    raise RuntimeError("AUTH_SECRET_KEY environment variable MUST be explicitly set in production mode.")
_SECRET_KEY = _SECRET_KEY_STR.encode()
_TOKEN_TTL_SECONDS = 8 * 60 * 60

_bearer_scheme = HTTPBearer(auto_error=False)


@dataclass
class AuthenticatedDoctor:
    """The clinician identity carried by a valid token."""

    doctor_id: str
    display_name: str
    role: str
    scope: Optional[str] = None
    patient_boundary: Optional[str] = None

    def as_dict(self) -> Dict[str, Any]:
        return {
            "doctor_id": self.doctor_id,
            "display_name": self.display_name,
            "role": self.role,
            "scope": self.scope,
            "patient_boundary": self.patient_boundary,
        }


class AuthenticationError(Exception):
    """Raised when credentials or a bearer token are invalid."""

    pass


def hash_password(password: str, salt: Optional[bytes] = None) -> str:
    """Hash a password with a per-user salt using PBKDF2-HMAC-SHA256."""
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 120_000)
    return f"{salt.hex()}${digest.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    """Verify a password against a stored ``salt$hash`` string in constant time."""
    try:
        salt_hex, digest_hex = stored_hash.split("$", 1)
    except ValueError:
        return False

    candidate = hashlib.pbkdf2_hmac(
        "sha256", password.encode(), bytes.fromhex(salt_hex), 120_000
    )
    return hmac.compare_digest(candidate.hex(), digest_hex)


# Seeded prototype clinicians. Replace with an identity provider before any real use.
DOCTORS: Dict[str, Dict[str, str]] = {
    "DR-001": {
        "display_name": "Dr. Ananya Rao",
        "role": "attending_physician",
        "password_hash": hash_password("demo1234"),
    },
    "DR-002": {
        "display_name": "Dr. Vikram Menon",
        "role": "emergency_physician",
        "password_hash": hash_password("demo1234"),
    },
}

NURSES: Dict[str, Dict[str, str]] = {
    "RN-001": {
        "display_name": "Nurse Sarah Jenkins",
        "role": "charge_nurse",
        "password_hash": hash_password("nurse1234"),
    },
    "RN-002": {
        "display_name": "Nurse Priya Sharma",
        "role": "triage_nurse",
        "password_hash": hash_password("nurse1234"),
    },
}


def authenticate(doctor_id: str, password: str) -> str:
    """Validate credentials and return a signed bearer token."""
    record = DOCTORS.get(doctor_id)
    if record is None or not verify_password(password, record["password_hash"]):
        raise AuthenticationError("Invalid doctor ID or password.")

    issued_at = datetime.now(timezone.utc)
    payload = f"{doctor_id}:{issued_at.timestamp()}"
    signature = hmac.new(_SECRET_KEY, payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}:{signature}"


def decode_token(token: str) -> AuthenticatedDoctor:
    """Validate a bearer token (standard clinician or break-glass ephemeral) and return identity."""
    # Support 60-minute Break-Glass Ephemeral JWT tokens
    if token.count(".") == 2:
        try:
            payload = jwt.decode(token, _SECRET_KEY, algorithms=["HS256"])
            if payload.get("token_type") == "break_glass":
                doctor_id = payload.get("doctor_id") or payload.get("sub", "EMERGENCY_MD")
                record = DOCTORS.get(doctor_id, {
                    "display_name": f"Emergency Doctor ({doctor_id})",
                    "role": "emergency_break_glass",
                })
                return AuthenticatedDoctor(
                    doctor_id=doctor_id,
                    display_name=record.get("display_name", f"Emergency Doctor ({doctor_id})"),
                    role="emergency_break_glass",
                    scope=payload.get("scope"),
                    patient_boundary=payload.get("patient_code"),
                )
        except jwt.ExpiredSignatureError as exc:
            raise AuthenticationError("Ephemeral emergency token has expired.") from exc
        except jwt.InvalidTokenError as exc:
            raise AuthenticationError(f"Invalid emergency token: {exc}") from exc

    parts = token.split(":")
    if len(parts) != 3:
        raise AuthenticationError("Malformed access token.")

    doctor_id, issued_raw, signature = parts
    payload = f"{doctor_id}:{issued_raw}"
    expected = hmac.new(_SECRET_KEY, payload.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(expected, signature):
        raise AuthenticationError("Invalid token signature.")

    record = DOCTORS.get(doctor_id)
    if record is None:
        raise AuthenticationError("Unknown doctor.")

    issued_at = datetime.fromtimestamp(float(issued_raw), tz=timezone.utc)
    if datetime.now(timezone.utc) - issued_at > timedelta(seconds=_TOKEN_TTL_SECONDS):
        raise AuthenticationError("Access token has expired.")

    return AuthenticatedDoctor(
        doctor_id=doctor_id,
        display_name=record["display_name"],
        role=record["role"],
    )


def get_current_doctor(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme),
) -> AuthenticatedDoctor:
    """FastAPI dependency enforcing a valid bearer token on protected routes."""
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Sign in to access patient records.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        return decode_token(credentials.credentials)
    except AuthenticationError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


def require_scope(required_scope: str):
    """FastAPI dependency enforcing that break-glass emergency tokens possess the required scope."""

    def dependency(
        doctor: AuthenticatedDoctor = Depends(get_current_doctor),
    ) -> AuthenticatedDoctor:
        if doctor.role == "emergency_break_glass":
            if doctor.scope != required_scope:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Forbidden: Ephemeral emergency token does not possess scope '{required_scope}'.",
                )
        return doctor

    return dependency


def require_standard_clinician(
    doctor: AuthenticatedDoctor = Depends(get_current_doctor),
) -> AuthenticatedDoctor:
    """FastAPI dependency blocking break-glass emergency tokens from standard non-emergency routes."""
    if doctor.role == "emergency_break_glass":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Break-glass emergency tokens cannot access non-emergency clinical endpoints.",
        )
    return doctor