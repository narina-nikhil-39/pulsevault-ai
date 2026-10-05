"""
Shared pytest fixtures: an isolated on-disk SQLite database per test, plus a
SyntheticPatient cohort for corpus-driven tests.
"""

import os
import sys
from pathlib import Path

import pytest

_PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_PROJECT_ROOT))

# Point every test run at a throwaway database before the app module is imported,
# so the developer's real data/synapsehealth.db is never touched by a test.
_TEST_DB = _PROJECT_ROOT / "data" / "test_synapsehealth.db"
_TEST_DB.parent.mkdir(parents=True, exist_ok=True)
_TEST_DB.unlink(missing_ok=True)
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB.as_posix()}"
os.environ["UPLOAD_DIR"] = str(_PROJECT_ROOT / "data" / "test_uploads")
# Force the deterministic lexicon path so the suite does not depend on a live API key.
os.environ["GEMINI_API_KEY"] = ""

from src.db.database import Base, SessionLocal, engine, init_db  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _database() -> None:
    """Create the test schema once per session."""
    init_db()


@pytest.fixture
def db():
    """Yield a session bound to the test database, rolled back per test."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


@pytest.fixture
def client():
    """Yield a FastAPI test client with authentication already satisfied."""
    from fastapi.testclient import TestClient

    from app.auth import DOCTORS, authenticate
    from app.main import app

    token = authenticate("DR-001", "demo1234")
    with TestClient(app, headers={"Authorization": f"Bearer {token}"}) as test_client:
        test_client.doctor_token = token
        yield test_client

    assert DOCTORS["DR-001"]["role"] == "attending_physician"


@pytest.fixture
def anon_client():
    """Yield an unauthenticated FastAPI test client."""
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(scope="session")
def cohort():
    """The fixed synthetic cohort used by corpus-driven tests."""
    from scripts.generate_synthetic_corpus import _build_patients

    return _build_patients()


@pytest.fixture(scope="session")
def corpus_dir(cohort) -> Path:
    """Generate the synthetic corpus into a temporary directory for this session."""
    import tempfile

    from scripts.generate_synthetic_corpus import generate

    target = Path(tempfile.mkdtemp(prefix="synapse_corpus_"))
    generate(target, cohort)
    return target


@pytest.fixture(autouse=True)
def _clean_tables():
    """Delete all rows between tests so tests stay order-independent."""
    yield
    with engine.begin() as connection:
        for table in reversed(Base.metadata.sorted_tables):
            connection.execute(table.delete())
