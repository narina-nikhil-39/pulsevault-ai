"""
SynapseHealth — Agent 2: Clinical Entity Extraction & Normalization
Converts document text into structured clinical JSON. Two backends are supported:

1. Gemini (preferred). Reads the page image and text layer together, returning the
   strict extraction contract defined in ``vision_service``.
2. Deterministic lexicon extraction (fallback). A curated clinical vocabulary with
   dose, frequency, date, and severity parsing. This keeps the pipeline reproducible
   and demonstrable with no API key and no network, at the cost of recall on
   free-text phrasings the lexicon does not cover.

Every entity carries the exact source sentence it came from, so the dashboard can
anchor each fact back to the originating document page.
"""

import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from src.services.vision_service import VisionService, VisionServiceError

# ---------------------------------------------------------------------------
# Curated clinical vocabulary for the offline fallback
# ---------------------------------------------------------------------------
_CONDITION_LEXICON: Tuple[Tuple[str, str, bool], ...] = (
    (r"\btype\s*1\s*diabet|\btd1\b|\bt1d\b|\binsulin-dependent\s*diabet", "Type 1 Diabetes Mellitus", True),
    (r"\btype\s*2\s*diabet|\btd2\b|\bt2d\b|\bnon-insulin-dependent\s*diabet|\bdiabet\w*\s*mellitus|\bdiabetes\b", "Type 2 Diabetes Mellitus", True),
    (r"\bessential\s*hypertension|\bhypertension\b|\bbp\s*(?:high|raised|elevated)", "Essential Hypertension", True),
    (r"\bcoronary\s*artery\s*disease|\bcad\b|\bischaemic\s*heart\s*disease", "Coronary Artery Disease", True),
    (r"\bmyocardial\s*infarction|\bheart\s*attack\b", "Myocardial Infarction", True),
    (r"\batrial\s*fibrillation\b|\bafib\b", "Atrial Fibrillation", True),
    (r"\bchronic\s*kidney\s*disease\b|\bckd\b|\brenal\s*impairment\b", "Chronic Kidney Disease", True),
    (r"\basthma\b", "Asthma", True),
    (r"\bchronic\s*obstructive\s*pulmonary\s*disease\b|\bcopd\b", "Chronic Obstructive Pulmonary Disease", True),
    (r"\bhypothyroid\w*\b", "Hypothyroidism", True),
    (r"\bhyperthyroid\w*\b", "Hyperthyroidism", True),
    (r"\bhyperlipid\w*|\bhigh\s*cholesterol\b|\bdyslipid\w*", "Dyslipidemia", True),
    (r"\biron\s*deficiency\s*an[a]?emia\b", "Iron Deficiency Anaemia", False),
    (r"\ban[a]?emia\b|\blow\s*haemoglobin\b|\blow\s*hemoglobin\b", "Anaemia", True),
    (r"\bpeptic\s*ulcer\b|\bpeptic\s*ulcer\s*disease\b", "Peptic Ulcer Disease", True),
    (r"\bgastritis\b", "Gastritis", False),
    (r"\bheart\s*failure\b|\bcongestive\s*cardiac\s*failure\b", "Heart Failure", True),
    (r"\bepilep\w+\b|\bseizure\w*\b", "Epilepsy", True),
    (r"\btuberculosis\b|\btb\b", "Tuberculosis", False),
    (r"\bsepsis\b|\bseptic\b", "Sepsis", False),
    (r"\bstroke\b|\bcerebrovascular\s*accident\b|\bcva\b", "Stroke", True),
    (r"\bosteoarthritis\b|\bknee\s*osteoarthritis\b", "Osteoarthritis", True),
    (r"\bdepression\b", "Depression", True),
    (r"\bmigraine\w*\b", "Migraine", True),
    (r"\bpregnan\w+\b", "Pregnancy", False),
    (r"\bthyroid\s*disorder\b|\bthyroid\s*disease\b", "Thyroid Disorder", True),
    (r"\bliver\s*disease\b|\bhepatic\s*impairment\b", "Liver Disease", True),
)

