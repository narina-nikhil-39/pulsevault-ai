"""
SynapseHealth — Synthetic Clinical Corpus Generator
Builds a fully synthetic, zero-signup corpus of medical-record PDFs with paired
ground-truth JSON. Nothing here is derived from real patient data: every name,
identifier, date, and measurement is invented so the repository carries no PHI.

Usage:
    python -m scripts.generate_synthetic_corpus
    python -m scripts.generate_synthetic_corpus --patients 5 --out data/corpus
"""

import argparse
import json
import random
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas as pdf_canvas

_PROJECT_ROOT = Path(__file__).resolve().parents[1]

_FIRST_NAMES = [
    "Ramesh", "Lakshmi", "Ananya", "Suresh", "Priya", "Vikram", "Meera", "Arjun",
    "Kavitha", "Rahul", "Deepa", "Sanjay", "Nisha", "Gopal", "Fatima", "Imran",
]
_LAST_NAMES = [
    "Kumar", "Devi", "Nair", "Reddy", "Iyer", "Sharma", "Patel", "Menon",
    "Rao", "Gupta", "Das", "Pillai", "Joshi", "Bose",
]
_BLOOD_GROUPS = ["A+", "B+", "O+", "AB+", "O-", "A-", "B-", "AB-"]

# Fixed so regenerating the corpus reproduces byte-identical ground truth.
_SEED = 20240419


@dataclass
class SyntheticPatient:
    """One invented patient and the documents that make up their fragmented record."""

    patient_code: str
    full_name: str
    age: int
    sex: str
    blood_group: str
    conditions: List[Dict[str, Any]] = field(default_factory=list)
    medications: List[Dict[str, Any]] = field(default_factory=list)
    allergies: List[Dict[str, Any]] = field(default_factory=list)
    lab_values: List[Dict[str, Any]] = field(default_factory=list)
    procedures: List[Dict[str, Any]] = field(default_factory=list)
    implants: List[Dict[str, Any]] = field(default_factory=list)
    documents: List[Dict[str, Any]] = field(default_factory=list)

    def ground_truth(self) -> Dict[str, Any]:
        """Assemble the paired ground-truth payload the evaluation suite scores against."""
        return {
            "patient_demographics": {
                "name": self.full_name,
                "age": self.age,
                "sex": self.sex,
                "blood_group": self.blood_group,
            },
            "conditions": self.conditions,
            "medications": self.medications,
            "allergies": self.allergies,
            "lab_values": self.lab_values,
            "procedures": self.procedures,
            "implants": self.implants,
            "safety_expectations": {
                "expect_any_critical": len(self.medications) >= 2,
                "expected_rule_ids": [],
            },
        }


