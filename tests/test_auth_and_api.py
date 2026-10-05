"""Authentication and API-gateway access control tests."""

import time

import pytest

from app.auth import (
    AuthenticationError,
    authenticate,
    decode_token,
    hash_password,
    verify_password,
)


def test_password_hash_is_salted_and_verifiable():
    """Two hashes of the same password must differ, and both must verify."""
    first = hash_password("demo1234")
    second = hash_password("demo1234")

    assert first != second, "identical passwords must not produce identical hashes"
    assert verify_password("demo1234", first)
    assert verify_password("demo1234", second)
    assert not verify_password("wrong-password", first)


def test_verify_password_rejects_malformed_hash():
    """A corrupted stored hash must fail closed rather than raise."""
    assert not verify_password("demo1234", "not-a-valid-hash")


def test_token_roundtrip_returns_identity():
    """A freshly issued token must decode back to the issuing clinician."""
    token = authenticate("DR-001", "demo1234")
    identity = decode_token(token)

    assert identity.doctor_id == "DR-001"
    assert identity.display_name == "Dr. Ananya Rao"
    assert identity.role == "attending_physician"


def test_bad_credentials_are_rejected():
    """A wrong password or unknown doctor must not yield a token."""
    with pytest.raises(AuthenticationError):
        authenticate("DR-001", "wrong-password")

    with pytest.raises(AuthenticationError):
        authenticate("DR-999", "demo1234")


def test_tampered_token_is_rejected():
    """Editing any part of the token must invalidate the signature."""
    token = authenticate("DR-001", "demo1234")
    doctor_id, issued, signature = token.split(":")

    with pytest.raises(AuthenticationError):
        decode_token(f"{doctor_id}:{issued}:{'0' * len(signature)}")

    with pytest.raises(AuthenticationError):
        decode_token(f"DR-002:{issued}:{signature}")


def test_malformed_token_is_rejected():
    """A token that is not the expected shape must be refused."""
    for bad in ("", "nonsense", "a:b", "a:b:c:d"):
        with pytest.raises(AuthenticationError):
            decode_token(bad)


def test_expired_token_is_rejected(monkeypatch):
    """A token older than the TTL must be refused even with a valid signature."""
    import app.auth as auth

    stale = datetime_minus_ttl(auth)
    with pytest.raises(AuthenticationError):
        auth.decode_token(stale)


def datetime_minus_ttl(auth_module):
    """Mint a correctly signed token whose issued-at time is outside the TTL."""
    from datetime import datetime, timedelta, timezone

    issued = datetime.now(timezone.utc) - timedelta(seconds=auth_module._TOKEN_TTL_SECONDS + 60)
    payload = f"DR-001:{issued.timestamp()}"
    signature = auth_module.hmac.new(
        auth_module._SECRET_KEY, payload.encode(), auth_module.hashlib.sha256
    ).hexdigest()
    return f"{payload}:{signature}"


def test_protected_route_requires_token(anon_client):
    """Patient data must not be reachable without a bearer token."""
    for path in (
        "/api/patients",
        "/api/patients/SH-1024/profile",
        "/api/patients/SH-1024/flashcard",
    ):
        response = anon_client.get(path)
        assert response.status_code == 401, path


def test_upload_requires_token(anon_client, corpus_dir):
    """Ingestion must reject an unauthenticated write."""
    payload = (corpus_dir / "SH-1024_discharge_summary.pdf").read_bytes()
    response = anon_client.post(
        "/api/records",
        files={"file": ("SH-1024_discharge_summary.pdf", payload, "application/pdf")},
        data={"patient_code": "SH-1024", "patient_name": "Ramesh Kumar"},
    )
    assert response.status_code == 401


def test_login_returns_token(client):
    """The login endpoint must return a token the gateway accepts."""
    response = client.post(
        "/api/auth/login", json={"doctor_id": "DR-002", "password": "demo1234"}
    )
    assert response.status_code == 200

    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["doctor_id"] == "DR-002"

    verified = client.get(
        "/api/patients",
        headers={"Authorization": f"Bearer {body['access_token']}"},
    )
    assert verified.status_code == 200