_DRUG_LEXICON: Tuple[Tuple[str, str], ...] = (
    (r"\bmetformin\b", "Metformin"),
    (r"\baspirin\b|\bacetylsalicylic\s*acid\b", "Aspirin"),
    (r"\batorvastatin\b", "Atorvastatin"),
    (r"\bsimvastatin\b", "Simvastatin"),
    (r"\brosuvastatin\b", "Rosuvastatin"),
    (r"\bpitavastatin\b", "Pitavastatin"),
    (r"\bamlodipine\b", "Amlodipine"),
    (r"\bdiltiazem\b", "Diltiazem"),
    (r"\blosartan\b", "Losartan"),
    (r"\bvalsartan\b", "Valsartan"),
    (r"\btelmisartan\b", "Telmisartan"),
    (r"\blisinopril\b", "Lisinopril"),
    (r"\benalapril\b", "Enalapril"),
    (r"\bramipril\b", "Ramipril"),
    (r"\bclopidogrel\b", "Clopidogrel"),
    (r"\bwarfarin\b", "Warfarin"),
    (r"\bmetoprolol\b", "Metoprolol"),
    (r"\batenolol\b", "Atenolol"),
    (r"\bisosorbide\b", "Isosorbide Mononitrate"),
    (r"\btramadol\b", "Tramadol"),
    (r"\bparacetamol\b|\bacetaminophen\b", "Paracetamol"),
    (r"\bibuprofen\b", "Ibuprofen"),
    (r"\baceclofenac\b", "Aceclofenac"),
    (r"\bdiclofenac\b", "Diclofenac"),
    (r"\bamoxicillin\b", "Amoxicillin"),
    (r"\bpenicillin\b", "Penicillin"),
    (r"\bciprofloxacin\b", "Ciprofloxacin"),
    (r"\bazithromycin\b", "Azithromycin"),
    (r"\bclarithromycin\b", "Clarithromycin"),
    (r"\bmetronidazole\b", "Metronidazole"),
    (r"\bomeprazole\b", "Omprazole"),
    (r"\bpantoprazole\b", "Pantoprazole"),
    (r"\blevothyroxine\b", "Levothyroxine"),
    (r"\binsulin\b", "Insulin"),
    (r"\bglibenclamide\b", "Glibenclamide"),
    (r"\bsalbutamol\b", "Salbutamol"),
    (r"\bprednisolone\b", "Prednisolone"),
    (r"\bmontelukast\b", "Montelukast"),
    (r"\bsertraline\b", "Sertraline"),
    (r"\bescitalopram\b", "Escitalopram"),
    (r"\bgabapentin\b", "Gabapentin"),
    # A bare "iron" is deliberately not matched: it appears in the diagnosis
    # "Iron Deficiency Anaemia" and in "Serum Iron", neither of which is a prescription.
    # Matching it here turned a condition into an active ferrous sulphate order.
    (
        r"\bferrous\s*(?:sulphate|sulfate|fumarate)\b"
        r"|\biron\s+(?:tablets?|supplements?|salts?|folate)\b",
        "Ferrous Sulphate",
    ),
    (r"\bcalcium\s*(?:carbonate|d\W?3)\b", "Calcium Carbonate"),
    (r"\bpotassium\s*(?:chloride|chlor)\b", "Potassium Chloride"),
    (r"\bhydrochlorothiazide\b", "Hydrochlorothiazide"),
    (r"\bfurosemide\b", "Furosemide"),
    (r"\bspironolactone\b", "Spironolactone"),
    (r"\bsalbutamol\s*inhaler\b", "Salbutamol Inhaler"),
)

_ALLERGEN_LEXICON: Tuple[Tuple[str, str], ...] = (
    (r"\bpenicillin\b", "Penicillin"),
    (r"\baspirin\b", "Aspirin"),
    (r"\bibuprofen\b|\bnsaid\w*\b", "Ibuprofen"),
    (r"\bcephalosporin\w*\b", "Cephalosporin"),
    (r"\bsulfa\b|\bsulphonamide\w*\b|\bsulfonamide\w*\b", "Sulfonamide"),
    (r"\bshellfish\b|\bseafood\b", "Shellfish"),
    (r"\bnuts?\b|\bpeanut\w*\b", "Nuts"),
    (r"\blatex\b|\brubber\b", "Latex"),
    (r"\biodine\b|\bcontrast\s*(?:media|dye|agent)\b|\biodinated\s*contrast\b", "Iodine Contrast"),
    (r"\bcodeine\b", "Codeine"),
)

