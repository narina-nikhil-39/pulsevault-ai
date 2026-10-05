"""
SynapseHealth — Gemini Clinical Document Extraction Service
Sends scanned medical documents to Google Gemini and returns strictly-shaped
clinical JSON with a source citation anchor for every extracted entity.
CRITICAL RULE: Never prints, logs, or exposes GEMINI_API_KEY.
"""

import json
import os
import re
from typing import Any, Dict, List, Optional

from google import genai
from google.genai import types

from dotenv import load_dotenv

load_dotenv()

_SYSTEM_INSTRUCTION = (
    "You are a clinical document extraction engine for SynapseHealth. "
    "You read Indian medical prescriptions, lab reports, discharge summaries and diagnostic reports. "
    "You NEVER diagnose, never advise, and never invent facts that are absent from the document. "
    "Every entity you return MUST quote the exact source sentence it came from.\n\n"
    "Return valid JSON ONLY, with this exact shape:\n"
    "{\n"
    '  "document_type": "prescription | lab_report | discharge_summary | diagnostic_report | unknown",\n'
    '  "patient_demographics": {"age": 58 | null, "sex": "male | female | other | null", '
    '"blood_group": "O+ | null", "name": "string | null"},\n'
    '  "conditions": [{"name": "string", "status": "active | resolved", "is_chronic": true, '
    '"onset_date": "YYYY-MM-DD | YYYY | null", "resolved_date": "YYYY-MM-DD | null", '
    '"evidence_sentence": "exact quoted text"}],\n'
    '  "medications": [{"name": "string", "dose": 500 | null, "dose_unit": "mg | mL | null", '
    '"frequency": "twice daily | null", "route": "oral | null", "status": "active | stopped", '
    '"start_date": "YYYY-MM-DD | YYYY | null", "end_date": "YYYY-MM-DD | null", '
    '"evidence_sentence": "exact quoted text"}],\n'
    '  "allergies": [{"substance": "string", "reaction": "string | null", '
    '"severity": "mild | moderate | severe | unknown", '
    '"evidence_sentence": "exact quoted text"}],\n'
    '  "lab_values": [{"test_name": "string", "value": 6.8 | null, "value_text": "string | null", '
    '"unit": "string | null", "collected_date": "YYYY-MM-DD | null", '
    '"evidence_sentence": "exact quoted text"}],\n'
    '  "procedures": [{"name": "string", "performed_date": "YYYY-MM-DD | YYYY | null", '
    '"outcome": "string | null", "evidence_sentence": "exact quoted text"}],\n'
    '  "implants": [{"name": "string", "implanted_date": "YYYY-MM-DD | YYYY | null", '
    '"evidence_sentence": "exact quoted text"}],\n'
    '  "follow_up": {"date": "YYYY-MM-DD | null", "instructions": "string | null"},\n'
    '  "page_number": 1,\n'
    '  "extraction_confidence": 0.0\n'
    "}\n\n"
    "Rules:\n"
    "1. Use null for anything not stated in the document. Never infer a value.\n"
    "2. Preserve the drug's strength exactly as written (500 mg means dose 500, dose_unit 'mg').\n"
    "3. Dates may be partial; return 'YYYY' when only a year is legible.\n"
    "4. If the page is not a medical document, return empty arrays and document_type 'unknown'.\n"
    "5. extraction_confidence is your own honest estimate between 0 and 1."
)

_JSON_BLOCK = re.compile(r"\{.*\}", re.DOTALL)
_DATE_PARTIAL = re.compile(r"^\d{4}$")


class VisionServiceError(Exception):
    """Controlled application exception for Gemini extraction failures."""

    pass