def _build_patients() -> List[SyntheticPatient]:
    """Construct the fixed synthetic cohort, including deliberate safety edge cases."""
    base = date(2024, 3, 11)

    # --- Case 1: severe beta-lactam allergy with a live beta-lactam prescription. ---
    ramesh = SyntheticPatient(
        patient_code="SH-1024",
        full_name="Ramesh Kumar",
        age=58,
        sex="M",
        blood_group="B+",
        conditions=[
            {"name": "Type 2 Diabetes Mellitus", "onset_date": "2019-06-14", "status": "active", "is_chronic": True},
            {"name": "Essential Hypertension", "onset_date": "2021-02-03", "status": "active", "is_chronic": True},
            {"name": "Dyslipidemia", "onset_date": "2022-09-20", "status": "active", "is_chronic": True},
        ],
        medications=[
            {"name": "Metformin", "dose": 500, "dose_unit": "mg", "frequency": "twice daily", "route": "oral", "start_date": "2019-06-14", "status": "active"},
            {"name": "Telmisartan", "dose": 40, "dose_unit": "mg", "frequency": "once daily", "route": "oral", "start_date": "2021-02-03", "status": "active"},
            {"name": "Atorvastatin", "dose": 10, "dose_unit": "mg", "frequency": "nightly", "route": "oral", "start_date": "2022-09-20", "status": "active"},
        ],
        allergies=[
            {"substance": "Penicillin", "reaction": "Urticaria", "severity": "severe"},
        ],
        lab_values=[
            {"test_name": "HbA1c", "value": 8.2, "unit": "%", "collected_date": "2024-03-05"},
            {"test_name": "LDL Cholesterol", "value": 145, "unit": "mg/dL", "collected_date": "2024-03-05"},
            {"test_name": "Total Cholesterol", "value": 232, "unit": "mg/dL", "collected_date": "2024-03-05"},
            {"test_name": "Serum Creatinine", "value": 1.1, "unit": "mg/dL", "collected_date": "2024-03-05"},
            {"test_name": "eGFR", "value": 78, "unit": "mL/min/1.73m2", "collected_date": "2024-03-05"},
            {"test_name": "Hemoglobin", "value": 14.2, "unit": "g/dL", "collected_date": "2024-03-05"},
            {"test_name": "Platelet Count", "value": 240, "unit": "/cumm", "collected_date": "2024-03-05"},
        ],
        procedures=[
            {"name": "Coronary Angiography", "performed_date": "2022-09-18", "outcome": "Normal coronaries"},
        ],
    )
    ramesh.documents = [
        {
            "filename": "SH-1024_discharge_summary.pdf",
            "doc_type": "discharge_summary",
            "title": "DISCHARGE SUMMARY",
            "lines": [
                f"Hospital: CityCare General Hospital, Bengaluru",
                f"Patient Name: {ramesh.full_name}",
                f"Patient Code: {ramesh.patient_code}",
                f"Age / Sex: {ramesh.age} / {ramesh.sex}",
                f"Date of Admission: {(base - timedelta(days=6)).isoformat()}",
                f"Date of Discharge: {base.isoformat()}",
                "FINAL DIAGNOSIS",
                "1. Type 2 Diabetes Mellitus - since 2019-06-14, chronic",
                "2. Hypertension - since 2021-02-03",
                "3. Dyslipidemia - since 2022-09-20",
                "",
                "HOSPITAL COURSE",
                "Patient was stabilised for routine diabetic follow-up. Blood sugar",
                "controlled on oral hypoglycaemics. No acute complications noted.",
                "Coronary Angiography performed on 2022-09-18 showed normal coronaries.",
                "",
                "DISCHARGE MEDICATIONS",
                "1. Metformin 500 mg twice daily after meals, oral",
                "2. Telmisartan 40 mg once daily in the morning",
                "3. Atorvastatin 10 mg at bedtime",
                "",
                "KNOWN ALLERGY: Penicillin - rash and urticaria",
                "",
                "FOLLOW UP: Review in Medical OPD on 2024-04-12. Repeat HbA1c in 3 months.",
            ],
        },
        {
            "filename": "SH-1024_lab_report.pdf",
            "doc_type": "lab_report",
            "title": "LABORATORY INVESTIGATION REPORT",
            "lines": [
                f"Patient Name: {ramesh.full_name}",
                f"Patient Code: {ramesh.patient_code}",
                f"Date of Collection: {(base - timedelta(days=9)).isoformat()}",
                "INVESTIGATION        RESULT        UNIT         REFERENCE RANGE",
                "HbA1c                8.2           %            4.0 - 5.7",
                "LDL Cholesterol      145           mg/dL        0 - 100",
                "Total Cholesterol    232           mg/dL        0 - 200",
                "Serum Creatinine     1.1           mg/dL        0.7 - 1.3",
                "eGFR                 78            mL/min/1.73m2  60 - 120",
                "",
                "Haemoglobin          14.2          g/dL         13.0 - 17.0",
                "Platelet Count       240           /cumm        150 - 410",
                "",
                "Pathologist: Dr. M. Iyer, MD",
            ],
        },
    ]

    # --- Case 2: the maximum-alert patient. Exercises nearly every rule family. ---
    lakshmi = SyntheticPatient(
        patient_code="SH-2048",
        full_name="Lakshmi Devi",
        age=64,
        sex="F",
        blood_group="O+",
        conditions=[
            {"name": "Atrial Fibrillation", "onset_date": "2021-11-02", "status": "active", "is_chronic": True},
            {"name": "Chronic Kidney Disease", "onset_date": "2022-08-19", "status": "active", "is_chronic": True},
            {"name": "Type 2 Diabetes Mellitus", "onset_date": "2018-05-30", "status": "active", "is_chronic": True},
            {"name": "Peptic Ulcer Disease", "onset_date": "2023-04-11", "status": "active", "is_chronic": True},
        ],
        medications=[
            {"name": "Warfarin", "dose": 2, "dose_unit": "mg", "frequency": "once daily", "route": "oral", "start_date": "2021-11-02", "status": "active"},
            {"name": "Aspirin", "dose": 75, "dose_unit": "mg", "frequency": "once daily", "route": "oral", "start_date": "2023-04-11", "status": "active"},
            {"name": "Sertraline", "dose": 50, "dose_unit": "mg", "frequency": "once daily", "route": "oral", "start_date": "2022-10-05", "status": "active"},
            {"name": "Metformin", "dose": 500, "dose_unit": "mg", "frequency": "twice daily", "route": "oral", "start_date": "2018-05-30", "status": "active"},
            {"name": "Amoxicillin", "dose": 500, "dose_unit": "mg", "frequency": "three times daily", "route": "oral", "start_date": "2024-03-01", "status": "active"},
        ],
        allergies=[
            {"substance": "Penicillin", "reaction": "Anaphylaxis", "severity": "severe"},
        ],
        lab_values=[
            {"test_name": "Serum Creatinine", "value": 2.4, "unit": "mg/dL", "collected_date": "2024-03-05"},
            {"test_name": "HbA1c", "value": 7.9, "unit": "%", "collected_date": "2024-03-05"},
            {"test_name": "Serum Potassium", "value": 5.4, "unit": "mEq/L", "collected_date": "2024-03-05"},
            {"test_name": "Platelet Count", "value": 142, "unit": "/cumm", "collected_date": "2024-03-05"},
            {"test_name": "INR", "value": 3.4, "unit": None, "collected_date": "2024-03-05"},
            {"test_name": "Hemoglobin", "value": 9.8, "unit": "g/dL", "collected_date": "2024-03-05"},
        ],
        procedures=[
            {"name": "Echocardiography", "performed_date": "2023-01-24", "outcome": "Normal LVEF"},
            {"name": "Haemodialysis", "performed_date": "2024-02-15", "outcome": "Well tolerated"},
        ],
        implants=[
            {"name": "Permanent Pacemaker", "implanted_date": "2023-03-02"},
        ],
    )
    lakshmi.documents = [
        {
            "filename": "SH-2048_prescription.pdf",
            "doc_type": "prescription",
            "title": "OUT-PATIENT PRESCRIPTION",
            "lines": [
                "CityCare Multispeciality Clinic",
                f"Patient Name: {lakshmi.full_name}",
                f"Patient Code: {lakshmi.patient_code}",
                f"Age / Sex: {lakshmi.age} / {lakshmi.sex}",
                f"Date: {base.isoformat()}",
                "DIAGNOSIS",
                "Atrial Fibrillation, Chronic Kidney Disease, Type 2 Diabetes Mellitus",
                "Peptic Ulcer Disease",
                "",
                "Rx",
                "1. Warfarin 2 mg once daily after food",
                "2. Aspirin 75 mg once daily after food",
                "3. Sertraline 50 mg once daily at bedtime",
                "4. Metformin 500 mg twice daily after meals",
                "5. Amoxicillin 500 mg three times daily for 5 days",
                "",
                "KNOWN ALLERGY: Penicillin - anaphylaxis",
                "",
                "Advice: Strictly maintain warfarin. Report any bleeding immediately.",
                "Review on 2024-03-25.",
            ],
        },
        {
            "filename": "SH-2048_lab_report.pdf",
            "doc_type": "lab_report",
            "title": "LABORATORY INVESTIGATION REPORT",
            "lines": [
                f"Patient Name: {lakshmi.full_name}",
                f"Patient Code: {lakshmi.patient_code}",
                f"Date of Collection: {(base - timedelta(days=6)).isoformat()}",
                "INVESTIGATION        RESULT        UNIT         REFERENCE RANGE",
                "Serum Creatinine     2.4           mg/dL        0.7 - 1.3",
                "HbA1c                7.9           %            4.0 - 5.7",
                "Serum Potassium      5.4           mEq/L        3.5 - 5.1",
                "Platelet Count       142           /cumm        150 - 410",
                "INR                  3.4                           2.0 - 3.0",
                "",
                "Haemoglobin          9.8           g/dL         13.0 - 17.0",
                "",
                "Remark: Renal function has worsened compared with the previous report.",
            ],
        },
        {
            "filename": "SH-2048_renal_followup.pdf",
            "doc_type": "diagnostic_report",
            "title": "NEPHROLOGY FOLLOW-UP NOTE",
            "lines": [
                f"Patient Name: {lakshmi.full_name}",
                f"Patient Code: {lakshmi.patient_code}",
                f"Age / Sex: {lakshmi.age} / {lakshmi.sex}",
                f"Date: {base.isoformat()}",
                "COMPLAINTS: Fatigue, mild pedal oedema, reduced urine output.",
                "",
                "FINDINGS: Chronic Kidney Disease since 2022-08-19, progressing.",
                "Atrial Fibrillation managed with warfarin and aspirin.",
                "Haemodialysis was performed on 2024-02-15 and was well tolerated.",
                "Echocardiography on 2023-01-24 reported normal LVEF.",
                "Permanent Pacemaker implanted on 2023-03-02.",
                "Peptic Ulcer Disease noted since 2023-04-11.",
                "",
                "IMPRESSION: CKD stage 4 with hyperkalaemia. Warfarin therapy continues.",
                "Plan: Reduce metformin. Avoid nephrotoxins. Review in 2 weeks.",
            ],
        },
    ]

    # --- Case 3: a stop-and-replace case, exercising longitudinal supersession. ---
    ananya = SyntheticPatient(
        patient_code="SH-3072",
        full_name="Ananya Iyer",
        age=34,
        sex="F",
        blood_group="A-",
        conditions=[
            {"name": "Iron Deficiency Anaemia", "onset_date": "2023-12-04", "status": "resolved", "is_chronic": False},
            {"name": "Migraine", "onset_date": "2020-07-19", "status": "active", "is_chronic": True},
        ],
        medications=[
            {"name": "Paracetamol", "dose": 500, "dose_unit": "mg", "frequency": "as needed", "route": "oral", "start_date": "2024-03-02", "status": "active"},
            {"name": "Ferrous Sulphate", "dose": 325, "dose_unit": "mg", "frequency": "twice daily", "route": "oral", "start_date": "2023-12-04", "status": "stopped", "end_date": "2024-02-20"},
        ],
        allergies=[
            {"substance": "Sulfonamide", "reaction": "Rash", "severity": "moderate"},
        ],
        lab_values=[
            {"test_name": "Hemoglobin", "value": 9.8, "unit": "g/dL", "collected_date": "2024-02-18"},
            {"test_name": "Ferritin", "value": 8, "unit": "ng/mL", "collected_date": "2024-02-18"},
            {"test_name": "Platelet Count", "value": 268, "unit": "/cumm", "collected_date": "2024-02-18"},
        ],
        procedures=[
            {"name": "Colonoscopy", "performed_date": "2024-01-15", "outcome": "Normal"},
        ],
    )
    ananya.documents = [
        {
            "filename": "SH-3072_discharge_summary.pdf",
            "doc_type": "discharge_summary",
            "title": "DISCHARGE SUMMARY",
            "lines": [
                f"Patient Name: {ananya.full_name}",
                f"Patient Code: {ananya.patient_code}",
                f"Age / Sex: {ananya.age} / {ananya.sex}",
                f"Date of Discharge: {base.isoformat()}",
                "FINAL DIAGNOSIS",
                "1. Migraine - since 2020-07-19, chronic",
                "2. Iron Deficiency Anaemia - resolved on 2024-02-20",
                "",
                "HOSPITAL COURSE",
                "Patient underwent elective investigation. Uneventful recovery.",
                "Colonoscopy was performed on 2024-01-15 and was normal.",
                "Ferrous Sulphate has been stopped as haemoglobin has normalised.",
                "",
                "DISCHARGE MEDICATIONS",
                "1. Paracetamol 500 mg as needed for headache, oral",
                "",
                "KNOWN ALLERGY: Sulfa drugs - rash",
                "",
                "FOLLOW UP: Neurology OPD on 2024-04-20.",
            ],
        },
        {
            "filename": "SH-3072_lab_report.pdf",
            "doc_type": "lab_report",
            "title": "LABORATORY INVESTIGATION REPORT",
            "lines": [
                f"Patient Name: {ananya.full_name}",
                f"Patient Code: {ananya.patient_code}",
                f"Date of Collection: {(date(2024, 2, 18)).isoformat()}",
                "INVESTIGATION        RESULT        UNIT         REFERENCE RANGE",
                "Haemoglobin          9.8           g/dL         13.0 - 17.0",
                "Ferritin             8             ng/mL        15 - 150",
                "",
                "Platelet Count       268           /cumm        150 - 410",
            ],
        },
    ]

    return [ramesh, lakshmi, ananya]