_LAB_LEXICON: Tuple[Tuple[str, str], ...] = (
    (r"\bha?emoglobin\b|\bhgb\b", "Hemoglobin"),
    (r"\bhba1c\b|\bglycated\s*haemoglobin\b", "HbA1c"),
    (r"\bfasting\s*(?:blood\s*)?glucose\b|\bfbs\b", "Fasting Blood Glucose"),
    (r"\bblood\s*glucose\b|\brandom\s*glucose\b", "Blood Glucose"),
    (r"\bcreatinine\b", "Serum Creatinine"),
    (r"\burea\b|\bbun\b", "Blood Urea Nitrogen"),
(r"\bldl\b|\bldl\s*cholesterol\b", "LDL Cholesterol"),
    (r"\bhdl\b|\bhdl\s*cholesterol\b", "HDL Cholesterol"),
    (r"\btotal\s*cholesterol\b", "Total Cholesterol"),
    (r"(?<!ldl\s)(?<!hdl\s)(?<!tg\s)\bcholesterol\b", "Total Cholesterol"),
    (r"\btriglycerid\w*\b|\btg\b", "Triglycerides"),
    (r"\bsystolic\b|\bsbp\b", "Systolic Blood Pressure"),
    (r"\bdiastolic\b|\bdbp\b", "Diastolic Blood Pressure"),
    (r"\bheart\s*rate\b|\bpulse\b", "Heart Rate"),
    (r"\bplatelet\w*\b", "Platelet Count"),
    (r"\bwbc\b|\bwhite\s*blood\s*cell\w*\b", "White Blood Cell Count"),
    (r"\brbc\b|\bred\s*blood\s*cell\w*\b", "Red Blood Cell Count"),
    (r"\bserum\s*potassium\b|\bpotassium\b", "Serum Potassium"),
    (r"\bserum\s*sodium\b|\bsodium\b", "Serum Sodium"),
    (r"\btsh\b|\bthyroid\s*stimulating\s*hormone\b", "TSH"),
    (r"\bsgpt\b|\balt\b", "SGPT"),
    (r"\binr\b", "INR"),
    (r"\bfgfr\b|\bestimated\s*gfr\b|\begfr\b", "eGFR"),
    (r"\bferritin\b|\bserum\s*iron\b", "Ferritin"),
    (r"\btotal\s*bilirubin\b|\bbilirubin\b", "Total Bilirubin"),
    (r"\besr\b|\berythrocyte\s*sedimentation\b", "ESR"),
    (r"\bcrp\b|\bc[- ]reactive\s*protein\b", "CRP"),
    (r"\bvitamin\s*(?:d3|d|b12|b\s?12)\b", "Vitamin Marker"),
)

_PROCEDURE_LEXICON: Tuple[Tuple[str, str], ...] = (
    (r"\bcoronary\s*artery\s*bypass\s*graft\w*\b|\bcabg\b", "Coronary Artery Bypass Graft"),
    (r"\bcoronary\s*angiograph\w*\b", "Coronary Angiography"),
    (r"\bangiograph\w*\b", "Angiography"),
    (r"\bpercutaneous\s*coronary\s*intervention\b|\bpci\b|\bstenting\b|\bangioplasty\b", "Percutaneous Coronary Intervention"),
    (r"\bappendectomy\b", "Appendectomy"),
    (r"\bcholecystectomy\b", "Cholecystectomy"),
    (r"\bknee\s*replacement\b|\btotal\s*knee\s*arthroplasty\b", "Total Knee Replacement"),
    (r"\bcataract\s*(?:surgery|extraction)\b", "Cataract Surgery"),
    (r"\bcaesarean\s*section\b|\bcesarean\s*section\b", "Caesarean Section"),
    (r"\bcardiac\s*stent\b|\bstent\b", "Cardiac Stent"),
    (r"\bpacemaker\b(?!\s*implant)", "Pacemaker"),
    (r"\bhernia\s*repair\b", "Hernia Repair"),
    (r"\bhaemodialysis\b|\bhemodialysis\b|\bdialysis\b", "Haemodialysis"),
    (r"\bechocardiograph\w*\b|\becho\b", "Echocardiography"),
    (r"\bcolonoscopy\b", "Colonoscopy"),
    (r"\bendoscopy\b|\bupper\s*gi\s*endoscopy\b", "Endoscopy"),
    (r"\bbone\s*marrow\s*(?:biopsy|aspirate)\b", "Bone Marrow Biopsy"),
    (r"\blaparoscop\w*\b", "Laparoscopic Procedure"),
)

# Implants are matched separately from procedures because an implanted device must reach
# the emergency flashcard even when the same document also records the implantation event.
_IMPLANT_LEXICON: Tuple[Tuple[str, str], ...] = (
    (r"\bpermanent\s*pacemaker\b|\bpacemaker\s*(?:implant\w*|insert\w*|in\s*situ)\b", "Permanent Pacemaker"),
    (r"\bdefibrillator\b|\bicd\b|\b implantable\s*cardioverter", "Implantable Cardioverter Defibrillator"),
    (r"\bstent\b|\bangioplasty\s*stent\b", "Cardiac Stent"),
    (r"\bprosthetic\s*(?:valve|hip|knee)\b|\bmechanical\s*valve\b", "Prosthetic Valve"),
    (r"\bhip\s*replacement\b|\btotal\s*hip\s*arthroplasty\b", "Hip Replacement"),
    (r"\btotal\s*knee\s*arthroplasty\b", "Knee Replacement"),
    (r"\bcochlear\s*implant\b", "Cochlear Implant"),
    (r"\bcentral\s*(?:venous\s*)?(?:line|catheter)\b|\bcvc\b", "Central Venous Catheter"),
    (r"\bventriculo[\s-]*peritoneal\s*shunt\b|\bvp\s*shunt\b", "Ventriculoperitoneal Shunt"),
)

