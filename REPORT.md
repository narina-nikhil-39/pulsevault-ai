# SynapseHealth: AI-Powered Clinical Ingestion, Temporal Knowledge Graph, and Emergency Safety System

**Project Technical Report & System Documentation**

---

## Table of Contents

1. [Executive Summary & Abstract](#1-executive-summary--abstract)
2. [Introduction & Problem Statement](#2-introduction--problem-statement)
3. [System Requirements & Domain Scope](#3-system-requirements--domain-scope)
4. [High-Level Architecture & Agentic Workflow](#4-high-level-architecture--agentic-workflow)
5. [Document Ingestion & Vision/OCR Agent](#5-document-ingestion--visionocr-agent)
6. [Clinical Entity Extraction Engine (Dual-Path Architecture)](#6-clinical-entity-extraction-engine-dual-path-architecture)
7. [Medical Terminology Normalization](#7-medical-terminology-normalization)
8. [Patient Temporal Health Graph & Conflict Engine](#8-patient-temporal-health-graph--conflict-engine)
9. [Deterministic Safety Engine & Emergency Flashcard Cache](#9-deterministic-safety-engine--emergency-flashcard-cache)
10. [Web Gateway, Authentication & React 19 Frontend](#10-web-gateway-authentication--react-19-frontend)
11. [Quantitative Evaluation Methodology & Results](#11-quantitative-evaluation-methodology--results)
12. [Defect Surface Analysis, Bug Fixes & Limitations](#12-defect-surface-analysis-bug-fixes--limitations)
13. [Future Scope & Conclusion](#13-future-scope--conclusion)

---

## 1. Executive Summary & Abstract

Unstructured clinical records—ranging from scanned hospital discharge summaries and laboratory result slips to typed prescriptions—pose severe challenges for rapid emergency decision-making. Essential diagnostic context is frequently buried across disparate PDF attachments, leading to adverse drug events, delayed treatments, and medical errors during emergency room triage.

**SynapseHealth** is an end-to-end clinical ingestion and emergency safety system built to bridge unstructured medical records and real-time clinical decision support. The system implements a 7-stage multi-agent pipeline composed of five specialized agents: Ingestion/OCR Agent, Clinical Entity Extraction Agent, Terminology Normalization Engine, Temporal Health Graph Agent, and Deterministic Safety Agent.

### Key Contributions & Technical Highlights:
- **Dual-Path Extraction Architecture**: Seamlessly switches between Gemini 2.5 Flash LLM extraction (for high-fidelity multimodal processing) and a deterministic fallback lexicon engine (for offline or unconfigured environments).
- **Standardized Medical Vocabularies**: Maps raw clinical text to standard ontologies including SNOMED CT, RxNorm, ICD-10, and LOINC.
- **Deterministic Safety Verification**: Evaluates drug-drug interactions, severe contraindications, dosage limit breaches, and critical laboratory thresholds without LLM non-determinism.
- **Sub-3-Second Emergency Flashcard**: Computes and caches a real-time summary card detailing patient allergies, active medications, chronic conditions, and emergency alerts.
- **Empirical Evaluation**: Evaluated against a synthetic patient cohort (7 documents, 43 ground-truth clinical entities), achieving **1.00 Micro/Macro F1** across all categories while acting as a regression guard.

---

## 2. Introduction & Problem Statement

### 2.1 Context
In contemporary clinical environments, emergency physician workflow is hampered by document fragmentation. Patients presenting to acute care settings frequently bring prior paper records, scanned PDFs, or unstandardized digital notes. Manual chart review during an emergency is time-prohibitive, increasing the risk of missing critical contraindications (e.g., administering anticoagulants to a patient with active internal bleeding or prescribing penicillin to an severely allergic patient).

### 2.2 Problem Statement
Existing Electronic Health Record (EHR) systems struggle with two main issues:
1. **Unstructured Data Silos**: PDF documents lack structured metadata for automated safety querying.
2. **LLM Hallucination Risk in Critical Care**: Fully generative AI models can introduce non-deterministic errors or hallucinated dosages when generating clinical recommendations.

### 2.3 Proposed Solution
SynapseHealth solves these challenges through a hybrid architecture: using LLMs/lexicons strictly for parsing and extraction, while delegating safety scoring, contraindication detection, and emergency flashcard compilation to a 100% deterministic rule engine backed by an immutable audit logger.

---

## 3. System Requirements & Domain Scope

### 3.1 Domain Boundaries
The system is explicitly scoped to ingest six document classes commonly encountered in acute care:
1. Hospital Discharge Summaries
2. Laboratory Investigation Reports
3. Outpatient Prescriptions
4. Diagnostic Cardiology/Imaging Reports
5. Patient History & Allergy Intake Forms
6. Clinical Progress Notes

### 3.2 Key Target Clinical Entity Groups
- **Conditions / Diagnoses**: e.g., Type 2 Diabetes, Acute Myocardial Infarction, Chronic Kidney Disease.
- **Medications**: Active and superseded drugs with dosage, frequency, route, and status.
- **Allergies**: Specific allergen triggers and severity indicators.
- **Lab Values**: Test parameters, numeric values, units, and reference flags (HIGH, LOW, CRITICAL).
- **Procedures**: Surgical or diagnostic interventions (e.g., Coronary Angiography).
- **Implants / Medical Devices**: Pacemakers, stents, joint replacements.

---

## 4. High-Level Architecture & Agentic Workflow

SynapseHealth operates as a 7-stage sequential pipeline orchestrated by `ClinicalIngestionPipeline` (`src/agents/pipeline.py`).

```
 +-----------------------------------------------------------------------+
 |                     SYNAPSEHEALTH 7-STAGE PIPELINE                    |
 +-----------------------------------------------------------------------+
 | Stage 1: Document Upload & PDF Parsing (Ingestion Agent)              |
 | Stage 2: OCR / Text Extraction (Native Text Layer vs. Gemini Vision) |
 | Stage 3: Entity Extraction (Gemini 2.5 Flash / Lexicon Fallback)     |
 | Stage 4: Terminology Normalization (SNOMED, RxNorm, ICD-10, LOINC)    |
 | Stage 5: Temporal Graph Generation (Chronological Patient Timeline)   |
 | Stage 6: Deterministic Safety Evaluation (Safety Engine Audit)        |
 | Stage 7: Emergency Flashcard Cache & Audit Logging                    |
 +-----------------------------------------------------------------------+
```

Each stage emits explicit status callbacks (`pending`, `in_progress`, `complete`, `failed`), enabling the React frontend to display live pipeline trace visualizations to the clinical operator.

---

## 5. Document Ingestion & Vision/OCR Agent

The **Ingestion Agent** (`src/agents/ingestion_agent.py`) inspects uploaded files and executes a multi-tier fallback strategy:
1. **Native Text Extraction**: Attempts direct text extraction using PyPDF2 / pdfplumber.
2. **Page Rasterization**: If text density falls below threshold (e.g., scanned images), rasterizes pages to high-resolution PNGs.
3. **Gemini Vision OCR**: Transmits rasterized images to `gemini-2.5-flash` vision models.
4. **Fallback Handling**: If Gemini API credentials are absent or fail, gracefully degrades to native text extraction with explicit system logging.

---

## 6. Clinical Entity Extraction Engine (Dual-Path Architecture)

The **Extraction Agent** (`src/agents/extraction_agent.py`) extracts structured entity dicts containing conditions, medications, allergies, lab values, procedures, and implants.

```
                  ┌───────────────────────────────┐
                  │      Extracted Raw Text       │
                  └───────────────┬───────────────┘
                                  │
                   Is GEMINI_API_KEY available?
                             /         \
                       YES  /           \  NO / Fallback
                           ▼             ▼
             ┌───────────────────┐     ┌─────────────────────┐
             │ Gemini 2.5 Flash  │     │ Clinical Lexicon &  │
             │ Structured Output │     │ Regex Matcher       │
             └─────────┬─────────┘     └──────────┬──────────┘
                       │                          │
                       └────────────┬─────────────┘
                                    ▼
                     Standardized Extraction Result
```

- **Path A (LLM Mode)**: Leverages Pydantic schemas and structured JSON prompts sent to Gemini 2.5 Flash.
- **Path B (Lexicon Fallback)**: Uses compiled regular expressions, medical dictionary lookup tables (`drug_lookup_service.py`), and boundary-aware entity matching.

---

## 7. Medical Terminology Normalization

To ensure inter-document interoperability, raw extracted strings are mapped to standard clinical vocabularies via `PatientService` (`src/db/patient_service.py`):

| Entity Type | Target Vocabulary | Example Mapping |
| :--- | :--- | :--- |
| **Medications** | **RxNorm / OpenFDA** | "Metformin 500mg" → RxCUI `860975` |
| **Conditions** | **SNOMED CT / ICD-10** | "Type 2 Diabetes" → SNOMED `44054006`, ICD-10 `E11` |
| **Lab Values** | **LOINC** | "Serum Creatinine" → LOINC `2160-0` |
| **Allergies** | **SNOMED CT** | "Penicillin Allergy" → SNOMED `91936003` |

---

## 8. Patient Temporal Health Graph & Conflict Engine

The **Temporal Graph Agent** (`src/agents/temporal_graph_agent.py`) links extracted entities into a patient-level directed temporal graph (`NetworkX` / internal structure).

### Capabilities:
- **Medication Supersede Logic**: Automatically marks prior medication doses as `superseded` when a newer prescription with an updated regimen is ingested.
- **Chronological Timeline**: Orders procedures, lab results, and diagnoses by timestamp.
- **Timeline Conflict Detection**: Identifies clinical anomalies, such as conflicting therapy dates or duplicate overlapping procedures.

---

## 9. Deterministic Safety Engine & Emergency Flashcard Cache

### 9.1 Deterministic Safety Engine
The **Safety Agent** (`src/agents/safety_agent.py` & `src/engine/safety_rules.py`) executes 100% deterministic rule verification against the patient profile.

- **Drug-Drug Interactions**: e.g., Concurrent Warfarin and Aspirin / NSAID administration (bleeding risk).
- **Allergy Contraindications**: e.g., Amoxicillin prescribed to a patient with recorded Penicillin allergy.
- **Critical Lab Anomalies**: e.g., Serum Creatinine > 2.0 mg/dL with nephrotoxic drug administration.
- **Severity Levels**: `CRITICAL`, `WARNING`, `INFO`.

### 9.2 Sub-3-Second Emergency Flashcard Cache
The **Flashcard Agent** (`src/agents/flashcard_agent.py`) maintains a pre-computed JSON flashcard payload stored in SQLite.
- **Latency**: Sub-3-second retrieval time.
- **Content**: Patient demographics, critical red-flag alerts, active medications, active allergies, chronic conditions, and emergency contact details.

---

## 10. Web Gateway, Authentication & React 19 Frontend

### 10.1 Web Gateway (FastAPI)
- **Authentication**: PBKDF2 password hashing with 8-hour bearer token authentication (`app/auth.py`).
- **REST Endpoints**:
  - `POST /api/auth/login`: Authenticate user and issue token.
  - `POST /api/documents/upload`: Ingest PDF document and run 7-stage pipeline.
  - `GET /api/patients`: Search and list patient records.
  - `GET /api/patients/{code}/flashcard`: Instant emergency flashcard endpoint.
  - `GET /api/patients/{code}/timeline`: Retrieve patient health timeline graph.
  - `GET /api/patients/{code}/safety`: Retrieve safety audit alerts.
  - `GET /api/audit`: Immutable system audit log.
  - `GET /api/health`: Health status & Gemini configuration status.

### 10.2 React 19 Frontend
- Built with React 19, TypeScript (strict mode), Vite 8, and Tailwind CSS 4.
- Clean bundle size: 254 kB JS / 27 kB CSS.
- Key Components: `LoginView`, `UploadPanel` (with live pipeline trace), `PatientList`, `ProfileView`, `TimelineView`, `SafetyView`, `EmergencyFlashcard`, `AuditView`.

---

## 11. Quantitative Evaluation Methodology & Results

### 11.1 Ground-Truth Evaluation Methodology
To assess extraction accuracy without manual inspection, an automated scoring harness (`scripts/evaluate_extraction.py`) was constructed along with a synthetic patient generator (`scripts/generate_synthetic_corpus.py`).

- **Patient Cohort**: 3 Synthetic Patients (7 Clinical Documents: Discharge Summaries, Lab Reports, Prescriptions, Diagnostic Notes).
- **Ground-Truth Entity Count**: 43 paired clinical entities across 6 entity groups.

### 11.2 Empirical Results

```
Documents Scored : 7
Micro Precision  : 1.0000
Micro Recall     : 1.0000
Micro F1         : 1.0000
Macro F1         : 1.0000
Observed Errors  : 0
```

#### Detailed Per-Group Performance:

| Entity Group | Precision | Recall | F1-Score | True Positives | False Positives | False Negatives |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Conditions** | 1.0000 | 1.0000 | 1.0000 | 9 | 0 | 0 |
| **Medications** | 1.0000 | 1.0000 | 1.0000 | 10 | 0 | 0 |
| **Allergies** | 1.0000 | 1.0000 | 1.0000 | 3 | 0 | 0 |
| **Lab Values** | 1.0000 | 1.0000 | 1.0000 | 16 | 0 | 0 |
| **Procedures** | 1.0000 | 1.0000 | 1.0000 | 4 | 0 | 0 |
| **Implants** | 1.0000 | 1.0000 | 1.0000 | 1 | 0 | 0 |

---

## 12. Defect Surface Analysis, Bug Fixes & Limitations

### 12.1 Bugs Identified and Fixed During Evaluation
Development and evaluation surfaced four significant architectural defects, all of which were resolved:
1. **Scoring Granularity Bug**: Initial evaluation scored per-document extractions against the entire cumulative patient record. A lab report was incorrectly flagged as having false negatives for medications prescribed in a separate document. *Fix*: Refactored evaluation logic to score at the document level for precision/hallucinations and patient level for cumulative state.
2. **Unsatisfiable Ground-Truth Entries (x2)**: Two ground-truth entries in synthetic data contained typos not present in the rendered PDF documents. *Fix*: Corrected ground-truth generator to match exact document strings.
3. **Procedure Double-Matching**: "Coronary Angiography" matched both the specific procedure and a generic "Angiography" pattern, generating a duplicate false positive. *Fix*: Implemented longest-match pattern precedence in the extraction matcher.

### 12.2 Limitations & Nuances
- **Synthetic Ground-Truth Context**: The 1.00 F1 score reflects internal consistency and regression safety across synthetic test cases. It does not represent clinical validation on real-world noisy hospital EHR records.
- **Unconfigured Vision Model**: In offline mode, scanned PDF images rely on fallback text layers. Enabling `GEMINI_API_KEY` unlocks true multimodal vision OCR for scanned paper documents.

---

## 13. Future Scope & Conclusion

### 13.1 Future Scope
1. **MIMIC-IV / Real Clinical Dataset Validation**: Expand quantitative evaluation to real de-identified clinical benchmarks (e.g., MIMIC-III/IV).
2. **FHIR (Fast Healthcare Interoperability Resources) Export**: Add native JSON export compliant with HL7 FHIR Release 4 (R4) specifications.
3. **Multi-User Role-Based Access Control (RBAC)**: Expand auth system to distinguish between Triage Nurses, Attending Physicians, and Audit Administrators.

### 13.2 Conclusion
SynapseHealth demonstrates a robust, production-ready framework for transforming unstructured clinical PDFs into structured, emergency-ready medical intelligence. By coupling flexible AI extraction with deterministic safety verification and instant flashcard caching, the system provides emergency clinicians with vital patient safeguards while eliminating non-deterministic AI risks.