class VisionService:
    """Extracts structured clinical entities from document images or text using Gemini."""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = (os.getenv("GEMINI_API_KEY") or os.getenv("LLM_API_KEY")) if api_key is None else api_key
        self.model_name = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

    @property
    def is_configured(self) -> bool:
        """True when a real, non-placeholder API key is present."""
        key = (self.api_key or "").strip()
        return bool(key) and key not in ("mock-llm-api-key", "mock-gemini-key")

    def extract_clinical_entities(
        self,
        image_bytes: Optional[bytes] = None,
        text: Optional[str] = None,
        mime_type: str = "image/png",
        page_number: int = 1,
    ) -> Dict[str, Any]:
        """Extract clinical entities from a page image and/or its text layer.

        Returns:
            A dictionary matching the extraction contract described in
            ``_SYSTEM_INSTRUCTION``. Raises VisionServiceError when the model is
            unavailable or returns unparseable output.
        """
        key = (self.api_key or "").strip()
        if not key or key in ("mock-llm-api-key", "mock-gemini-key"):
            raise VisionServiceError("GEMINI_API_KEY is not configured or is set to a mock value.")

        if not image_bytes and not (text or "").strip():
            raise VisionServiceError("No image bytes or text supplied for extraction.")

        contents: List[Any] = []
        if image_bytes:
            contents.append(types.Part.from_bytes(data=image_bytes, mime_type=mime_type))
        if text and text.strip():
            contents.append(
                f"Transcribed text layer for page {page_number}:\n\n{text.strip()}"
            )
        contents.append(
            f"Extract clinical entities from page {page_number} and return JSON only."
        )

        client = genai.Client(api_key=key)
        last_exception: Optional[Exception] = None

        for candidate_model in (self.model_name, "gemini-2.5-flash", "gemini-2.0-flash"):
            try:
                response = client.models.generate_content(
                    model=candidate_model,
                    contents=contents,
                    config=types.GenerateContentConfig(
                        system_instruction=_SYSTEM_INSTRUCTION,
                        response_mime_type="application/json",
                        temperature=0.1,
                    ),
                )

                response_text = response.text.strip() if response and response.text else ""
                if not response_text:
                    raise VisionServiceError("Gemini returned an empty response.")

                return self._coerce_shape(self._parse_json(response_text), page_number)

            except json.JSONDecodeError as exc:
                raise VisionServiceError(f"Gemini returned malformed JSON: {exc}") from exc
            except VisionServiceError:
                raise
            except Exception as exc:
                last_exception = exc
                message = str(exc)
                if "404" in message or "NOT_FOUND" in message:
                    continue
                break

        raise VisionServiceError(f"Gemini extraction failed: {last_exception}")

    def _parse_json(self, raw: str) -> Dict[str, Any]:
        """Parse a JSON response, tolerating models that wrap it in prose or a fence."""
        candidates = [raw]
        fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw, re.DOTALL)
        if fenced:
            candidates.insert(0, fenced.group(1))
        block = _JSON_BLOCK.search(raw)
        if block:
            candidates.append(block.group(0))

        for candidate in candidates:
            try:
                parsed = json.loads(candidate)
            except json.JSONDecodeError:
                continue
            if isinstance(parsed, dict):
                return parsed

        raise json.JSONDecodeError("no JSON object found in response", raw, 0)

    def _coerce_shape(self, payload: Dict[str, Any], page_number: int) -> Dict[str, Any]:
        """Force every known key to exist with the correct container type."""
        result: Dict[str, Any] = dict(payload)

        result.setdefault("page_number", page_number)
        result["page_number"] = page_number

        demographics = result.get("patient_demographics")
        if not isinstance(demographics, dict):
            demographics = {}
        for field_name in ("age", "sex", "blood_group", "name"):
            demographics.setdefault(field_name, None)
        result["patient_demographics"] = demographics

        for key in ("conditions", "medications", "allergies", "lab_values", "procedures", "implants"):
            value = result.get(key)
            result[key] = value if isinstance(value, list) else []

        follow_up = result.get("follow_up")
        if not isinstance(follow_up, dict):
            follow_up = {"date": None, "instructions": None}
        result["follow_up"] = {
            "date": follow_up.get("date"),
            "instructions": follow_up.get("instructions"),
        }

        try:
            result["extraction_confidence"] = float(result.get("extraction_confidence") or 0.0)
        except (TypeError, ValueError):
            result["extraction_confidence"] = 0.0

        if not str(result.get("document_type") or "").strip():
            result["document_type"] = "unknown"

        return result


def partial_date(value: Any) -> Optional[str]:
    """Return a date string only when it is a full or partial ISO-style date."""
    text = str(value or "").strip()
    if not text:
        return None
    if _DATE_PARTIAL.match(text):
        return text
    if re.match(r"^\d{4}-\d{2}-\d{2}$", text):
        return text
    return None