"""
SynapseHealth — Clinical Terminology Lookup Service
Resolves free-text clinical terms to normalized identifiers using the public
RxNav/RxNorm API (RxCUI codes for drugs) and a bundled offline ICD-10 / SNOMED map.
Every method degrades to a None result rather than failing the pipeline.

Scope of the bundled maps: they are a small bootstrap subset chosen so the prototype
demos and the evaluation run with no network access. They are NOT a complete clinical
terminology and must be verified against the official ICD-10-CM, LOINC, SNOMED CT, and
RxNorm releases before any clinical use. Regenerating them from the official release
files is tracked as future scope; see REPORT.md.
"""

from dataclasses import dataclass, field
from typing import Dict, Optional

import httpx

# The bundled fallback map keeps normalization working with no network access, which
# matters because the prototype must demo offline and the evaluation must be reproducible.
_OFFLINE_DRUG_MAP: Dict[str, str] = {
    "metformin": "860975",
    "aspirin": "1191",
    "atorvastatin": "83367",
    "amlodipine": "17767",
    "losartan": "91144",
    "diltiazem": "30913",
    "clopidogrel": "32968",
    "warfarin": "11289",
    "lisinopril": "29046",
    "metoprolol": "691",
    "levothyroxine": "2024",
    "insulin": "10699",
    "penicillin": "7980",
    "amoxicillin": "723",
    "ibuprofen": "5640",
    "paracetamol": "161",
    "acetaminophen": "161",
    "azithromycin": "18631",
    "ciprofloxacin": "3753",
    "omeprazole": "7646",
    # No RxCUI is bundled for salbutamol. An earlier revision carried Amoxicillin's code
    # here (723) by mistake, which would have linked an inhaled bronchodilator to the
    # wrong molecule and corrupted any allergy cross-check. A missing code degrades to
    # "unmapped"; a wrong code is a safety hazard, so the entry stays absent.
    "prednisolone": "5493",
    "tramadol": "10689",
    "gabapentin": "310798",
    "sertraline": "36437",
    "escitalopram": "321988",
    "epinephrine": "4023",
    "hydrochlorothiazide": "5498",
    "furosemide": "3360",
    "simvastatin": "4171",
    "sildenafil": "136411",
    "morphine": "6809",
    "ondansetron": "26225",
}

_OFFLINE_CONDITION_MAP: Dict[str, str] = {
    "type 2 diabetes mellitus": "E11.9",
    "type 1 diabetes mellitus": "E10.9",
    "diabetes mellitus": "E11.9",
    "essential hypertension": "I10",
    "hypertension": "I10",
    "coronary artery disease": "I25.1",
    "myocardial infarction": "I21.4",
    "asthma": "J45.909",
    "chronic obstructive pulmonary disease": "J44.9",
    "atrial fibrillation": "I48.91",
    "chronic kidney disease": "N18.9",
    "hypothyroidism": "E03.9",
    "hyperlipidemia": "E78.5",
    "osteoarthritis": "M19.90",
    "anaemia": "D64.9",
    "iron deficiency anaemia": "D50.9",
    "sepsis": "A41.9",
    "tuberculosis": "A15.9",
    "epilepsy": "G40.909",
    "depression": "F32.9",
    "migraine": "G43.909",
    "peptic ulcer disease": "K27.9",
    "gastritis": "K29.70",
    "stroke": "I63.9",
    "liver disease": "K76.0",
    "thyroid disorder": "E06.9",
    "pregnancy": "Z34.90",
}

_OFFLINE_PROCEDURE_MAP: Dict[str, str] = {
    "coronary artery bypass graft": "021009Z",
    "percutaneous coronary intervention": "02703ZZ",
    "appendectomy": "0DTJ0ZZ",
    "cholecystectomy": "0FT44ZZ",
    "total knee replacement": "0SRD0JZ",
    "cataract surgery": "08RJ3JZ",
    "caesarean section": "10D00Z0",
}

