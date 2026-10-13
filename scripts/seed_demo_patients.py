"""
SynapseHealth — Demo Patient Seed Script
Populates high-fidelity clinical records for system demonstrations:
1. Patient 1: "Trauma ER Patient" (Code: ER-TRAUMA-01)
   - Optimized for Break-Glass emergency protocol demonstration.
   - Unconscious trauma victim with O- universal blood group, severe Penicillin anaphylaxis,
     coronary artery disease, drug-eluting stent implant, and active cardiac medication.
2. Patient 2: "Arjun Rao" (Code: OPD-ARJUN)
   - Optimized for Outpatient (OPD) medication safety and cross-hospital record reconciliation.
   - 3-document longitudinal history (Cardiology Consult, Orthopedic Discharge, Metabolic Panel).
   - High-risk Drug-Drug Interaction: Warfarin + Aspirin (NSAID) causing critical bleeding contraindication.
   - Full grounded source spans, page coordinates, and confidence scores for citation verification.
"""

import hashlib
from datetime import date, datetime
from pathlib import Path
from typing import Dict, List, Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas as pdf_canvas
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from src.agents.flashcard_agent import FlashcardAgent
from src.agents.safety_agent import SafetyAgent
from src.db.database import SessionLocal, get_upload_dir, init_db
from src.db.models import (
    Allergy,
    Appointment,
    Condition,
    EmergencyFlashcard,
    Implant,
    LabValue,
    Medication,
    Patient,
    SafetyAlert,
    SourceDocument,
)


def _generate_simple_pdf(filepath: Path, title: str, lines: List[str]) -> bytes:
    """Generate a clean synthetic clinical PDF and write to filepath."""
    filepath.parent.mkdir(parents=True, exist_ok=True)
    c = pdf_canvas.Canvas(str(filepath), pagesize=A4)
    width, height = A4

    # Header banner
    c.setFillColor(colors.HexColor("#0f172a"))
    c.rect(0, height - 70, width, 70, fill=1, stroke=0)

    c.setFillColor(colors.HexColor("#38bdf8"))
    c.setFont("Helvetica-Bold", 16)
    c.drawString(40, height - 42, "PulseVault AI / SynapseHealth Clinical Archive")

    c.setFillColor(colors.white)
    c.setFont("Helvetica", 10)
    c.drawString(40, height - 58, f"Document: {title}")

    # Body text
    y = height - 105
    c.setFillColor(colors.HexColor("#1e293b"))
    c.setFont("Helvetica-Bold", 12)
    c.drawString(40, y, title.upper())
    y -= 22

    c.setFont("Helvetica", 10)
    c.setFillColor(colors.HexColor("#334155"))
    for line in lines:
        if line.startswith("---"):
            y -= 10
            c.setStrokeColor(colors.HexColor("#cbd5e1"))
            c.line(40, y, width - 40, y)
            y -= 15
        elif line.startswith("#"):
            y -= 8
            c.setFont("Helvetica-Bold", 11)
            c.setFillColor(colors.HexColor("#0f172a"))
            c.drawString(40, y, line.lstrip("# ").strip())
            c.setFont("Helvetica", 10)
            c.setFillColor(colors.HexColor("#334155"))
            y -= 16
        else:
            c.drawString(40, y, line)
            y -= 15
        if y < 60:
            c.showPage()
            y = height - 60

    c.showPage()
    c.save()
    return filepath.read_bytes()


