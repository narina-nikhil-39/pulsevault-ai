"""
SynapseHealth — SQLAlchemy ORM Models
Defines the clinical patient profile schema: patients, source documents, extracted
clinical entities, deterministic safety alerts, cached emergency flashcards, and audit events.
All extracted entities carry a source document anchor so every insight is citable.
"""

from datetime import date, datetime
from typing import Optional

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    """Declarative base for all SynapseHealth ORM models."""

    pass


class Patient(Base):
    """A patient whose fragmented records are being consolidated."""

    __tablename__ = "patients"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    patient_code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(128), index=True)
    age: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    sex: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    blood_group: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)
    contact: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    emergency_contact: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    documents: Mapped[list["SourceDocument"]] = relationship(
        back_populates="patient", cascade="all, delete-orphan"
    )
    conditions: Mapped[list["Condition"]] = relationship(
        back_populates="patient", cascade="all, delete-orphan"
    )
    medications: Mapped[list["Medication"]] = relationship(
        back_populates="patient", cascade="all, delete-orphan"
    )
    allergies: Mapped[list["Allergy"]] = relationship(
        back_populates="patient", cascade="all, delete-orphan"
    )
    lab_values: Mapped[list["LabValue"]] = relationship(
        back_populates="patient", cascade="all, delete-orphan"
    )
    procedures: Mapped[list["Procedure"]] = relationship(
        back_populates="patient", cascade="all, delete-orphan"
    )
    implants: Mapped[list["Implant"]] = relationship(
        back_populates="patient", cascade="all, delete-orphan"
    )
    safety_alerts: Mapped[list["SafetyAlert"]] = relationship(
        back_populates="patient", cascade="all, delete-orphan"
    )


class SourceDocument(Base):
    """An ingested medical document, retained so extracted facts stay auditable."""

    __tablename__ = "source_documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"), index=True)
    filename: Mapped[str] = mapped_column(String(255))
    doc_type: Mapped[Optional[str]] = mapped_column(String(32), index=True)
    mime_type: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    size_bytes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    sha256: Mapped[Optional[str]] = mapped_column(String(64), index=True)
    page_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    extraction_method: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    extracted_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    processed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    patient: Mapped["Patient"] = relationship(back_populates="documents")


class CitationMixin:
    """Source anchor shared by every extracted clinical entity."""

    source_document_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("source_documents.id"), nullable=True, index=True
    )
    source_page: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    source_span: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source_confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)


class Condition(CitationMixin, Base):
    """A diagnosed or reported medical condition."""

    __tablename__ = "conditions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"), index=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    icd10_code: Mapped[Optional[str]] = mapped_column(String(16), nullable=True, index=True)
    snomed_code: Mapped[Optional[str]] = mapped_column(String(32), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(16), default="active", index=True)
    is_chronic: Mapped[bool] = mapped_column(Boolean, default=False)
    onset_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    resolved_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    patient: Mapped["Patient"] = relationship(back_populates="conditions")


class Medication(CitationMixin, Base):
    """A prescribed or active medication."""

    __tablename__ = "medications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"), index=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    rxnorm_code: Mapped[Optional[str]] = mapped_column(String(32), nullable=True, index=True)
    dose: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    dose_unit: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    frequency: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    route: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="active", index=True)
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    patient: Mapped["Patient"] = relationship(back_populates="medications")


class Allergy(CitationMixin, Base):
    """A recorded allergy, intolerance, or adverse reaction."""

    __tablename__ = "allergies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"), index=True)
    substance: Mapped[str] = mapped_column(String(255), index=True)
    snomed_code: Mapped[Optional[str]] = mapped_column(String(32), nullable=True, index=True)
    reaction: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    severity: Mapped[str] = mapped_column(String(16), default="unknown", index=True)

    patient: Mapped["Patient"] = relationship(back_populates="allergies")


class LabValue(CitationMixin, Base):
    """A single laboratory or vital-sign measurement."""

    __tablename__ = "lab_values"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"), index=True)
    test_name: Mapped[str] = mapped_column(String(255), index=True)
    loinc_code: Mapped[Optional[str]] = mapped_column(String(32), nullable=True, index=True)
    value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    value_text: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    unit: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    ref_low: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ref_high: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    flag: Mapped[Optional[str]] = mapped_column(String(16), nullable=True, index=True)
    collected_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    patient: Mapped["Patient"] = relationship(back_populates="lab_values")


class Procedure(CitationMixin, Base):
    """A surgical or therapeutic procedure the patient underwent."""

    __tablename__ = "procedures"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"), index=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    snomed_code: Mapped[Optional[str]] = mapped_column(String(32), nullable=True, index=True)
    performed_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True, index=True)
    outcome: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    patient: Mapped["Patient"] = relationship(back_populates="procedures")


class Implant(CitationMixin, Base):
    """An active implant or device, surfaced prominently on the emergency flashcard."""

    __tablename__ = "implants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"), index=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    snomed_code: Mapped[Optional[str]] = mapped_column(String(32), nullable=True, index=True)
    implanted_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    patient: Mapped["Patient"] = relationship(back_populates="implants")


class SafetyAlert(Base):
    """A deterministic finding produced by the safety guardrail agent."""

    __tablename__ = "safety_alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"), index=True)
    severity: Mapped[str] = mapped_column(String(16), index=True)
    category: Mapped[str] = mapped_column(String(32), index=True)
    title: Mapped[str] = mapped_column(String(255))
    detail: Mapped[str] = mapped_column(Text)
    involved: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    recommendation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source_document_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("source_documents.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    patient: Mapped["Patient"] = relationship(back_populates="safety_alerts")


class EmergencyFlashcard(Base):
    """Precomputed critical-patient summary, cached at ingestion for sub-3s retrieval."""

    __tablename__ = "emergency_flashcards"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    patient_id: Mapped[int] = mapped_column(
        ForeignKey("patients.id"), index=True, unique=True
    )
    payload_json: Mapped[str] = mapped_column(Text)
    version: Mapped[int] = mapped_column(Integer, default=1)
    computed_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class AuditEvent(Base):
    """Tamper-evident record of clinician access and pipeline execution."""

    __tablename__ = "audit_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    actor: Mapped[str] = mapped_column(String(64), index=True)
    action: Mapped[str] = mapped_column(String(64), index=True)
    resource_type: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    resource_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    detail_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())