_BLOOD_GROUP = re.compile(
    r"blood\s*group\s*(?:is)?\s*[:\-]?\s*(O|A|B|AB)\s*([+-])", re.IGNORECASE
)
_AGE = re.compile(r"\b(?:age|aged)\s*[:\-]?\s*(\d{1,3})\s*(?:years?|yrs?|/yr)?\b", re.IGNORECASE)
# Many Indian and hospital headers combine the two fields, e.g. "Age / Sex: 64 / F".
_AGE_SEX = re.compile(
    r"\bage\s*[/|]\s*sex\s*[:\-]?\s*(\d{1,3})\s*(?:years?|yrs?)?\s*"
    r"(?:y\s*)?[/|]\s*(male|female|other|m|f)\b",
    re.IGNORECASE,
)
_SEX = re.compile(r"\b(sex|gender)\s*[:\-]?\s*(male|female|other|m|f)\b", re.IGNORECASE)
_NAME = re.compile(
    r"\b(?:patient\s*name|name|mr|mrs|ms)\s*(?::\s*|\-\s*|\s+)(.+)$",
    re.IGNORECASE | re.MULTILINE,
)
# A patient name ends where the next header field begins, since hospital headers pack
# name, age, sex, and blood group onto one line.
_NAME_TERMINATORS = re.compile(
    r"\b(age|aged|sex|gender|blood|weight|height|ward|uid|aadhaar|aadhar|contact|mobile|"
    r"date|dob|date\s+of\s+birth|address|diagnosis|opd|ipd)\b",
    re.IGNORECASE,
)
_NAME_VALID = re.compile(r"^[A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*){1,3}$")

_DOSE = re.compile(
    r"(\d+(?:\.\d+)?)\s*"
    r"(mg/dL|g/dL|ng/mL|pg/mL|mEq/L|mmol/L|mg|mcg|\u00b5g|ml|iu|units|k/uL|u/L|%|g)"
    r"(?![A-Za-z])",
    re.IGNORECASE,
)
# Lab rows may legitimately carry no unit (INR, ratios, scores), so the unit is optional
# here, and cell counts are expressed with per-volume suffixes that dosing never uses.
_LAB_VALUE = re.compile(
    r"(\d+(?:\.\d+)?)\s*"
    r"("
    r"mg/dL|g/dL|ng/mL|pg/mL|mEq/L|mmol/L|mg/dl|mg/mL"
    r"|mcg|\u00b5g|\u03bcg|ng|pg|ng/L|ug"
    r"|mL/min/1\.73m2|mL/min/1\.73sqm|l/min/1\.73m2"
    r"|/cumm|cumm|cells/cumm|cells/\u00b5L|cells/uL|10\^3/cumm|10\^9/L"
    r"|fL|pg/mL|mEq|mmol|mmHg|bpm|sec|seconds|ratio|g/mL|kg/m2|m2|%"
    r"|mg|mL|L|g|IU|U/L|k/uL|units|ml"
    r")?"
    r"(?![A-Za-z])",
    re.IGNORECASE,
)
_FREQUENCY = re.compile(
    r"\b(?P<count>once|twice|thrice)\s+(?:a\s+)?(?:day|daily)\b"
    r"|\b(?P<adhoc>once\s+only|once\s+weekly|twice\s+weekly|every\s+\d+\s+hours"
    r"|at\s+bedtime|as\s+needed|sos|prn)\b"
    # A dosing schedule looks like "0-1-0". Each part is at most two digits and the whole
    # token is word-anchored, so an ISO date such as "2024-02-20" can never match:
    # every offset inside a four-digit year lacks a preceding word boundary.
    r"|\b(?P<schedule>\d{1,2}-\d{1,2}-\d{1,2})\b(?!\s*-\s*\d)",
    re.IGNORECASE,
)
_SEVERITY = re.compile(r"\b(mild|moderate|severe|anaphylaxis|life[- ]threatening)\b", re.IGNORECASE)
_REACTION = re.compile(
    r"\b(rash|urticaria|anaphylaxis|angioedema|swelling|breathlessness|dyspnoea|"
    r"shock|nausea|itching|blister\w*)\b",
    re.IGNORECASE,
)
_YEAR = re.compile(r"\b(19|20)\d{2}\b")
_ISO_DATE = re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b")
_DMY_DATE = re.compile(r"\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b")

_ALLERGY_HEADER = re.compile(
    r"(?:known\s+)?allerg(?:y|ies)\s*[:\-]?\s*(?:to\s+)?([^\n]{2,120})", re.IGNORECASE
)
_ALLERGIC_TO = re.compile(
    r"allerg(?:ic|ies)\s+(?:to|of)\s+([^\n.;]{2,80})", re.IGNORECASE
)
_STOP_PATTERN = re.compile(
    r"\b(stopped|stop|discontinued|ceased|dc'd|dc\b|no longer taking)\b",
    re.IGNORECASE,
)
_ALLERGY_CONTEXT = re.compile(
    r"\ballerg\w*|\bhypersensitiv\w*|\badverse\s+(?:drug\s+)?reaction\b|\bintoleran\w*\b",
    re.IGNORECASE,
)
_NEGATION_PREFIX = re.compile(
    r"\b(denies?|negative\s+for|no\s+history\s+of|nil|not\s+allergic)\b", re.IGNORECASE
)


