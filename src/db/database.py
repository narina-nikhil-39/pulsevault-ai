"""
SynapseHealth — Database Engine & Session Management
Provides the SQLAlchemy engine, session factory, and FastAPI dependency for the
SQLite-backed clinical store.
"""

import os
from pathlib import Path
from typing import Iterator, Optional

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from src.db.models import Base

load_dotenv()

_PROJECT_ROOT = Path(__file__).resolve().parents[2]


def _resolve_database_url() -> str:
    """Return the configured database URL, coerced to an absolute SQLite path."""
    raw = os.getenv("DATABASE_URL", "sqlite:///./data/synapsehealth.db")

    if not raw.startswith("sqlite:///"):
        return raw

    relative_path = raw[len("sqlite:///") :]
    if relative_path == ":memory:":
        return raw

    db_path = Path(relative_path)
    if not db_path.is_absolute():
        db_path = _PROJECT_ROOT / db_path

    db_path.parent.mkdir(parents=True, exist_ok=True)
    return f"sqlite:///{db_path.as_posix()}"


DATABASE_URL = _resolve_database_url()

connect_args = (
    {"check_same_thread": False, "timeout": 30.0}
    if DATABASE_URL.startswith("sqlite")
    else {}
)

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    future=True,
)

if DATABASE_URL.startswith("sqlite"):
    from sqlalchemy import event

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        try:
            if ":memory:" not in DATABASE_URL:
                cursor.execute("PRAGMA journal_mode=WAL;")
            cursor.execute("PRAGMA synchronous=NORMAL;")
        finally:
            cursor.close()

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def init_db() -> None:
    """Create all tables declared on the declarative base."""
    Base.metadata.create_all(bind=engine)


def get_db() -> Iterator[Session]:
    """FastAPI dependency yielding a scoped database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def reset_db() -> None:
    """Drop and recreate every table. Intended for tests and local reseeding only."""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def get_upload_dir() -> Path:
    """Return the configured upload directory, creating it if absent."""
    raw = os.getenv("UPLOAD_DIR", "./data/uploads")
    upload_dir = Path(raw)
    if not upload_dir.is_absolute():
        upload_dir = _PROJECT_ROOT / upload_dir
    upload_dir.mkdir(parents=True, exist_ok=True)
    return upload_dir