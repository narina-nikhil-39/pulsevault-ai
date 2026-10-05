# SynapseHealth — AI-Powered Clinical Ingestion & Emergency Safety System

SynapseHealth is a multi-agent clinical ingestion pipeline and emergency safety system. It ingests unstructured clinical records (lab reports, discharge summaries, prescriptions, diagnostic notes), extracts structured medical entities, normalizes terms against standardized clinical vocabularies (SNOMED CT, RxNorm, ICD-10, LOINC), builds a patient temporal health graph, checks deterministic safety rules, and generates instant sub-3-second emergency flashcards.

---

## Key Features

- **7-Stage Clinical Pipeline**: Ingestion/OCR → Entity Extraction → Terminology Normalization → Temporal Knowledge Graph → Safety Rule Audit → Emergency Flashcard Generation → Database & Audit Trail.
- **Dual-Path Extraction Architecture**:
  - **Primary**: Vision & LLM-based extraction via Google Gemini API (`gemini-2.5-flash`).
  - **Deterministic Fallback**: Local clinical lexicon and regex parsing when API key is unconfigured or offline.
- **Deterministic Safety Engine**: Real-time audit for drug-drug interactions, contraindications, dosage violations, and lab threshold anomalies.
- **Emergency Flashcard Cache**: Instant retrieval of critical patient allergies, active medications, chronic conditions, and emergency contact details.
- **Full Audit Trail**: Immutable logging of all document ingestion steps and safety evaluations.
- **Modern Responsive Web UI**: React 19, TypeScript, Tailwind CSS, Vite, with real-time agent pipeline execution visualizer.

---

## Architecture Overview

```
                          ┌──────────────────────────┐
                          │   Uploaded Clinical PDF  │
                          └────────────┬─────────────┘
                                       │
                        ┌──────────────▼──────────────┐
                        │   1. Ingestion / OCR Agent   │
                        └──────────────┬──────────────┘
                                       │
                        ┌──────────────▼──────────────┐
                        │   2. Entity Extraction      │
                        │   (Gemini API / Lexicon)    │
                        └──────────────┬──────────────┘
                                       │
                        ┌──────────────▼──────────────┐
                        │ 3. Terminology Normalization│
                        │ (SNOMED / RxNorm / LOINC)   │
                        └──────────────┬──────────────┘
                                       │
                        ┌──────────────▼──────────────┐
                        │ 4. Temporal Graph Agent     │
                        └──────────────┬──────────────┘
                                       │
                        ┌──────────────▼──────────────┐
                        │ 5. Deterministic Safety Engine│
                        └──────────────┬──────────────┘
                                       │
                        ┌──────────────▼──────────────┐
                        │ 6. Flashcard Generation Cache│
                        └──────────────┬──────────────┘
                                       │
                        ┌──────────────▼──────────────┐
                        │  7. Audit Logging & Storage │
                        └─────────────────────────────┘
```

---

## Directory Structure

```
SYNAPSEHEALTH/
├── app/                        # FastAPI Web Gateway & Auth
│   ├── main.py                 # API routes & endpoint controllers
│   ├── auth.py                 # PBKDF2 authentication & Bearer tokens
│   └── schemas.py              # Pydantic request/response schemas
├── src/                        # Core Python Business Logic & Agents
│   ├── agents/                 # Pipeline agents (ingestion, extraction, graph, safety, flashcard)
│   ├── db/                     # SQLite database, SQLAlchemy models & services
│   ├── engine/                 # Deterministic safety rules & audit logger
│   └── services/               # Clinical lookup services (RxNav, OpenFDA, OCR, Vision)
├── frontend/                   # React 19 UI
│   ├── src/                    # TypeScript components, state, views
│   ├── package.json            # Node dependencies
│   └── vite.config.ts          # Vite build configuration
├── scripts/                    # Evaluation & synthetic corpus generators
│   ├── evaluate_extraction.py  # Precision / Recall / F1 evaluation script
│   └── generate_synthetic_corpus.py # Ground-truth patient PDF generator
├── tests/                      # Pytest suite (55 tests)
├── .env.example                # Environment variables template
├── requirements.txt            # Python dependencies
└── pytest.ini                  # Pytest configuration
```

---

## Prerequisites

- **Python**: 3.10+
- **Node.js**: 18+ & `npm`
- **Optional**: Gemini API Key (for LLM extraction mode)

---

## Quick Start Guide

### 1. Backend Environment Setup

```bash
# Clone the repository and navigate to root
cd SYNAPSEHEALTH

# Create and activate a Python virtual environment
python -m venv venv
# On Windows:
venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

To enable Gemini LLM extraction, set your API key in `.env`:
```env
GEMINI_API_KEY=your-actual-gemini-api-key
GEMINI_MODEL=gemini-2.5-flash
```
*Note: If `GEMINI_API_KEY` is not provided, the system automatically runs in deterministic lexicon fallback mode.*

### 3. Generate Synthetic Corpus & Database Setup

```bash
# Set PYTHONPATH to project root
export PYTHONPATH=.   # Linux/macOS
$env:PYTHONPATH="."    # Windows PowerShell

# Generate synthetic patients and ground-truth PDF records
python scripts/generate_synthetic_corpus.py
```

### 4. Run the Backend API Server

```bash
python app/main.py
# Server will start on http://127.0.0.1:8000
```
API Documentation (Swagger UI): `http://127.0.0.1:8000/docs`

### 5. Frontend Setup & Launch

```bash
cd frontend

# Install Node dependencies
npm install

# Start Vite development server
npm run dev
# App will run on http://localhost:5173
```

---

## Running Tests & Evaluation

### Run Test Suite (55 Passing Tests)

```bash
pytest
```

### Run Synthetic Corpus Evaluation

```bash
# Windows PowerShell:
$env:PYTHONPATH="." ; python scripts/evaluate_extraction.py

# Linux/macOS:
PYTHONPATH=. python scripts/evaluate_extraction.py
```

---

## Verification & Metric Results

| Metric | Value | Notes |
| :--- | :---: | :--- |
| **Pytest Suite** | **55 / 55 Passed** | Auth, API endpoints, pipeline stages, safety rules, evaluation harness |
| **Documents Scored** | **7 Documents** | Synthetic patient cohort (SH-1024, SH-2048, SH-3072) |
| **Micro Precision / Recall / F1** | **0.9130 / 0.9767 / 0.9438** | Attribute-level evaluation (name, dose/value, unit verification) |
| **Macro F1** | **0.9638** | Scored across all 6 clinical entity categories |
| **Medication F1** | **0.7826** | Surfaced dosage extraction mismatches (e.g. unparsed vs parsed dose) |
| **Frontend Build** | **Clean Build** | `tsc --noEmit` pass; 254 kB JS / 27 kB CSS production bundle |

---

## License

Academic / Project Evaluation License — SynapseHealth Team.