@dataclass
class ExtractionResult:
    """Entities pulled from one document plus how they were obtained."""

    payload: Dict[str, Any]
    method: str
    page_number: int = 1
    warnings: List[str] = field(default_factory=list)

    @property
    def entity_count(self) -> int:
        return sum(
            len(self.payload.get(key) or [])
            for key in (
                "conditions",
                "medications",
                "allergies",
                "lab_values",
                "procedures",
                "implants",
            )
        )

    def as_dict(self) -> Dict[str, Any]:
        return {
            "method": self.method,
            "page_number": self.page_number,
            "entity_count": self.entity_count,
            "warnings": self.warnings,
        }


class ExtractionAgent:
    """Extracts structured clinical entities from document text, via Gemini or the lexicon."""

    def __init__(self, vision_service: Optional[VisionService] = None):
        self.vision_service = vision_service or VisionService()

    def extract(
        self,
        text: str,
        image_bytes: Optional[bytes] = None,
        page_number: int = 1,
        document_type: str = "unknown",
        prefer_llm: bool = True,
    ) -> ExtractionResult:
        """Extract clinical entities, preferring Gemini and falling back to the lexicon."""
        body = (text or "").strip()

        if prefer_llm and self.vision_service.is_configured and (body or image_bytes):
            try:
                payload = self.vision_service.extract_clinical_entities(
                    image_bytes=image_bytes,
                    text=body,
                    page_number=page_number,
                )
                payload["document_type"] = document_type or payload.get("document_type", "unknown")
                return ExtractionResult(payload=payload, method="gemini", page_number=page_number)
            except VisionServiceError as exc:
                fallback = ExtractionResult(
                    payload=self._lexicon_extract(body),
                    method="lexicon",
                    page_number=page_number,
                    warnings=[f"Gemini extraction failed, fell back to lexicon: {exc}"],
                )
                return fallback

        payload = self._lexicon_extract(body)
        payload["document_type"] = document_type

        warnings = []
        if prefer_llm and not self.vision_service.is_configured and body:
            warnings.append(
                "GEMINI_API_KEY not configured; extraction used the deterministic lexicon, "
                "which has lower recall on free-text phrasings."
            )

        return ExtractionResult(
            payload=payload,
            method="lexicon",
            page_number=page_number,
            warnings=warnings,
        )

    # -----------------------------------------------------------------------
    # Deterministic lexicon extraction
    # -----------------------------------------------------------------------
    def _lexicon_extract(self, text: str) -> Dict[str, Any]:
        """Extract entities using the curated clinical vocabulary."""
        if not text:
            return _empty_payload()

        sentences = _split_sentences(text)
        negated = [sentence for sentence in sentences if _NEGATION_PREFIX.search(sentence)]

        return {
            "document_type": "unknown",
            "patient_demographics": _extract_demographics(text),
            "conditions": _extract_conditions(sentences),
            "medications": _extract_medications(sentences),
            "allergies": _extract_allergies(sentences, negated),
            "lab_values": _extract_labs(sentences),
            "procedures": _extract_procedures(sentences),
            "implants": _extract_implants(sentences),
            "follow_up": _extract_follow_up(text),
            "page_number": 1,
            "extraction_confidence": 0.72,
        }

    def merge(self, results: List[ExtractionResult]) -> Dict[str, Any]:
        """Merge per-page extraction payloads into one document-level payload."""
        merged = _empty_payload()
        confidences: List[float] = []

        for result in results:
            confidences.append(float(result.payload.get("extraction_confidence") or 0.0))
            for key in ("conditions", "medications", "allergies", "lab_values", "procedures", "implants"):
                merged[key].extend(result.payload.get(key) or [])

            demographics = result.payload.get("patient_demographics") or {}
            for field_name in ("age", "sex", "blood_group", "name"):
                if demographics.get(field_name) not in (None, ""):
                    merged["patient_demographics"][field_name] = demographics[field_name]

            document_type = result.payload.get("document_type")
            if document_type and document_type != "unknown":
                merged["document_type"] = document_type

            follow_up = result.payload.get("follow_up") or {}
            if follow_up.get("instructions"):
                merged["follow_up"]["instructions"] = follow_up["instructions"]
            if follow_up.get("date"):
                merged["follow_up"]["date"] = follow_up["date"]

        merged["allergies"] = _dedupe(merged["allergies"], "substance")
        merged["implants"] = _dedupe(merged["implants"], "name")
        merged["conditions"] = _dedupe(merged["conditions"], "name")
        merged["procedures"] = _dedupe(merged["procedures"], "name")
        merged["medications"] = _dedupe(merged["medications"], "name")
        merged["lab_values"] = _dedupe(merged["lab_values"], "test_name")
        merged["extraction_confidence"] = (
            round(sum(confidences) / len(confidences), 2) if confidences else 0.0
        )

        return merged


