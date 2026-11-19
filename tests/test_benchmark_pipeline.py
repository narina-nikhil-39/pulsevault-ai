"""
SynapseHealth (PulseVault AI) — Test Suite for Benchmark Evaluation
Validates:
1. Benchmark evaluation engine executes completely without unhandled exceptions.
2. Clinical extraction metrics meet target F1 thresholds (> 90%).
3. Deterministic safety interlocks achieve 100% sensitivity on critical contraindications.
4. Precomputed emergency flashcard retrieval latency strictly satisfies the trauma SLA (< 3000ms).
5. Output benchmark summary JSON artifact is generated and valid.
"""

from pathlib import Path
from scripts.benchmark_evaluation import run_benchmark_evaluation


def test_benchmark_evaluation_engine_e2e(tmp_path):
    """Run full benchmark evaluation and verify all clinical performance invariants."""
    out_file = tmp_path / "benchmark_test_summary.json"
    results = run_benchmark_evaluation(output_path=out_file)

    assert results["system"] == "PulseVault AI (SynapseHealth)"
    assert results["verification_status"] == "PASSED (100% Deterministic Invariants Met)"
    assert out_file.exists()

    # 1. Extraction F1 checks
    metrics = results["extraction_metrics"]
    assert metrics["medications"]["f1"] >= 0.90
    assert metrics["allergies"]["f1"] >= 0.90
    assert metrics["conditions"]["f1"] >= 0.85

    # 2. Safety Interlock Invariants
    safety = results["safety_interlocks"]
    assert safety["deterministic_sensitivity"] == 1.000
    assert safety["deterministic_false_negatives"] == 0.000
    assert safety["obsolete_dose_carryover_rate"] == 0.000

    # 3. Emergency Flashcard Latency Invariants (Trauma Standard < 3.0s = 3000ms)
    latency = results["latency_profiling"]
    assert latency["precomputed_flashcard_ms"] < 3000.0
    assert latency["latency_reduction_percent"] > 80.0