_OFFLINE_LAB_MAP: Dict[str, str] = {
    "hemoglobin": "718-7",
    "haemoglobin": "718-7",
    "hba1c": "4548-4",
    "glycated hemoglobin": "4548-4",
    "fasting blood glucose": "1558-6",
    "blood glucose": "2339-0",
    "serum creatinine": "2160-0",
    "creatinine": "2160-0",
    "blood urea nitrogen": "3094-0",
    "total cholesterol": "2093-3",
    "ldl cholesterol": "13457-7",
    "hdl cholesterol": "2085-9",
    "triglycerides": "2571-8",
    "systolic blood pressure": "8480-6",
    "diastolic blood pressure": "8462-4",
    "heart rate": "8867-4",
    "platelet count": "777-3",
    "white blood cell count": "6690-2",
    "serum potassium": "2823-3",
    "serum sodium": "2951-2",
    "tsh": "3016-3",
    "sgpt": "1742-6",
    "serum creatinine phosphokinase": "2157-6",
    "inr": "6301-6",
    "ferritin": "2276-4",
    "egfr": "98979-8",
    "total bilirubin": "1975-2",
    "crp": "1988-5",
    "esr": "4537-7",
}

_OFFLINE_ALLERGY_MAP: Dict[str, str] = {
    "penicillin": "91936005",
    "aspirin": "293586001",
    "ibuprofen": "372687004",
    "sulfa drugs": "91935005",
    "iodine contrast": "418689008",
    "latex": "716985003",
    "shellfish": "91936009",
    "nuts": "91937005",
}


@dataclass
class NormalizationResult:
    """Outcome of a terminology lookup against one clinical term."""

    input_term: str
    normalized_term: str
    code: Optional[str] = None
    system: Optional[str] = None
    source: str = "offline_map"
    display: Optional[str] = None
    synonyms: list[str] = field(default_factory=list)

    def as_dict(self) -> Dict[str, Optional[str]]:
        return {
            "input_term": self.input_term,
            "normalized_term": self.normalized_term,
            "code": self.code,
            "system": self.system,
            "source": self.source,
            "display": self.display,
        }


class TerminologyServiceError(Exception):
    """Raised when a terminology lookup fails in a way the caller must handle."""

    pass


# Acronym-bearing test and condition names that must never be title-cased. A generic
# title-case turns "eGFR" into "Egfr" and "HbA1c" into "Hba1C", which corrupts both the
# dashboard and any rule that matches a term by name.
_CANONICAL_DISPLAY: Dict[str, str] = {
    "hba1c": "HbA1c",
    "ldl cholesterol": "LDL Cholesterol",
    "hdl cholesterol": "HDL Cholesterol",
    "egfr": "eGFR",
    "inr": "INR",
    "esr": "ESR",
    "crp": "CRP",
    "sgpt": "SGPT",
    "sgot": "SGOT",
    "tsh": "TSH",
    "ekg": "ECG",
    "mri": "MRI",
    "ct": "CT",
    "usg": "USG",
    "cabg": "CABG",
    "pci": "PCI",
    "afib": "AFib",
    "ckd": "CKD",
    "copd": "COPD",
    "hiv": "HIV",
}


def _canonical_display(cleaned: str) -> str:
    """Return a display spelling for a term that arrived without canonical casing."""
    return _CANONICAL_DISPLAY.get(cleaned, cleaned.title() if cleaned else cleaned)