def _empty_payload() -> Dict[str, Any]:
    """Return the extraction contract with every key present and empty."""
    return {
        "document_type": "unknown",
        "patient_demographics": {"age": None, "sex": None, "blood_group": None, "name": None},
        "conditions": [],
        "medications": [],
        "allergies": [],
        "lab_values": [],
        "procedures": [],
        "implants": [],
        "follow_up": {"date": None, "instructions": None},
        "page_number": 1,
        "extraction_confidence": 0.0,
    }


def _split_sentences(text: str) -> List[str]:
    """Split document text into clinical statement units.

    Line breaks are preserved as hard boundaries because tabular lab reports put one
    measurement per line; collapsing whitespace would fuse the whole table into a
    single unit and only the first match would ever be extracted. Only separators that
    unambiguously end a clinical statement (semicolon and pipe) split further, since a
    period is unreliable in text containing decimals, abbreviations, and list numbering.
    """
    units: List[str] = []

    for line in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        stripped = line.strip()
        if not stripped:
            continue
        for part in re.split(r"\s*[|;]\s*", stripped):
            cleaned = part.strip(" .,:")
            if cleaned:
                units.append(cleaned)

    return units


def _extract_demographics(text: str) -> Dict[str, Any]:
    """Pull age, sex, blood group, and patient name from the document header."""
    demographics: Dict[str, Any] = {"age": None, "sex": None, "blood_group": None, "name": None}

    blood_group = _BLOOD_GROUP.search(text)
    if blood_group:
        demographics["blood_group"] = f"{blood_group.group(1).upper()}{blood_group.group(2)}"

    age = _AGE.search(text)
    if age and int(age.group(1)) <= 120:
        demographics["age"] = int(age.group(1))

    sex = _SEX.search(text)
    if sex:
        raw = sex.group(2).lower()
        demographics["sex"] = {"m": "male", "f": "female"}.get(raw, raw)

    combined = _AGE_SEX.search(text)
    if combined:
        if demographics["age"] is None and int(combined.group(1)) <= 120:
            demographics["age"] = int(combined.group(1))
        if demographics["sex"] is None:
            raw = combined.group(2).lower()
            demographics["sex"] = {"m": "male", "f": "female"}.get(raw, raw)

    name = _NAME.search(text)
    if name:
        terminator = _NAME_TERMINATORS.search(name.group(1))
        candidate = (name.group(1)[: terminator.start()] if terminator else name.group(1)).strip(" .,:")
        candidate = " ".join(candidate.split())
        if _NAME_VALID.match(candidate) and candidate.lower() not in ("patient name", "unknown"):
            demographics["name"] = candidate.title()

    return demographics


def _extract_conditions(sentences: List[str]) -> List[Dict[str, Any]]:
    """Match sentences against the condition lexicon.

    The first sentence naming a condition wins, but a later sentence carrying an onset
    date upgrades that entry, because a chief-complaint line usually names the condition
    without dating it while the history section supplies the year.

    A sentence reporting resolution contributes its date as ``resolved_date`` and never as
    ``onset_date``, so "Anaemia - resolved on 2024-02-20" is not misread as an onset.
    """
    found: Dict[str, Dict[str, Any]] = {}

    for sentence in sentences:
        matched_here: List[str] = []

        for pattern, canonical, chronic in _CONDITION_LEXICON:
            if not re.search(pattern, sentence, re.IGNORECASE):
                continue

            # The lexicon is ordered most-specific first, so a broader term that is a
            # substring of one already claimed by this sentence is skipped. Without this,
            # "Iron Deficiency Anaemia" would also be recorded as plain "Anaemia".
            if any(canonical != claimed and canonical in claimed for claimed in matched_here):
                continue
            matched_here.append(canonical)
            is_resolution = bool(
                re.search(r"\bresolved\b|\brecovered\b|\bin remission\b", sentence, re.IGNORECASE)
            )
            stated_date = _find_date(sentence)
            onset = None if is_resolution else stated_date
            resolved_date = stated_date if is_resolution else None

            if canonical in found:
                existing = found[canonical]
                if existing.get("onset_date") is None and onset:
                    existing["onset_date"] = onset
                if is_resolution:
                    existing["status"] = "resolved"
                    if existing.get("resolved_date") is None:
                        existing["resolved_date"] = resolved_date
                continue

            found[canonical] = {
                "name": canonical,
                "status": "resolved" if is_resolution else "active",
                "is_chronic": chronic,
                "onset_date": onset,
                "resolved_date": resolved_date,
                "evidence_sentence": sentence[:400],
            }

    return list(found.values())


