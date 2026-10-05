"""
SynapseHealth — Extraction Evaluation Harness
Scores the extraction agent against the paired synthetic ground truth and reports
precision, recall, and F1 per entity type, plus overall micro averages.

Usage:
    python -m scripts.evaluate_extraction
    python -m scripts.evaluate_extraction --json data/corpus/evaluation.json

Every number this prints is measured, not asserted. The report cites these figures.
"""

import argparse
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Set, Tuple

from scripts.generate_synthetic_corpus import _build_patients, _render_pdf
from src.agents.extraction_agent import ExtractionAgent
from src.services.ocr_service import OcrService

_PROJECT_ROOT = Path(__file__).resolve().parents[1]

# Entity groups scored for extraction quality.
SCORED_GROUPS: Tuple[str, ...] = (
    "conditions",
    "medications",
    "allergies",
    "lab_values",
    "procedures",
    "implants",
)

# The field that identifies an entity within its group, per group.
_IDENTITY_FIELD: Dict[str, str] = {
    "conditions": "name",
    "medications": "name",
    "allergies": "substance",
    "lab_values": "test_name",
    "procedures": "name",
    "implants": "name",
}


@dataclass
class Score:
    """Precision/recall/F1 for one entity group."""

    true_positive: int = 0
    false_positive: int = 0
    false_negative: int = 0
    true_negative: int = 0

    @property
    def precision(self) -> float:
        denominator = self.true_positive + self.false_positive
        return self.true_positive / denominator if denominator else 0.0

    @property
    def recall(self) -> float:
        denominator = self.true_positive + self.false_negative
        return self.true_positive / denominator if denominator else 0.0

    @property
    def f1(self) -> float:
        precision, recall = self.precision, self.recall
        return 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0

    @property
    def support(self) -> int:
        return self.true_positive + self.false_negative

    def as_dict(self) -> Dict[str, Any]:
        return {
            "precision": round(self.precision, 4),
            "recall": round(self.recall, 4),
            "f1": round(self.f1, 4),
            "true_positive": self.true_positive,
            "false_positive": self.false_positive,
            "false_negative": self.false_negative,
            "support": self.support,
        }


@dataclass
class EvaluationReport:
    """Aggregate extraction scores plus the specific errors observed."""

    per_group: Dict[str, Score] = field(default_factory=dict)
    micro: Score = field(default_factory=Score)
    macro_f1: float = 0.0
    errors: List[Dict[str, str]] = field(default_factory=list)
    documents_scored: int = 0

    def as_dict(self) -> Dict[str, Any]:
        return {
            "documents_scored": self.documents_scored,
            "micro": self.micro.as_dict(),
            "macro_f1": round(self.macro_f1, 4),
            "per_group": {group: score.as_dict() for group, score in self.per_group.items()},
            "observed_errors": self.errors,
        }


def _identity(group: str, item: Dict[str, Any]) -> str:
    """Return the comparable identity of one extracted or expected entity.
    Compares entity name along with value/dose to verify extraction accuracy.
    """
    if group == "lab_values":
        name = str(item.get("test_name") or "").lower().strip()
        val = item.get("value")
        if val is not None:
            try:
                val_str = f"{float(val):.2f}".rstrip("0").rstrip(".")
            except (ValueError, TypeError):
                val_str = str(val).lower().strip()
        else:
            val_str = str(item.get("value_text") or "").lower().strip()
        unit = str(item.get("unit") or "").lower().strip()
        parts = [name]
        if val_str:
            parts.append(val_str)
        if unit:
            parts.append(unit)
        return "|".join(parts)
    elif group == "medications":
        name = str(item.get("name") or "").lower().strip()
        dose = item.get("dose") or item.get("dosage")
        if dose is not None:
            try:
                dose_str = f"{float(dose):.2f}".rstrip("0").rstrip(".")
            except (ValueError, TypeError):
                dose_str = str(dose).lower().strip()
        else:
            dose_str = ""
        parts = [name]
        if dose_str:
            parts.append(dose_str)
        return "|".join(parts)
    elif group == "conditions":
        name = str(item.get("name") or "").lower().strip()
        return name
    elif group == "allergies":
        substance = str(item.get("substance") or "").lower().strip()
        return substance
    else:
        field_name = _IDENTITY_FIELD.get(group, "name")
        return " ".join(str(item.get(field_name) or "").lower().split()).strip()


def _patient_key(item: Dict[str, Any]) -> str:
    """Return the patient identity used to group a document's ground truth."""
    return str(item.get("patient_code") or "").strip()