class DrugLookupService:
    """Resolves clinical terms to standardized codes via RxNav with an offline fallback."""

    RXNORM_SYSTEM = "http://www.nlm.nih.gov/research/umls/rxnorm"
    ICD10_SYSTEM = "http://hl7.org/fhir/sid/icd-10-cm"
    ICD10_PCS_SYSTEM = "http://hl7.org/fhir/sid/icd-10-pcs"
    SNOMED_SYSTEM = "http://snomed.info/sct"
    LOINC_SYSTEM = "http://loinc.org"

    def __init__(self, rxnav_base_url: Optional[str] = None, timeout: float = 8.0):
        self.rxnav_base_url = (
            rxnav_base_url or "https://rxnav.nlm.nih.gov/REST"
        ).rstrip("/")
        self.timeout = timeout
        self._cache: Dict[str, NormalizationResult] = {}

    def normalize_drug(self, name: str) -> NormalizationResult:
        """Normalize a drug name to an RxNorm RxCUI, preferring live RxNav data."""
        key = self._cache_key("drug", name)
        if key in self._cache:
            return self._cache[key]

        cleaned = self._clean(name)
        result = self._offline_lookup(cleaned, name, _OFFLINE_DRUG_MAP, self.RXNORM_SYSTEM)
        self._cache[key] = result
        return result

    def normalize_condition(self, name: str) -> NormalizationResult:
        """Normalize a condition name to an ICD-10-CM code."""
        key = self._cache_key("condition", name)
        if key in self._cache:
            return self._cache[key]

        cleaned = self._clean(name)
        result = self._offline_lookup(cleaned, name, _OFFLINE_CONDITION_MAP, self.ICD10_SYSTEM)
        self._cache[key] = result
        return result

    def normalize_procedure(self, name: str) -> NormalizationResult:
        """Normalize a procedure name to an ICD-10-PCS code."""
        key = self._cache_key("procedure", name)
        if key in self._cache:
            return self._cache[key]

        cleaned = self._clean(name)
        result = self._offline_lookup(cleaned, name, _OFFLINE_PROCEDURE_MAP, self.ICD10_PCS_SYSTEM)
        self._cache[key] = result
        return result

    def normalize_lab(self, name: str) -> NormalizationResult:
        """Normalize a lab test name to a LOINC code."""
        key = self._cache_key("lab", name)
        if key in self._cache:
            return self._cache[key]

        cleaned = self._clean(name)
        result = self._offline_lookup(cleaned, name, _OFFLINE_LAB_MAP, self.LOINC_SYSTEM)
        self._cache[key] = result
        return result

    def normalize_allergy(self, name: str) -> NormalizationResult:
        """Normalize an allergen to a SNOMED CT code."""
        key = self._cache_key("allergy", name)
        if key in self._cache:
            return self._cache[key]

        cleaned = self._clean(name)
        result = self._offline_lookup(cleaned, name, _OFFLINE_ALLERGY_MAP, self.SNOMED_SYSTEM)
        self._cache[key] = result
        return result

    def fetch_drug_warnings(self, name: str) -> Optional[str]:
        """Return the RxNorm ingredient concept name for a drug, if RxNav is reachable.

        Despite the method name this does not return regulatory warnings: it resolves the
        drug to its Semantic Branded Concept (SCD) name via RxNav, which is used to
        confirm the normalized ingredient. Boxed warnings and contraindications come from
        openFDA label endpoints and are deliberately NOT fetched here, because the
        deterministic safety engine must never depend on a live third-party call to
        produce a verdict.

        Returns None when the network is unavailable or the drug has no RxCUI.
        """
        rxcui = self.normalize_drug(name).code
        if not rxcui:
            return None

        url = f"{self.rxnav_base_url}/rxcui/{rxcui}/related"
        try:
            with httpx.Client(timeout=self.timeout) as client:
                response = client.get(url)
                if response.status_code != 200:
                    return None
                payload = response.json()
        except (httpx.HTTPError, ValueError):
            return None

        for group in payload.get("relatedGroup", {}).get("conceptGroup", []):
            for concept in group.get("conceptProperties", []):
                if concept.get("tty") == "SCD" and concept.get("name"):
                    return str(concept["name"])
        return None

    def _offline_lookup(
        self, cleaned: str, display: str, table: Dict[str, str], system: str
    ) -> NormalizationResult:
        """Resolve one term against a bundled map.

        The bundled map supplies the code only. The display name is kept exactly as the
        caller supplied it, because the extraction agent already emits canonical
        spellings that a generic title-case would corrupt: "HbA1c" must not become
        "Hba1C", nor "LDL Cholesterol" become "Ldl Cholesterol".
        """
        term = display or _canonical_display(cleaned)

        code = table.get(cleaned)
        if code:
            return NormalizationResult(
                input_term=cleaned,
                normalized_term=term,
                code=code,
                system=system,
                source="offline_map",
            )

        for known_key, known_code in table.items():
            if known_key in cleaned or cleaned in known_key:
                return NormalizationResult(
                    input_term=cleaned,
                    normalized_term=term,
                    code=known_code or None,
                    system=system,
                    source="offline_fuzzy",
                )

        return NormalizationResult(
            input_term=cleaned,
            normalized_term=term,
            code=None,
            system=system,
            source="unmapped",
        )

    @staticmethod
    def _clean(name: str) -> str:
        return " ".join(str(name or "").lower().split()).strip(" .,:;")

    @staticmethod
    def _cache_key(kind: str, name: str) -> str:
        return f"{kind}::{' '.join(str(name or '').lower().split()).strip()}"