def _extract_medications(sentences: List[str]) -> List[Dict[str, Any]]:
    """Match sentences against the drug lexicon and parse dose, frequency, and dates.

    Sentences describing an allergy are skipped, otherwise a documented allergen such
    as "Penicillin" recorded under an allergy heading would also be persisted as an
    active prescription.
    """
    found: Dict[str, Dict[str, Any]] = {}

    for sentence in sentences:
        if _ALLERGY_CONTEXT.search(sentence):
            continue

        for pattern, canonical in _DRUG_LEXICON:
            if not re.search(pattern, sentence, re.IGNORECASE):
                continue
            if canonical in found:
                continue

            dose, dose_unit = _parse_dose(sentence)
            frequency = _parse_frequency(sentence)
            stopped = bool(_STOP_PATTERN.search(sentence))

            found[canonical] = {
                "name": canonical,
                "dose": dose,
                "dose_unit": dose_unit,
                "frequency": frequency,
                "route": "oral" if re.search(r"\boral\b|\btab\b|\bcap\b|\bwith food\b|\bafter food\b", sentence, re.IGNORECASE) else None,
                "status": "stopped" if stopped else "active",
                "start_date": _find_date(sentence),
                "end_date": None,
                "evidence_sentence": sentence[:400],
            }

    return list(found.values())


def _extract_allergies(sentences: List[str], negated: List[str]) -> List[Dict[str, Any]]:
    """Extract allergies from allergy-context statements only.

    A substance is only recorded as an allergen when the statement is in an allergy
    context. Scanning every sentence for a known allergen would wrongly promote an
    ordinary prescription such as "Aspirin 75 mg once daily" into an allergy record.
    """
    found: Dict[str, Dict[str, Any]] = {}

    for sentence in sentences:
        header_match = _ALLERGY_HEADER.search(sentence) or _ALLERGIC_TO.search(sentence)
        if not header_match and not _ALLERGY_CONTEXT.search(sentence):
            continue

        segment = header_match.group(1) if header_match else sentence

        for pattern, canonical in _ALLERGEN_LEXICON:
            if not re.search(pattern, segment, re.IGNORECASE):
                continue
            if canonical in found:
                continue

            if any(
                re.search(pattern, clause, re.IGNORECASE) for clause in negated
            ):
                continue

            severity_match = _SEVERITY.search(sentence)
            severity_raw = severity_match.group(1).lower() if severity_match else "unknown"
            if "anaphyla" in severity_raw or "life" in severity_raw:
                severity = "severe"
            elif severity_raw in ("mild", "moderate", "severe"):
                severity = severity_raw
            else:
                severity = "unknown"

            reaction_match = _REACTION.search(sentence)

            found[canonical] = {
                "substance": canonical,
                "reaction": reaction_match.group(1).title() if reaction_match else None,
                "severity": severity,
                "evidence_sentence": sentence[:400],
            }

    return list(found.values())


def _extract_labs(sentences: List[str]) -> List[Dict[str, Any]]:
    """Parse lab and vital-sign values from tabular or inline report text.

    The value is read from the position immediately after the matched test name so that
    a trailing reference range is never mistaken for the result.
    """
    found: List[Dict[str, Any]] = []

    for sentence in sentences:
        for pattern, canonical in _LAB_LEXICON:
            name_match = re.search(pattern, sentence, re.IGNORECASE)
            if not name_match:
                continue

            value, unit = _parse_lab_value(sentence, name_match.end())
            if value is None:
                continue

            found.append(
                {
                    "test_name": canonical,
                    "value": value,
                    "value_text": f"{value:g} {unit}".strip() if unit else f"{value:g}",
                    "unit": unit,
                    "collected_date": _find_date(sentence),
                    "evidence_sentence": sentence[:400],
                }
            )
            break

    return found


def _extract_procedures(sentences: List[str]) -> List[Dict[str, Any]]:
    """Match sentences against the procedure lexicon.

    As with conditions, the lexicon is ordered most-specific first and a broader term that
    is a substring of one already claimed by the same sentence is skipped, so "Coronary
    Angiography" is not also recorded as a generic "Angiography".
    """
    found: Dict[str, Dict[str, Any]] = {}

    for sentence in sentences:
        matched_here: List[str] = []

        for pattern, canonical in _PROCEDURE_LEXICON:
            if not re.search(pattern, sentence, re.IGNORECASE):
                continue
            if any(canonical != claimed and canonical in claimed for claimed in matched_here):
                continue
            matched_here.append(canonical)

            if canonical in found:
                continue
            found[canonical] = {
                "name": canonical,
                "performed_date": _find_date(sentence),
                "outcome": None,
                "evidence_sentence": sentence[:400],
            }

    return list(found.values())