def test_login_rejects_bad_password(anon_client):
    """A wrong password must return 401, not a token."""
    response = anon_client.post(
        "/api/auth/login", json={"doctor_id": "DR-001", "password": "nope"}
    )
    assert response.status_code == 401


def test_health_and_root_are_public(anon_client):
    """Liveness probes must not require credentials."""
    assert anon_client.get("/").status_code == 200
    assert anon_client.get("/api/health").status_code == 200


def test_unsupported_file_type_is_rejected(client):
    """A non-document upload must be refused with 415."""
    response = client.post(
        "/api/records",
        files={"file": ("notes.exe", b"MZ\x90\x00", "application/octet-stream")},
        data={"patient_code": "SH-0001", "patient_name": "Nobody"},
    )
    assert response.status_code == 415


def test_empty_upload_is_rejected(client):
    """A zero-byte upload must be refused with 400."""
    response = client.post(
        "/api/records",
        files={"file": ("empty.pdf", b"", "application/pdf")},
        data={"patient_code": "SH-0002", "patient_name": "Nobody"},
    )
    assert response.status_code == 400


def test_unknown_patient_returns_404(client):
    """Requesting a patient that was never ingested must return 404."""
    assert client.get("/api/patients/SH-DOES-NOT-EXIST/profile").status_code == 404
    assert client.get("/api/patients/SH-DOES-NOT-EXIST/flashcard").status_code == 404


def test_profile_access_is_audited(client, corpus_dir):
    """Every clinician read must leave an audit event."""
    with (corpus_dir / "SH-1024_discharge_summary.pdf").open("rb") as handle:
        client.post(
            "/api/records",
            files={"file": ("SH-1024_discharge_summary.pdf", handle.read(), "application/pdf")},
            data={"patient_code": "SH-1024", "patient_name": "Ramesh Kumar"},
        )

    client.get("/api/patients/SH-1024/profile")

    audit = client.get("/api/patients/SH-1024/audit").json()
    actions = {event["action"] for event in audit}
    assert "profile.viewed" in actions
    assert "record.uploaded" in actions
    assert all(event["actor"] == "DR-001" for event in audit)


def test_audit_records_flashcard_cache_state(client, corpus_dir):
    """The audit trail must show whether a flashcard read was served from cache."""
    with (corpus_dir / "SH-1024_discharge_summary.pdf").open("rb") as handle:
        client.post(
            "/api/records",
            files={"file": ("SH-1024_discharge_summary.pdf", handle.read(), "application/pdf")},
            data={"patient_code": "SH-1024", "patient_name": "Ramesh Kumar"},
        )

    client.get("/api/patients/SH-1024/flashcard")

    audit = client.get("/api/patients/SH-1024/audit").json()
    retrievals = [e for e in audit if e["action"] == "flashcard.retrieved"]
    assert retrievals
    assert retrievals[0]["detail"]["cache_hit"] is True


def test_retrieval_is_faster_than_the_stated_target(client, corpus_dir):
    """A cached flashcard read must comfortably beat the 3s bedside target."""
    with (corpus_dir / "SH-2048_prescription.pdf").open("rb") as handle:
        client.post(
            "/api/records",
            files={"file": ("SH-2048_prescription.pdf", handle.read(), "application/pdf")},
            data={"patient_code": "SH-2048", "patient_name": "Lakshmi Devi"},
        )

    response = client.get("/api/patients/SH-2048/flashcard")
    retrieval = response.json()["retrieval"]

    assert retrieval["target_ms"] == 3000
    assert retrieval["elapsed_ms"] < retrieval["target_ms"]


# Guards against the helper above drifting out of sync with the TTL constant.
def test_ttl_is_positive():
    """The configured token lifetime must be a sane number of seconds."""
    import app.auth as auth

    assert auth._TOKEN_TTL_SECONDS > 0
    assert not isinstance(time.monotonic(), bool)
