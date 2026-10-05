"""
Regression guard for extraction quality against the synthetic ground truth.

IMPORTANT — how to read these numbers.

The corpus is three synthetic patients whose text and whose ground-truth JSON were written
together in the same repository. It contains 43 labelled entities. A perfect score here
proves the pipeline is internally consistent and that no lexicon change has regressed
parsing; it is NOT evidence of clinical extraction accuracy on real records.

Real-world accuracy must be measured on an independently annotated, real de-identified
corpus. That is tracked as future scope in REPORT.md, and until it exists no F1 figure from
this file may be quoted as a research result.
"""

from scripts.evaluate_extraction import SCORED_GROUPS, evaluate


def test_extraction_is_internally_consistent_with_ground_truth():
    """Extraction quality must meet or exceed high F1 regression thresholds."""
    report = evaluate()

    assert report.documents_scored == 7
    assert report.micro.f1 >= 0.90, f"Micro F1 {report.micro.f1} fell below 0.90 threshold"
    assert report.macro_f1 >= 0.90, f"Macro F1 {report.macro_f1} fell below 0.90 threshold"


def test_every_scored_group_is_covered():
    """Every entity group in the ground truth must be scored, not silently skipped."""
    report = evaluate()

    for group in SCORED_GROUPS:
        score = report.per_group[group]
        assert score.support > 0, f"{group} has no ground-truth entities; the check is vacuous"


def test_no_hallucinated_conditions_or_allergies():
    """Critical categories (conditions, allergies) must have zero false positives."""
    report = evaluate()

    critical_fps = [
        error for error in report.errors
        if error["type"] == "false_positive" and error["group"] in ("conditions", "allergies", "lab_values", "procedures")
    ]
    assert not critical_fps, critical_fps


def test_evaluation_is_deterministic():
    """Two runs over the same corpus must produce identical scores."""
    first = evaluate().as_dict()
    second = evaluate().as_dict()

    assert first == second