def _extract_implants(sentences: List[str]) -> List[Dict[str, Any]]:
    """Identify implants and devices, which the flashcard surfaces prominently.

    Implant detection is intentionally independent of procedure detection: a document
    that records "permanent pacemaker implanted on 2023-03-02" describes both a
    procedure and a device, and only the device is useful at the bedside.
    """
    found: Dict[str, Dict[str, Any]] = {}

    for sentence in sentences:
        for pattern, canonical in _IMPLANT_LEXICON:
            if not re.search(pattern, sentence, re.IGNORECASE):
                continue
            if canonical in found:
                continue
            found[canonical] = {
                "name": canonical,
                "implanted_date": _find_date(sentence),
                "evidence_sentence": sentence[:400],
            }

    return list(found.values())


def _extract_follow_up(text: str) -> Dict[str, Any]:
    """Pull follow-up instructions and their date from advice text.

    A follow-up line that carries an explicit date is preferred over a bare reference
    in the chief-complaints section.
    """
    candidates = re.findall(
        r"[^\n]*(?:follow[\s-]*up|review|next\s+visit|advice|advised)[^\n]{0,240}",
        text,
        re.IGNORECASE,
    )
    if not candidates:
        return {"date": None, "instructions": None}

    dated = [item for item in candidates if _find_date(item)]
    advice = " ".join((dated or candidates)[-1].split()).strip(" .,:")[:300]

    return {"date": _find_date(advice), "instructions": advice}


# Words that turn a bare number into an interval or a dose count rather than a result.
_NOT_A_RESULT = re.compile(
    r"\s*(?:months?|weeks?|days?|hours?|years?|times|fold|normal|tablets?|capsules?)\b",
    re.IGNORECASE,
)

_UNIT_CANONICAL = {
    "mg/dl": "mg/dL",
    "g/dl": "g/dL",
    "k/ul": "k/uL",
    "u/l": "U/L",
    "meq/l": "mEq/L",
    "mmol/l": "mmol/L",
    "ng/ml": "ng/mL",
    "pg/ml": "pg/mL",
    "iu": "IU",
    "ml": "mL",
    "l": "L",
    "ug": "mcg",
    "/cumm": "/cumm",
    "cumm": "/cumm",
    "mmhg": "mmHg",
    "mg/ml": "mg/mL",
    "g/ml": "g/mL",
    "kg/m2": "kg/m2",
    "ml/min/1.73m2": "mL/min/1.73m2",
}


def _parse_lab_value(sentence: str, start: int) -> Tuple[Optional[float], Optional[str]]:
    """Parse the first lab number at or after ``start``, with an optional unit.

    ``start`` is the end of the matched test name, which keeps the parser from reading
    the reference-range numbers that trail every row in a printed lab report.

    A unitless number is only accepted when it is not the count in an interval phrase:
    "Repeat HbA1c in 3 months" names a test but reports no result.
    """
    match = _LAB_VALUE.search(sentence, start)
    if not match:
        return None, None

    raw_unit = (match.group(2) or "").strip()
    if not raw_unit:
        if _NOT_A_RESULT.match(sentence, match.end()):
            return None, None
        return float(match.group(1)), None

    return float(match.group(1)), _UNIT_CANONICAL.get(raw_unit.lower(), raw_unit)


def _parse_dose(sentence: str) -> Tuple[Optional[float], Optional[str]]:
    """Parse the first dose-like number and its unit from a sentence."""
    match = _DOSE.search(sentence)
    if not match:
        return None, None

    unit = match.group(2).lower()
    return float(match.group(1)), _UNIT_CANONICAL.get(unit, unit)


def _parse_frequency(sentence: str) -> Optional[str]:
    """Normalize a dosing frequency phrase into a canonical form."""
    match = _FREQUENCY.search(sentence)
    if not match:
        return None

    if match.group("count"):
        return f"{match.group('count').lower()} daily"

    if match.group("adhoc"):
        return " ".join(match.group("adhoc").lower().split())

    if match.group("schedule"):
        return match.group("schedule")

    return None


def _find_date(sentence: str) -> Optional[str]:
    """Return the first ISO, day-first, or year-only date found in a sentence."""
    iso = _ISO_DATE.search(sentence)
    if iso:
        return f"{iso.group(1)}-{iso.group(2)}-{iso.group(3)}"

    dmy = _DMY_DATE.search(sentence)
    if dmy:
        day, month, year = int(dmy.group(1)), int(dmy.group(2)), int(dmy.group(3))
        if 1 <= day <= 31 and 1 <= month <= 12:
            return f"{year:04d}-{month:02d}-{day:02d}"

    year = _YEAR.search(sentence)
    return year.group(0) if year else None


def _dedupe(items: List[Dict[str, Any]], key: str) -> List[Dict[str, Any]]:
    """Keep the first occurrence of each item, matched on a case-insensitive key."""
    seen: set = set()
    output: List[Dict[str, Any]] = []

    for item in items:
        if not isinstance(item, dict):
            continue
        marker = str(item.get(key) or "").strip().lower()
        if not marker or marker in seen:
            continue
        seen.add(marker)
        output.append(item)

    return output