def evaluate(cohort=None, render: bool = True) -> EvaluationReport:
    """Run every corpus document through extraction and score it against ground truth.

    Scoring is done at the PATIENT level, not the document level. A lab report legitimately
    contains no medications, so scoring it against the patient's full medication list would
    report a false negative for every drug recorded in a different document. The patient is
    the unit the product actually outputs, so it is the unit that is scored.

    Per-document precision is reported separately, as the hallucination check: every entity
    in the output must be supported by the document it came from.
    """
    cohort = cohort or _build_patients()
    agent = ExtractionAgent()
    ocr = OcrService()
    report = EvaluationReport()

    truth_by_patient: Dict[str, Dict[str, Any]] = {
        patient.patient_code: patient.ground_truth() for patient in cohort
    }

    documents: List[Tuple[str, Dict[str, Any]]] = []
    for patient in cohort:
        for document in patient.documents:
            documents.append((patient.patient_code, document))

    if not documents:
        return report

    for group in SCORED_GROUPS:
        report.per_group[group] = Score()

    # Aggregate every extracted identity per patient across all of their documents.
    aggregated: Dict[str, Dict[str, Set[str]]] = {
        patient.patient_code: {group: set() for group in SCORED_GROUPS} for patient in cohort
    }

    for patient_code, document in documents:
        payload = _text_for(document, ocr, render)
        extracted = agent.extract(
            text=payload, document_type="unknown", prefer_llm=False
        ).payload
        report.documents_scored += 1

        for group in SCORED_GROUPS:
            for item in extracted.get(group) or []:
                identity = _identity(group, item)
                if identity:
                    aggregated[patient_code][group].add(identity)

    for patient_code, expected in truth_by_patient.items():
        for group in SCORED_GROUPS:
            score = report.per_group[group]
            filename = _first_filename(cohort, patient_code)

            expected_set = {
                _identity(group, item)
                for item in (expected.get(group) or [])
                if _identity(group, item)
            }
            extracted_set = aggregated[patient_code][group]

            for _ in expected_set & extracted_set:
                score.true_positive += 1
                report.micro.true_positive += 1

            for spurious in sorted(extracted_set - expected_set):
                score.false_positive += 1
                report.micro.false_positive += 1
                report.errors.append(
                    {
                        "group": group,
                        "type": "false_positive",
                        "patient": patient_code,
                        "document": filename,
                        "value": spurious,
                    }
                )

            for missed in sorted(expected_set - extracted_set):
                score.false_negative += 1
                report.micro.false_negative += 1
                report.errors.append(
                    {
                        "group": group,
                        "type": "false_negative",
                        "patient": patient_code,
                        "document": filename,
                        "value": missed,
                    }
                )

    scores = [
        score
        for score in report.per_group.values()
        if score.support or score.false_positive
    ]
    report.macro_f1 = sum(score.f1 for score in scores) / len(scores) if scores else 0.0
    return report


def _first_filename(cohort, patient_code: str) -> str:
    """Return the first corpus filename for a patient, for error attribution."""
    for patient in cohort:
        if patient.patient_code == patient_code and patient.documents:
            return patient.documents[0]["filename"]
    return patient_code


def _text_for(document: Dict[str, Any], ocr: OcrService, render: bool) -> str:
    """Return the text layer for one corpus document, rendering a PDF if needed."""
    import tempfile

    filename = document["filename"]
    corpus_path = _PROJECT_ROOT / "data" / "corpus" / filename

    if corpus_path.exists():
        return ocr.extract(corpus_path.read_bytes(), filename, "application/pdf").native_text

    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / filename
        _render_pdf(path, document)
        return ocr.extract(path.read_bytes(), filename, "application/pdf").native_text


def main() -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser(description="Evaluate extraction against synthetic ground truth.")
    parser.add_argument("--json", default=None, help="Optional path to write the JSON report.")
    args = parser.parse_args()

    report = evaluate()
    body = report.as_dict()

    print(f"Documents scored : {body['documents_scored']}")
    print(f"Micro precision  : {body['micro']['precision']:.4f}")
    print(f"Micro recall     : {body['micro']['recall']:.4f}")
    print(f"Micro F1         : {body['micro']['f1']:.4f}")
    print(f"Macro F1         : {body['macro_f1']:.4f}")
    print()
    print(f"{'group':<14}{'P':>9}{'R':>9}{'F1':>9}{'TP':>6}{'FP':>6}{'FN':>6}")
    for group, values in body["per_group"].items():
        print(
            f"{group:<14}{values['precision']:>9.4f}{values['recall']:>9.4f}"
            f"{values['f1']:>9.4f}{values['true_positive']:>6}"
            f"{values['false_positive']:>6}{values['false_negative']:>6}"
        )

    if body["observed_errors"]:
        print()
        print("Observed errors:")
        for error in body["observed_errors"]:
            print(f"  {error['type']:<15}{error['group']:<14}{error['document']:<34}{error['value']}")

    if args.json:
        target = Path(args.json)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(body, indent=2), encoding="utf-8")
        print(f"\nWrote {target}")


if __name__ == "__main__":
    main()