def _render_pdf(path: Path, document: Dict[str, Any]) -> None:
    """Write one synthetic record to a real PDF so the text layer is genuine."""
    pdf = pdf_canvas.Canvas(str(path), pagesize=A4)
    width, height = A4
    left = 54
    top = height - 60

    pdf.setFont("Helvetica-Bold", 13)
    pdf.drawString(left, top, "SynapseHealth Synthetic Record")
    pdf.setFont("Helvetica-Oblique", 8)
    pdf.drawString(left, top - 14, "FULLY SYNTHETIC DATA - NOT A REAL PATIENT")
    pdf.line(left, top - 20, width - 54, top - 20)

    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(left, top - 42, document["title"])

    pdf.setFont("Courier", 9)
    y = top - 66
    for line in document["lines"]:
        if y < 60:
            pdf.showPage()
            pdf.setFont("Courier", 9)
            y = height - 60
        pdf.drawString(left, y, line)
        y -= 14

    pdf.showPage()
    pdf.save()


def generate(out_dir: Path, patients: Optional[List[SyntheticPatient]] = None) -> Path:
    """Generate the synthetic corpus and its ground-truth JSON."""
    random.seed(_SEED)
    out_dir.mkdir(parents=True, exist_ok=True)
    cohort = patients or _build_patients()

    manifest: List[Dict[str, Any]] = []
    truth_dir = out_dir / "ground_truth"
    truth_dir.mkdir(exist_ok=True)

    for patient in cohort:
        for document in patient.documents:
            pdf_path = out_dir / document["filename"]
            _render_pdf(pdf_path, document)

            manifest.append(
                {
                    "filename": document["filename"],
                    "patient_code": patient.patient_code,
                    "expected_doc_type": document["doc_type"],
                    "ground_truth": f"ground_truth/{patient.patient_code}.json",
                }
            )

        truth_path = truth_dir / f"{patient.patient_code}.json"
        truth_path.write_text(json.dumps(patient.ground_truth(), indent=2), encoding="utf-8")

    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return out_dir


def main() -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser(description="Generate the SynapseHealth synthetic corpus.")
    parser.add_argument("--out", default=str(_PROJECT_ROOT / "data" / "corpus"), help="Output directory.")
    parser.add_argument("--patients", type=int, default=None, help="Unused; cohort is fixed by design.")
    args = parser.parse_args()

    target = Path(args.out)
    generate(target)
    pdfs = sorted(target.glob("*.pdf"))
    print(f"Wrote {len(pdfs)} synthetic PDF(s) to {target}")
    for pdf_path in pdfs:
        print(f"  - {pdf_path.name}")


if __name__ == "__main__":
    main()