"""
SynapseHealth — Document Text Extraction Service
Extracts a text layer from uploaded PDFs and images. Born-digital pages are read
directly; pages with no usable text layer (scanned reports, photographed
prescriptions) are rendered to PNG for the vision model to read instead.
"""

import hashlib
from dataclasses import dataclass, field
from typing import List, Optional

import pymupdf

# Below this character count a page is treated as scanned and handed to the vision model.
_SCANNED_PAGE_CHAR_THRESHOLD = 40

# Rendered pages are downscaled so the vision request stays inside token budgets.
_RENDER_DPI = 150
_MAX_RENDER_PIXELS = 1_600_000


@dataclass
class ExtractedPage:
    """A single page's text layer plus its rendered bitmap, when one was produced."""

    page_number: int
    text: str
    is_scanned: bool
    image_bytes: Optional[bytes] = None
    width: int = 0
    height: int = 0

    def as_dict(self) -> dict:
        return {
            "page_number": self.page_number,
            "char_count": len(self.text),
            "is_scanned": self.is_scanned,
            "width": self.width,
            "height": self.height,
        }


@dataclass
class ExtractedDocument:
    """The result of running a document through the text extraction service."""

    filename: str
    mime_type: str
    sha256: str
    page_count: int
    pages: List[ExtractedPage] = field(default_factory=list)
    native_text: str = ""
    error: Optional[str] = None

    @property
    def has_text_layer(self) -> bool:
        return bool(self.native_text.strip())

    @property
    def requires_vision(self) -> bool:
        return any(page.is_scanned for page in self.pages)

    @property
    def full_text(self) -> str:
        return self.native_text.strip()

    def summary(self) -> dict:
        return {
            "filename": self.filename,
            "sha256": self.sha256,
            "page_count": self.page_count,
            "has_text_layer": self.has_text_layer,
            "requires_vision": self.requires_vision,
            "native_char_count": len(self.native_text),
            "pages": [page.as_dict() for page in self.pages],
            "error": self.error,
        }


class OcrServiceError(Exception):
    """Raised when a document cannot be opened or decoded at all."""

    pass


class OcrService:
    """Reads the text layer from PDFs and renders image-only pages for vision OCR."""

    def __init__(self, render_dpi: int = _RENDER_DPI):
        self.render_dpi = render_dpi

    def extract(self, file_bytes: bytes, filename: str, mime_type: str = "application/pdf") -> ExtractedDocument:
        """Extract text from an uploaded document, rendering scanned pages as images."""
        digest = sha256_of(file_bytes)

        if not file_bytes:
            return ExtractedDocument(
                filename=filename,
                mime_type=mime_type,
                sha256=digest,
                page_count=0,
                error="Empty upload received.",
            )

        try:
            document = pymupdf.open(stream=file_bytes, filetype="pdf")
        except Exception:
            return self._extract_placeholder_image(
                file_bytes, filename, mime_type, digest
            )

        with document:
            pages: List[ExtractedPage] = []
            native_chunks: List[str] = []

            for index in range(document.page_count):
                page = document.load_page(index)
                text = (page.get_text("text") or "").strip()
                is_scanned = len(text) < _SCANNED_PAGE_CHAR_THRESHOLD

                image_bytes = None
                width = int(page.rect.width)
                height = int(page.rect.height)

                if is_scanned:
                    pixmap = self._render_page(page)
                    width, height = pixmap.width, pixmap.height
                    image_bytes = pixmap.tobytes("png")

                if text:
                    native_chunks.append(text)

                pages.append(
                    ExtractedPage(
                        page_number=index + 1,
                        text=text,
                        is_scanned=is_scanned,
                        image_bytes=image_bytes,
                        width=width,
                        height=height,
                    )
                )

            return ExtractedDocument(
                filename=filename,
                mime_type=mime_type,
                sha256=digest,
                page_count=document.page_count,
                pages=pages,
                native_text="\n\n".join(native_chunks),
            )

    def _extract_placeholder_image(
        self, file_bytes: bytes, filename: str, mime_type: str, digest: str
    ) -> ExtractedDocument:
        """Wrap a non-PDF upload as a single scanned page for the vision model."""
        if not mime_type.startswith("image/"):
            return ExtractedDocument(
                filename=filename,
                mime_type=mime_type,
                sha256=digest,
                page_count=0,
                error="Unsupported file type. Upload a PDF or an image.",
            )

        try:
            from PIL import Image
            from io import BytesIO

            with Image.open(BytesIO(file_bytes)) as image:
                image.load()
                width, height = image.size
                buffer = BytesIO()
                image.convert("RGB").save(buffer, format="PNG")
                rendered = buffer.getvalue()
        except Exception as exc:
            return ExtractedDocument(
                filename=filename,
                mime_type=mime_type,
                sha256=digest,
                page_count=0,
                error=f"Image could not be decoded: {exc}",
            )

        return ExtractedDocument(
            filename=filename,
            mime_type=mime_type,
            sha256=digest,
            page_count=1,
            pages=[
                ExtractedPage(
                    page_number=1,
                    text="",
                    is_scanned=True,
                    image_bytes=rendered,
                    width=width,
                    height=height,
                )
            ],
        )

    def _render_page(self, page: "pymupdf.Page") -> "pymupdf.Pixmap":
        """Rasterize a page at the configured DPI, capping total pixel count."""
        zoom = self.render_dpi / 72.0
        pixmap = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom))

        if pixmap.width * pixmap.height > _MAX_RENDER_PIXELS:
            shrink = (_MAX_RENDER_PIXELS / (pixmap.width * pixmap.height)) ** 0.5
            pixmap = page.get_pixmap(
                matrix=pymupdf.Matrix(zoom * shrink, zoom * shrink)
            )

        return pixmap


def sha256_of(file_bytes: bytes) -> str:
    """Return the hex SHA-256 digest of the given bytes."""
    return hashlib.sha256(file_bytes).hexdigest()