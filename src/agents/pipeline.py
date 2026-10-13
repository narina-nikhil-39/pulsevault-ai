"""
SynapseHealth — Clinical Ingestion Pipeline
Chains the five agents into one document-processing run and records each stage so the
frontend can render the pipeline progress the project brief calls for.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional

from sqlalchemy.orm import Session

from src.agents.extraction_agent import ExtractionAgent
from src.agents.flashcard_agent import FlashcardAgent
from src.agents.ingestion_agent import IngestionAgent
from src.agents.safety_agent import SafetyAgent
from src.agents.temporal_graph_agent import TemporalGraphAgent
from src.db.models import Patient, SourceDocument
from src.db.patient_service import PatientService, PersistResult

_STEP_ORDER = (
    ("document_uploaded", "Document uploaded"),
    ("ocr_completed", "OCR completed"),
    ("entities_extracted", "Clinical entities extracted"),
    ("terminology_normalized", "Medical terminology normalized"),
    ("timeline_generated", "Timeline generated"),
    ("safety_checks_completed", "Safety checks completed"),
    ("flashcard_generated", "Emergency flashcard generated"),
)


@dataclass
class PipelineStep:
    """One recorded stage of a processing run."""

    key: str
    label: str
    status: str = "pending"
    detail: Optional[str] = None

    def as_dict(self) -> Dict[str, Any]:
        return {
            "key": self.key,
            "label": self.label,
            "status": self.status,
            "detail": self.detail,
        }


@dataclass
class PipelineOutcome:
    """Everything one document processing run produced."""

    document: SourceDocument
    patient: Patient
    steps: List[PipelineStep] = field(default_factory=list)
    persist_result: Optional[PersistResult] = None
    extraction_method: str = "lexicon"
    warnings: List[str] = field(default_factory=list)
    safety_report: Optional[Dict[str, Any]] = None
    graph_summary: Optional[Dict[str, Any]] = None
    flashcard: Optional[Dict[str, Any]] = None
    vector_chunks_indexed: int = 0
    elapsed_ms: int = 0

    def as_dict(self) -> Dict[str, Any]:
        return {
            "document_id": self.document.id,
            "patient_code": self.patient.patient_code,
            "document_type": self.document.doc_type or "unknown",
            "steps": [step.as_dict() for step in self.steps],
            "entities_extracted": self.persist_result.total if self.persist_result else 0,
            "normalized_count": self.persist_result.normalized if self.persist_result else 0,
            "vector_chunks_indexed": self.vector_chunks_indexed,
            "safety_alerts": (self.safety_report or {}).get("total_findings", 0),
            "critical_alerts": (self.safety_report or {}).get("critical", 0),
            "extraction_method": self.extraction_method,
            "warnings": self.warnings,
            "graph": self.graph_summary,
            "flashcard": self.flashcard,
            "elapsed_ms": self.elapsed_ms,
        }


class ClinicalIngestionPipeline:
    """Runs ingestion, extraction, normalization, graph, safety, and flashcard in order."""

    def __init__(
        self,
        ingestion_agent: Optional[IngestionAgent] = None,
        extraction_agent: Optional[ExtractionAgent] = None,
        graph_agent: Optional[TemporalGraphAgent] = None,
        safety_agent: Optional[SafetyAgent] = None,
        flashcard_agent: Optional[FlashcardAgent] = None,
        patient_service: Optional[PatientService] = None,
    ):
        self.ingestion_agent = ingestion_agent or IngestionAgent()
        self.extraction_agent = extraction_agent or ExtractionAgent()
        self.graph_agent = graph_agent or TemporalGraphAgent()
        self.safety_agent = safety_agent or SafetyAgent()
        self.flashcard_agent = flashcard_agent or FlashcardAgent()
        self.patient_service = patient_service or PatientService()

    def run(
        self,
        db: Session,
        patient: Patient,
        document: SourceDocument,
        file_bytes: bytes,
        prefer_llm: bool = True,
        step_callback: Optional[Callable[[str, str, Optional[str]], None]] = None,
    ) -> PipelineOutcome:
        """Process one uploaded document end to end."""
        started = datetime.utcnow()
        steps = [PipelineStep(key=key, label=label) for key, label in _STEP_ORDER]
        warnings: List[str] = []

        def mark_step(k: str, s: str, d: Optional[str] = None):
            _mark(steps, k, s, d)
            if step_callback:
                step_callback(k, s, d)

        ingestion = self.ingestion_agent.ingest(
            file_bytes, document.filename, document.mime_type or "application/pdf"
        )
        document.doc_type = ingestion.document_type
        document.page_count = ingestion.page_count
        document.extraction_method = _extraction_method(ingestion)

        recovered = self.ingestion_agent.read_scanned_pages(ingestion)
        if ingestion.vision_error:
            warnings.append(ingestion.vision_error)

        document.extracted_text = recovered or ingestion.native_text
        document.processed_at = datetime.utcnow()

        mark_step("document_uploaded", "complete", document.filename)
        mark_step(
            "ocr_completed",
            "complete",
            f"{ingestion.page_count} page(s), {len(document.extracted_text or '')} characters",
        )

        extraction = self.extraction_agent.extract(
            text=document.extracted_text or "",
            page_number=1,
            document_type=ingestion.document_type,
            prefer_llm=prefer_llm,
        )
        warnings.extend(extraction.warnings)
        mark_step(
            "entities_extracted",
            "complete",
            f"{extraction.entity_count} entities via {extraction.method}",
        )

        demographics = extraction.payload.get("patient_demographics") or {}
        if demographics.get("name"):
            patient.full_name = demographics["name"]
        if demographics.get("age"):
            patient.age = demographics["age"]
        if demographics.get("sex"):
            patient.sex = demographics["sex"]
        if demographics.get("blood_group"):
            patient.blood_group = demographics["blood_group"]
        db.flush()

        persist_result = self.patient_service.persist_extraction(
            db, patient, document, extraction.payload
        )
        self.patient_service.supersede_medications(db, patient)

        # Extract and index spatial chunks in Qdrant Vector Store
        vector_chunks_indexed = 0
        try:
            from src.services.rag_service import rag_service

            chunks = rag_service.extract_document_chunks(
                file_bytes=file_bytes,
                document_id=document.id,
                patient_code=patient.patient_code,
                document_title=document.filename,
                extracted_text=document.extracted_text,
            )
            vector_chunks_indexed = rag_service.index_chunks(chunks)
        except Exception as exc:
            warnings.append(f"Vector indexing skipped: {exc}")

        mark_step(
            "terminology_normalized",
            "complete",
            f"{persist_result.normalized} term(s) mapped; {vector_chunks_indexed} spatial chunk(s) indexed in Qdrant",
        )

        graph = self.graph_agent.build(db, patient)
        mark_step(
            "timeline_generated",
            "complete",
            f"{len(graph.nodes)} events, {len(graph.edges)} relationships",
        )

        report = self.safety_agent.evaluate(db, patient, persist=True)
        mark_step(
            "safety_checks_completed",
            "complete",
            f"{len(report.findings)} finding(s), {report.critical_count} critical",
        )

        flashcard = self.flashcard_agent.compute(db, patient)
        mark_step(
            "flashcard_generated",
            "complete",
            f"version {flashcard.version}, cached for sub-3s retrieval",
        )

        db.commit()

        return PipelineOutcome(
            document=document,
            patient=patient,
            steps=steps,
            persist_result=persist_result,
            extraction_method=extraction.method,
            warnings=warnings,
            safety_report=report.as_dict(),
            graph_summary={
                "node_count": len(graph.nodes),
                "edge_count": len(graph.edges),
                "chronic_conditions": graph.chronic_conditions,
                "conflicts": [conflict.as_dict() for conflict in graph.conflicts],
            },
            flashcard=flashcard.as_dict(),
            vector_chunks_indexed=vector_chunks_indexed,
            elapsed_ms=int((datetime.utcnow() - started).total_seconds() * 1000),
        )


def _extraction_method(ingestion: Any) -> str:
    """Record how the text for this document was obtained."""
    if ingestion.vision_pages and not ingestion.vision_error:
        return "vision"
    if ingestion.vision_pages:
        return "text_layer_partial"
    return "text_layer"


def _mark(steps: List[PipelineStep], key: str, status: str, detail: Optional[str]) -> None:
    """Update one recorded pipeline stage."""
    for step in steps:
        if step.key == key:
            step.status = status
            step.detail = detail
            return