def seed_demo_patients(db: Optional[Session] = None) -> Dict[str, str]:
    """Seed both demonstration patients into the database."""
    init_db()
    upload_dir = get_upload_dir()
    owns_session = db is None
    session = db or SessionLocal()

    safety_agent = SafetyAgent()
    flashcard_agent = FlashcardAgent()

    try:
        # =====================================================================
        # 1. Patient 1: Trauma ER Patient (Break-Glass Demonstration)
        # =====================================================================
        er_code = "ER-TRAUMA-01"
        p1 = session.scalar(select(Patient).where(Patient.patient_code == er_code))
        if p1:
            session.execute(delete(SourceDocument).where(SourceDocument.patient_id == p1.id))
            session.execute(delete(EmergencyFlashcard).where(EmergencyFlashcard.patient_id == p1.id))
            session.execute(delete(SafetyAlert).where(SafetyAlert.patient_id == p1.id))
        else:
            p1 = Patient(patient_code=er_code, full_name="Trauma ER Patient")
            session.add(p1)
            session.flush()

        p1.full_name = "Trauma ER Patient"
        p1.age = 34
        p1.sex = "M"
        p1.blood_group = "O-"
        p1.contact = "+1 (555) 911-0199"
        p1.emergency_contact = "EMS Trauma Transport Unit #4 (555-019-9111)"

        # Create Trauma Source Document
        triage_lines = [
            "# EMS EMERGENCY ADMISSION & TRIAGE RUN SHEET",
            "Incident Type: High-velocity Motor Vehicle Collision (MVC)",
            "Triage Status: Unconscious, GCS 7 (E1V2M4), Intubated on scene.",
            "Identity Token: Medallion & National ID card found on person.",
            "---",
            "# CRITICAL FINDINGS",
            "Blood Type: O-Negative (Universal Donor required immediately)",
            "Allergies: Severe Penicillin Anaphylaxis (Documented in EMS profile)",
            "Past Medical History: Coronary Artery Disease with LAD Drug-Eluting Stent (DES) placed 2022.",
            "Active Medications: Metoprolol Tartrate 50mg PO BID, Atorvastatin 40mg PO QD.",
            "Chronic Conditions: Severe Bronchial Asthma (Uses Albuterol Inhaler PRN).",
            "Emergency Contact: EMS Dispatch Transport Unit 4 (Dispatch ID #8841)",
        ]
        doc1_path = upload_dir / f"demo_{er_code}_ems_runsheet.pdf"
        doc1_bytes = _generate_simple_pdf(doc1_path, "EMS Trauma Run Sheet", triage_lines)
        doc1_hash = hashlib.sha256(doc1_bytes).hexdigest()

        doc1 = SourceDocument(
            patient_id=p1.id,
            filename="EMS_Trauma_Triage_RunSheet.pdf",
            doc_type="emergency_runsheet",
            mime_type="application/pdf",
            size_bytes=len(doc1_bytes),
            sha256=doc1_hash,
            page_count=1,
            extraction_method="vision_ocr",
            extracted_text="\n".join(triage_lines),
            uploaded_at=datetime.utcnow(),
            processed_at=datetime.utcnow(),
        )
        session.add(doc1)
        session.flush()

        # Conditions
        cad = Condition(
            patient_id=p1.id,
            name="Coronary Artery Disease",
            icd10_code="I25.10",
            snomed_code="53741008",
            status="active",
            is_chronic=True,
            onset_date=date(2022, 1, 15),
            source_document_id=doc1.id,
            source_page=1,
            source_span="Coronary Artery Disease with LAD Drug-Eluting Stent (DES) placed 2022",
            source_confidence=0.98,
        )
        asthma = Condition(
            patient_id=p1.id,
            name="Severe Asthma",
            icd10_code="J45.50",
            snomed_code="195967001",
            status="active",
            is_chronic=True,
            onset_date=date(2018, 5, 10),
            source_document_id=doc1.id,
            source_page=1,
            source_span="Chronic Conditions: Severe Bronchial Asthma",
            source_confidence=0.96,
        )
        session.add_all([cad, asthma])

        # Allergy
        pen_allergy = Allergy(
            patient_id=p1.id,
            substance="Penicillin",
            snomed_code="91936005",
            reaction="Anaphylaxis & Laryngeal Edema",
            severity="severe",
            source_document_id=doc1.id,
            source_page=1,
            source_span="Allergies: Severe Penicillin Anaphylaxis (Documented in EMS profile)",
            source_confidence=0.99,
        )
        session.add(pen_allergy)

        # Implant
        stent = Implant(
            patient_id=p1.id,
            name="Coronary Stent (DES)",
            snomed_code="360062007",
            implanted_date=date(2022, 2, 1),
            source_document_id=doc1.id,
            source_page=1,
            source_span="LAD Drug-Eluting Stent (DES) placed 2022",
            source_confidence=0.97,
        )
        session.add(stent)

        # Medications
        med_metoprolol = Medication(
            patient_id=p1.id,
            name="Metoprolol Tartrate",
            rxnorm_code="866418",
            dose=50.0,
            dose_unit="mg",
            frequency="twice daily",
            route="oral",
            status="active",
            start_date=date(2022, 2, 1),
            source_document_id=doc1.id,
            source_page=1,
            source_span="Metoprolol Tartrate 50mg PO BID",
            source_confidence=0.98,
        )
        med_atorvastatin = Medication(
            patient_id=p1.id,
            name="Atorvastatin",
            rxnorm_code="83367",
            dose=40.0,
            dose_unit="mg",
            frequency="once daily at night",
            route="oral",
            status="active",
            start_date=date(2022, 2, 1),
            source_document_id=doc1.id,
            source_page=1,
            source_span="Atorvastatin 40mg PO QD",
            source_confidence=0.97,
        )
        med_albuterol = Medication(
            patient_id=p1.id,
            name="Albuterol Inhaler",
            rxnorm_code="745678",
            dose=90.0,
            dose_unit="mcg",
            frequency="PRN for wheezing",
            route="inhalation",
            status="active",
            start_date=date(2018, 5, 10),
            source_document_id=doc1.id,
            source_page=1,
            source_span="Uses Albuterol Inhaler PRN",
            source_confidence=0.95,
        )
        session.add_all([med_metoprolol, med_atorvastatin, med_albuterol])
        session.flush()

        # Evaluate and Cache Flashcard
        safety_agent.evaluate(session, p1, persist=True)
        flashcard_agent.compute(session, p1)

        # =====================================================================
        # 2. Patient 2: Arjun Rao (OPD Demonstration with Warfarin + NSAID)
        # =====================================================================
        opd_code = "OPD-ARJUN"
        p2 = session.scalar(select(Patient).where(Patient.patient_code == opd_code))
        if p2:
            session.execute(delete(SourceDocument).where(SourceDocument.patient_id == p2.id))
            session.execute(delete(EmergencyFlashcard).where(EmergencyFlashcard.patient_id == p2.id))
            session.execute(delete(SafetyAlert).where(SafetyAlert.patient_id == p2.id))
        else:
            p2 = Patient(patient_code=opd_code, full_name="Arjun Rao")
            session.add(p2)
            session.flush()

        p2.full_name = "Arjun Rao"
        p2.age = 62
        p2.sex = "M"
        p2.blood_group = "A+"
        p2.contact = "+91 98765 43210"
        p2.emergency_contact = "Priya Rao (Daughter) +91 98765 43211"

        # Document 1: Cardiology Consult (Warfarin Initiation & DVT)
        cardio_lines = [
            "# APOLLO HOSPITALS — DEPT OF CARDIOLOGY & VASCULAR MEDICINE",
            "Consultant: Dr. K. Venkatraman, MD, DM (Cardiology)",
            "Date of Visit: April 12, 2023 | Patient: Arjun Rao (62M)",
            "---",
            "# CLINICAL PRESENTATION & DIAGNOSIS",
            "Chief Complaint: Left calf pain, warmth, and marked oedema post long-haul flight.",
            "Duplex Ultrasonography: Acute Deep Vein Thrombosis (DVT) in left popliteal vein.",
            "Diagnosis: Lower Extremity Deep Vein Thrombosis (ICD-10: I82.40).",
            "Allergies: Documented moderate allergic cutaneous rash to Sulfonamides.",
            "---",
            "# THERAPEUTIC REGIMEN",
            "1. Warfarin sodium 5mg orally once daily at 18:00 hours.",
            "2. Target therapeutic INR range: 2.0 to 3.0. Baseline INR: 1.10.",
            "3. Comprehensive counselling: Avoid dietary green leafy fluctuations. Strictly avoid OTC NSAIDs.",
        ]
        cardio_path = upload_dir / f"demo_{opd_code}_cardiology_consult.pdf"
        cardio_bytes = _generate_simple_pdf(cardio_path, "Cardiology Consult — DVT Protocol", cardio_lines)
        cardio_hash = hashlib.sha256(cardio_bytes).hexdigest()

        doc_cardio = SourceDocument(
            patient_id=p2.id,
            filename="Cardiology_Consult_Apollo_2023.pdf",
            doc_type="consultation_note",
            mime_type="application/pdf",
            size_bytes=len(cardio_bytes),
            sha256=cardio_hash,
            page_count=1,
            extraction_method="vision_ocr",
            extracted_text="\n".join(cardio_lines),
            uploaded_at=datetime(2023, 4, 12, 10, 30),
            processed_at=datetime(2023, 4, 12, 10, 35),
        )
        session.add(doc_cardio)
        session.flush()

        # Document 2: Orthopedic Discharge (Aspirin prescription for knee osteoarthritis)
        ortho_lines = [
            "# MANIPAL HOSPITALS — DEPT OF ORTHOPAEDICS & JOINT RECONSTRUCTION",
            "Attending: Dr. Rajesh Hegde, MS (Ortho)",
            "Evaluation Date: February 18, 2024 | Patient: Arjun Rao (62M)",
            "---",
            "# CLINICAL FINDINGS",
            "Bilateral knee pain, crepitus, and stiffness on weight-bearing.",
            "Radiographs: Kellgren-Lawrence Grade 3 Osteoarthritis (Bilateral Knees).",
            "Past History: Intermittent gastritis with historical peptic ulcer disease.",
            "---",
            "# DISCHARGE MEDICATION ADVICE",
            "1. Prescribed Aspirin 325mg orally daily with meals for chronic joint inflammation.",
            "2. Quadriceps strengthening exercises and low-impact swimming.",
        ]
        ortho_path = upload_dir / f"demo_{opd_code}_orthopedic_discharge.pdf"
        ortho_bytes = _generate_simple_pdf(ortho_path, "Orthopedic OPD Summary", ortho_lines)
        ortho_hash = hashlib.sha256(ortho_bytes).hexdigest()

        doc_ortho = SourceDocument(
            patient_id=p2.id,
            filename="Orthopedic_Discharge_Manipal_2024.pdf",
            doc_type="discharge_summary",
            mime_type="application/pdf",
            size_bytes=len(ortho_bytes),
            sha256=ortho_hash,
            page_count=1,
            extraction_method="vision_ocr",
            extracted_text="\n".join(ortho_lines),
            uploaded_at=datetime(2024, 2, 18, 14, 15),
            processed_at=datetime(2024, 2, 18, 14, 20),
        )
        session.add(doc_ortho)
        session.flush()

        # Document 3: Metabolic Panel Lab Report (Diabetes)
        lab_lines = [
            "# CENTRAL DIAGNOSTIC LABORATORIES — BIOCHEMISTRY PROFILE",
            "Accession ID: CDL-99824 | Date: March 05, 2024 | Patient: Arjun Rao (62M)",
            "---",
            "# TEST RESULTS",
            "Fasting Plasma Glucose: 142 mg/dL [Reference Range: 70 - 99 mg/dL] (HIGH)",
            "Glycated Haemoglobin (HbA1c): 7.4 % [Reference Range: 4.0 - 5.6 %] (HIGH)",
            "Serum Creatinine: 1.05 mg/dL [Reference Range: 0.70 - 1.30 mg/dL] (NORMAL)",
            "Prothrombin Time INR: 2.40 [Therapeutic Target: 2.00 - 3.00] (OPTIMAL)",
            "---",
            "# ENDOCRINE ASSESSMENT",
            "Diagnosis: Uncontrolled Type 2 Diabetes Mellitus (ICD-10: E11.9).",
            "Started on Metformin 500mg PO BD with breakfast and dinner.",
        ]
        lab_path = upload_dir / f"demo_{opd_code}_metabolic_lab.pdf"
        lab_bytes = _generate_simple_pdf(lab_path, "Metabolic Panel Report", lab_lines)
        lab_hash = hashlib.sha256(lab_bytes).hexdigest()

        doc_lab = SourceDocument(
            patient_id=p2.id,
            filename="Metabolic_Panel_Lab_Report_2024.pdf",
            doc_type="lab_report",
            mime_type="application/pdf",
            size_bytes=len(lab_bytes),
            sha256=lab_hash,
            page_count=1,
            extraction_method="vision_ocr",
            extracted_text="\n".join(lab_lines),
            uploaded_at=datetime(2024, 3, 5, 9, 0),
            processed_at=datetime(2024, 3, 5, 9, 10),
        )
        session.add(doc_lab)
        session.flush()

        # P2 Conditions with Citations
        cond_dvt = Condition(
            patient_id=p2.id,
            name="Deep Vein Thrombosis",
            icd10_code="I82.40",
            snomed_code="128053003",
            status="active",
            is_chronic=True,
            onset_date=date(2023, 4, 12),
            source_document_id=doc_cardio.id,
            source_page=1,
            source_span="Acute Deep Vein Thrombosis (DVT) in left popliteal vein",
            source_confidence=0.98,
        )
        cond_osteo = Condition(
            patient_id=p2.id,
            name="Osteoarthritis (Bilateral Knees)",
            icd10_code="M17.0",
            snomed_code="239872002",
            status="active",
            is_chronic=True,
            onset_date=date(2021, 8, 15),
            source_document_id=doc_ortho.id,
            source_page=1,
            source_span="Kellgren-Lawrence Grade 3 Osteoarthritis (Bilateral Knees)",
            source_confidence=0.96,
        )
        cond_dm = Condition(
            patient_id=p2.id,
            name="Type 2 Diabetes Mellitus",
            icd10_code="E11.9",
            snomed_code="44054006",
            status="active",
            is_chronic=True,
            onset_date=date(2019, 11, 20),
            source_document_id=doc_lab.id,
            source_page=1,
            source_span="Diagnosis: Uncontrolled Type 2 Diabetes Mellitus (ICD-10: E11.9)",
            source_confidence=0.97,
        )
        cond_ulcer = Condition(
            patient_id=p2.id,
            name="Peptic Ulcer Disease",
            icd10_code="K27.9",
            snomed_code="13200003",
            status="active",
            is_chronic=True,
            onset_date=date(2020, 3, 1),
            source_document_id=doc_ortho.id,
            source_page=1,
            source_span="Past History: Intermittent gastritis with historical peptic ulcer disease",
            source_confidence=0.92,
        )
        session.add_all([cond_dvt, cond_osteo, cond_dm, cond_ulcer])

        # P2 Medications (Warfarin + Aspirin NSAID Trigger)
        med_warfarin = Medication(
            patient_id=p2.id,
            name="Warfarin",
            rxnorm_code="11289",
            dose=5.0,
            dose_unit="mg",
            frequency="once daily at 18:00",
            route="oral",
            status="active",
            start_date=date(2023, 4, 12),
            source_document_id=doc_cardio.id,
            source_page=1,
            source_span="Warfarin sodium 5mg orally once daily at 18:00 hours",
            source_confidence=0.99,
        )
        med_aspirin = Medication(
            patient_id=p2.id,
            name="Aspirin",
            rxnorm_code="1191",
            dose=325.0,
            dose_unit="mg",
            frequency="daily with meals",
            route="oral",
            status="active",
            start_date=date(2024, 2, 18),
            source_document_id=doc_ortho.id,
            source_page=1,
            source_span="Prescribed Aspirin 325mg orally daily with meals for chronic joint inflammation",
            source_confidence=0.97,
        )
        med_metformin = Medication(
            patient_id=p2.id,
            name="Metformin",
            rxnorm_code="6809",
            dose=500.0,
            dose_unit="mg",
            frequency="twice daily with meals",
            route="oral",
            status="active",
            start_date=date(2024, 3, 5),
            source_document_id=doc_lab.id,
            source_page=1,
            source_span="Started on Metformin 500mg PO BD with breakfast and dinner",
            source_confidence=0.97,
        )
        session.add_all([med_warfarin, med_aspirin, med_metformin])

        # P2 Allergy
        sulfa_allergy = Allergy(
            patient_id=p2.id,
            substance="Sulfonamides",
            snomed_code="91939003",
            reaction="Cutaneous urticarial rash",
            severity="moderate",
            source_document_id=doc_cardio.id,
            source_page=1,
            source_span="Allergies: Documented moderate allergic cutaneous rash to Sulfonamides",
            source_confidence=0.94,
        )
        session.add(sulfa_allergy)

        # P2 Lab Values
        lab_inr = LabValue(
            patient_id=p2.id,
            test_name="Prothrombin Time INR",
            loinc_code="6301-6",
            value=2.40,
            value_text="2.40",
            unit="ratio",
            ref_low=2.0,
            ref_high=3.0,
            flag="normal",
            collected_date=date(2024, 3, 5),
            source_document_id=doc_lab.id,
            source_page=1,
            source_span="Prothrombin Time INR: 2.40 [Therapeutic Target: 2.00 - 3.00]",
            source_confidence=0.98,
        )
        lab_hba1c = LabValue(
            patient_id=p2.id,
            test_name="Glycated Haemoglobin (HbA1c)",
            loinc_code="4548-4",
            value=7.4,
            value_text="7.4",
            unit="%",
            ref_low=4.0,
            ref_high=5.6,
            flag="high",
            collected_date=date(2024, 3, 5),
            source_document_id=doc_lab.id,
            source_page=1,
            source_span="Glycated Haemoglobin (HbA1c): 7.4 % (HIGH)",
            source_confidence=0.98,
        )
        lab_glucose = LabValue(
            patient_id=p2.id,
            test_name="Fasting Plasma Glucose",
            loinc_code="1558-6",
            value=142.0,
            value_text="142",
            unit="mg/dL",
            ref_low=70.0,
            ref_high=99.0,
            flag="high",
            collected_date=date(2024, 3, 5),
            source_document_id=doc_lab.id,
            source_page=1,
            source_span="Fasting Plasma Glucose: 142 mg/dL (HIGH)",
            source_confidence=0.97,
        )
        session.add_all([lab_inr, lab_hba1c, lab_glucose])
        session.flush()

        # Evaluate Deterministic Safety Engine (Triggers DD-001 Warfarin+Aspirin and CX-003 Aspirin+Ulcer)
        safety_agent.evaluate(session, p2, persist=True)
        flashcard_agent.compute(session, p2)

        # =====================================================================
        # 3. Patient 3: Aarav Sharma (SYN123456) - Desk Registration & OPD Demo
        # =====================================================================
        syn_code = "SYN123456"
        p3 = session.scalar(select(Patient).where(Patient.patient_code == syn_code))
        if p3:
            session.execute(delete(SourceDocument).where(SourceDocument.patient_id == p3.id))
            session.execute(delete(EmergencyFlashcard).where(EmergencyFlashcard.patient_id == p3.id))
            session.execute(delete(SafetyAlert).where(SafetyAlert.patient_id == p3.id))
        else:
            p3 = Patient(patient_code=syn_code, full_name="Aarav Sharma")
            session.add(p3)
            session.flush()

        p3.full_name = "Aarav Sharma"
        p3.age = 22
        p3.sex = "M"
        p3.blood_group = "B+"
        p3.contact = "+91 98765 43210"
        p3.emergency_contact = "Sunita Sharma (Mother) +91 98765 43219"

        doc3_lines = [
            "# CITY CARE HOSPITALS — OUTPATIENT SUMMARY",
            "Patient: Aarav Sharma (22M) | SynapseHealth ID: SYN123456",
            "Date of Birth: 14 Mar 2002 | Address: Hyderabad, Telangana",
            "Email: aarav.sharma@example.com | Phone: +91 98765 43210",
            "---",
            "# CLINICAL PROFILE",
            "Blood Group: B-Positive (B+).",
            "Documented Allergies: Penicillin (Moderate urticaria and rash).",
            "Chronic Conditions: Bronchial Asthma (diagnosed 2018).",
            "Active Medications:",
            "1. Albuterol Inhaler 90mcg PRN for wheezing / exercise prophylaxis.",
            "2. Fluticasone Propionate 100mcg inhaled twice daily maintenance.",
        ]
        doc3_path = upload_dir / f"demo_{syn_code}_summary.pdf"
        doc3_bytes = _generate_simple_pdf(doc3_path, "Aarav Sharma Clinical Summary", doc3_lines)
        doc3_hash = hashlib.sha256(doc3_bytes).hexdigest()

        doc_p3 = SourceDocument(
            patient_id=p3.id,
            filename="Aarav_Sharma_Clinical_Summary.pdf",
            doc_type="clinical_summary",
            mime_type="application/pdf",
            size_bytes=len(doc3_bytes),
            sha256=doc3_hash,
            page_count=1,
            extraction_method="vision_ocr",
            extracted_text="\n".join(doc3_lines),
            uploaded_at=datetime(2025, 8, 12, 9, 30),
            processed_at=datetime(2025, 8, 12, 9, 32),
        )
        session.add(doc_p3)
        session.flush()

        cond_asthma = Condition(
            patient_id=p3.id,
            name="Asthma",
            icd10_code="J45.909",
            status="active",
            is_chronic=True,
            onset_date=date(2018, 5, 14),
            source_document_id=doc_p3.id,
            source_page=1,
            source_span="Chronic Conditions: Bronchial Asthma (diagnosed 2018)",
            source_confidence=0.98,
        )
        session.add(cond_asthma)

        allergy_pen = Allergy(
            patient_id=p3.id,
            substance="Penicillin",
            reaction="Moderate urticaria and cutaneous rash",
            severity="moderate",
            source_document_id=doc_p3.id,
            source_page=1,
            source_span="Documented Allergies: Penicillin (Moderate urticaria and rash)",
            source_confidence=0.97,
        )
        session.add(allergy_pen)

        med_albuterol = Medication(
            patient_id=p3.id,
            name="Albuterol Inhaler",
            rxnorm_code="745678",
            dose=90.0,
            dose_unit="mcg",
            frequency="PRN for wheezing",
            route="inhalation",
            status="active",
            start_date=date(2018, 5, 14),
            source_document_id=doc_p3.id,
            source_page=1,
            source_span="Albuterol Inhaler 90mcg PRN for wheezing",
            source_confidence=0.98,
        )
        med_fluticasone = Medication(
            patient_id=p3.id,
            name="Fluticasone Propionate",
            rxnorm_code="896321",
            dose=100.0,
            dose_unit="mcg",
            frequency="twice daily",
            route="inhalation",
            status="active",
            start_date=date(2021, 3, 10),
            source_document_id=doc_p3.id,
            source_page=1,
            source_span="Fluticasone Propionate 100mcg inhaled twice daily maintenance",
            source_confidence=0.96,
        )
        session.add_all([med_albuterol, med_fluticasone])
        session.flush()

        safety_agent.evaluate(session, p3, persist=True)
        flashcard_agent.compute(session, p3)

        # =====================================================================
        # 4. Clinic Queue & Appointments Seeding
        # =====================================================================
        session.execute(delete(Appointment))
        demo_appointments = [
            Appointment(
                patient_code="SYN123456",
                token_number="001",
                patient_name="Aarav Sharma",
                department="General Medicine",
                doctor_name="Dr. Meera Thomas",
                scheduled_time="10:00 AM",
                status="checked_in",
                chief_complaint="Asthma routine check & prescription refill",
            ),
            Appointment(
                patient_code="OPD-ARJUN",
                token_number="002",
                patient_name="Arjun Rao",
                department="Cardiology",
                doctor_name="Dr. Meera Thomas",
                scheduled_time="10:30 AM",
                status="waiting",
                chief_complaint="Knee pain review & anticoagulant medication check",
            ),
            Appointment(
                patient_code="SYN772109",
                token_number="003",
                patient_name="Priya Sharma",
                department="Dermatology",
                doctor_name="Dr. Priya Mehta",
                scheduled_time="10:45 AM",
                status="waiting",
                chief_complaint="Skin allergy & rash consultation",
            ),
            Appointment(
                patient_code="SYN443210",
                token_number="004",
                patient_name="Rajesh Kumar",
                department="General Medicine",
                doctor_name="Dr. Meera Thomas",
                scheduled_time="11:00 AM",
                status="waiting",
                chief_complaint="Hypertension monitoring & BP check",
            ),
            Appointment(
                patient_code="ER-TRAUMA-01",
                token_number="005",
                patient_name="Trauma ER Patient",
                department="Emergency / Trauma",
                doctor_name="Dr. Vikram Menon",
                scheduled_time="09:30 AM",
                status="in_consultation",
                chief_complaint="MVC high-velocity trauma, loss of consciousness",
            ),
            Appointment(
                patient_code="SYN991244",
                token_number="006",
                patient_name="Rohan Iyer",
                department="General Medicine",
                doctor_name="Dr. Meera Thomas",
                scheduled_time="11:30 AM",
                status="consulted",
                chief_complaint="Annual routine preventive wellness review",
            ),
        ]
        session.add_all(demo_appointments)

        session.commit()
        return {
            "status": "success",
            "patient_1": f"{p1.full_name} ({p1.patient_code}) seeded for Break-Glass demo",
            "patient_2": f"{p2.full_name} ({p2.patient_code}) seeded for OPD Warfarin+NSAID demo",
            "patient_3": f"{p3.full_name} ({p3.patient_code}) seeded for Desk & Doctor console demo",
            "appointments": f"{len(demo_appointments)} clinic queue appointments seeded",
        }
    except Exception:
        session.rollback()
        raise
    finally:
        if owns_session:
            session.close()


if __name__ == "__main__":
    result = seed_demo_patients()
    print("Seed complete:")
    for k, v in result.items():
        print(f"  {k}: {v}")
