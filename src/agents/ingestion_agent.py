"""
SynapseHealth — Agent 1: Document Ingestion & OCR
Turns an uploaded PDF or image into per-page text. Born-digital pages are read from
their text layer; pages with no usable text layer are rendered to PNG and routed to
the vision model. Also detects the clinical document type from its layout.
"""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from src.services.ocr_service import ExtractedDocument, ExtractedPage, OcrService
from src.services.vision_service import VisionService, VisionServiceError

# Ordered most-specific first: the first pattern hit wins.
_DOC_TYPE_SIGNALS: Dict[str, tuple] = {
    "prescription": ("rx", "prescription", "tab ", "cap ", "take ", "once daily", "bd", "od"),
    "lab_report": ("haemoglobin", "hemoglobin", "wbc", "rbc", "platelets", "reference range", "investigation", "mchc", "hba1c"),
    "discharge_summary": ("discharge summary", "discharged", "admission", "final diagnosis", "hospital course", "discharge advice"),
    "diagnostic_report": ("usg", "ultrasound", "radiology", "ct scan", "mri", "sonography", "impression", "findings"),
}


@dataclass
class IngestionResult:
    """Structured outcome of ingesting one document."""

    document_type: str
    pages: List[ExtractedPage] = field(default_factory=list)
    native_text: str = ""
    page_count: int = 0
    requires_vision: bool = False
    vision_pages: List[int] = field(default_factory=list)
    vision_error: Optional[str] = None
    sha256: str = ""

    @property
    def combined_text(self) -> str:
        """Text from every page, native or vision-extracted."""
        chunks = []
        for page in self.pages:
            body = page.text.strip()
            if body:
                chunks.append(body)
        if self.vision_pages and not chunks:
            chunks.append(self.native_text)
        return "\n\n".join(chunks).strip()

    def as_dict(self) -> Dict[str, Any]:
        return {
            "document_type": self.document_type,
            "page_count": self.page_count,
            "requires_vision": self.requires_vision,
            "vision_pages": self.vision_pages,
            "native_char_count": len(self.native_text),
            "combined_char_count": len(self.combined_text),
            "sha256": self.sha256,
            "vision_error": self.vision_error,
        }


class IngestionAgent:
    """Reads a document's text layer and identifies its clinical document type."""

    def __init__(
        self,
        ocr_service: Optional[OcrService] = None,
        vision_service: Optional[VisionService] = None,
    ):
        self.ocr_service = ocr_service or OcrService()
        self.vision_service = vision_service or VisionService()

    def ingest(self, file_bytes: bytes, filename: str, mime_type: str = "application/pdf") -> IngestionResult:
        """Extract text from every page and classify the document."""
        extracted: ExtractedDocument = self.ocr_service.extract(file_bytes, filename, mime_type)

        if extracted.error:
            return IngestionResult(
                document_type="unknown",
                sha256=extracted.sha256,
                vision_error=extracted.error,
            )

        scanned_pages = [page.page_number for page in extracted.pages if page.is_scanned]

        result = IngestionResult(
            document_type=self.detect_document_type(extracted.native_text),
            pages=list(extracted.pages),
            native_text=extracted.native_text,
            page_count=extracted.page_count,
            requires_vision=bool(scanned_pages),
            vision_pages=scanned_pages,
            sha256=extracted.sha256,
        )

        if scanned_pages and not self.vision_service.is_configured:
            result.vision_error = (
                "Scanned pages detected but GEMINI_API_KEY is not configured. "
                "Text extraction for this document is limited to its native text layer."
            )

        return result

    @staticmethod
    def detect_document_type(text: str) -> str:
        """Classify a document from layout and vocabulary signals in its text."""
        if not text or not text.strip():
            return "unknown"

        lowered = f" {text.lower()} "
        scores = {
            doc_type: sum(1 for signal in signals if signal in lowered)
            for doc_type, signals in _DOC_TYPE_SIGNALS.items()
        }

        best_type, best_score = max(scores.items(), key=lambda item: item[1])
        return best_type if best_score >= 2 else "unknown"

    def read_scanned_pages(self, result: IngestionResult) -> str:
        """Send scanned pages to the vision model and return their transcribed text.

        Failures are reported through ``IngestionResult.vision_error`` rather than raised,
        so a scanned upload still reaches the dashboard with whatever text was recovered.
        """
        if not result.vision_pages or not self.vision_service.is_configured:
            return result.native_text

        recovered: List[str] = []
        errors: List[str] = []

        for page in result.pages:
            if page.page_number not in result.vision_pages or not page.image_bytes:
                continue
            try:
                response = self.vision_service.extract_clinical_entities(
                    image_bytes=page.image_bytes,
                    text=page.text,
                    page_number=page.page_number,
                )
                page.text = _flatten_text(response)
            except VisionServiceError as exc:
                errors.append(f"page {page.page_number}: {exc}")

        for page in result.pages:
            if page.text.strip():
                recovered.append(page.text.strip())

        if errors:
            result.vision_error = "; ".join(errors)

        return "\n\n".join(recovered)


def _flatten_text(response: Dict[str, Any]) -> str:
    """Reconstruct readable text from an extraction payload for page-level merging."""
    lines = []

    demographics = response.get("patient_demographics") or {}
    name = demographics.get("name")
    if name:
        lines.append(f"Patient: {name}")
    if demographics.get("age") is not None or demographics.get("sex"):
        lines.append(
            f"Age/Sex: {demographics.get('age') or '—'} / {demographics.get('sex') or '—'}"
        )
    if demographics.get("blood_group"):
        lines.append(f"Blood Group: {demographics['blood_group']}")

    for group in ("conditions", "medications", "allergies", "lab_values", "procedures", "implants"):
        for item in response.get(group) or []:
            if not isinstance(item, dict):
                continue
            span = str(item.get("evidence_sentence") or "").strip()
            if span:
                lines.append(span)

    follow_up = response.get("follow_up") or {}
    if follow_up.get("instructions"):
        lines.append(f"Advice: {follow_up['instructions']}")

    return "\n".join(lines)