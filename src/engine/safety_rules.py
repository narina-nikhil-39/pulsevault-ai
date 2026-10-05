"""
SynapseHealth — Deterministic Safety Rules Engine
Hard-coded clinical rule tables used by the safety guardrail agent. These rules are
deliberately NOT delegated to an LLM: a safety verdict must be reproducible, auditable,
and identical on every run. The LLM extracts facts; this module judges them.

Every rule carries an evidence string naming the clinical rationale, so an alert can be
explained to a doctor without trusting the model's wording.
"""

import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set, Tuple

CRITICAL = "critical"
HIGH = "high"
MODERATE = "moderate"


@dataclass(frozen=True)
class AllergyClass:
    """A drug class whose members share cross-reactivity and cross-sensitivity risk."""

    name: str
    members: frozenset


@dataclass(frozen=True)
class InteractionRule:
    """A pairwise drug interaction that is unsafe to surface without review."""

    identifier: str
    drug_a: str
    drug_b: str
    severity: str
    mechanism: str
    clinical_effect: str
    recommendation: str


@dataclass(frozen=True)
class ContraindicationRule:
    """A condition that makes a drug class inappropriate for the patient."""

    identifier: str
    drug: str
    condition_keywords: frozenset
    severity: str
    rationale: str
    recommendation: str


# ---------------------------------------------------------------------------
# Allergy cross-reactivity classes
# ---------------------------------------------------------------------------
# Penicillin-family members cross-react, so a documented penicillin allergy must
# block amoxicillin and ampicillin even when the new prescription names them directly.
ALLERGY_CLASSES: Tuple[AllergyClass, ...] = (
    AllergyClass(
        name="penicillin",
        members=frozenset(
            {
                "penicillin",
                "penicillin v",
                "penicillin g",
                "amoxicillin",
                "amoxicillin clavulanate",
                "amoxycillin",
                "ampicillin",
                "amoxicillin clavulanic acid",
                "cloxacillin",
                "dicloxacillin",
                "flucloxacillin",
                "oxacillin",
                "nafcillin",
                "piperacillin",
                "piperacillin tazobactam",
                "benzylpenicillin",
                "phenoxymethylpenicillin",
            }
        ),
    ),
    AllergyClass(
        name="cephalosporin",
        members=frozenset(
            {
                "cephalexin",
                "cefaclor",
                "cefuroxime",
                "ceftriaxone",
                "cefotaxime",
                "cefixime",
                "cefdinir",
                "cefazolin",
                "ceftazidime",
                "cefpodoxime",
            }
        ),
    ),
    AllergyClass(
        name="aspirin_nsaid",
        members=frozenset(
            {
                "aspirin",
                "acetylsalicylic acid",
                "ibuprofen",
                "naproxen",
                "diclofenac",
                "ketoprofen",
                "indometacin",
                "indomethacin",
                "celecoxib",
                "etoricoxib",
                "aceclofenac",
                "mefenamic acid",
            }
        ),
    ),
    AllergyClass(
        name="sulfonamide",
        members=frozenset(
            {
                "sulfamethoxazole",
                "co-trimoxazole",
                "cotrimoxazole",
                "sulfasalazine",
                "sulfamethazine",
                "sulfisoxazole",
            }
        ),
    ),
    AllergyClass(
        name="macrolide",
        members=frozenset(
            {"azithromycin", "erythromycin", "clarithromycin", "roxithromycin"}
        ),
    ),
    AllergyClass(
        name="aminoglycoside",
        members=frozenset(
            {"gentamicin", "amikacin", "tobramycin", "streptomycin", "neomycin"}
        ),
    ),
    AllergyClass(
        name="iodine_contrast",
        members=frozenset(
            {"iodinated contrast", "iodine contrast", "iohexol", "iopamidol", "gadolinium"}
        ),
    ),
    AllergyClass(
        name="nitroimidazole",
        members=frozenset({"metronidazole", "tinidazole", "ornidazole"}),
    ),
)

# Cephalosporins share a side chain with penicillins at the second generation;
# the label warning below is the clinically conservative position the engine takes.
CLASS_CROSS_REACTIVITY: Dict[str, Tuple[str, ...]] = {
    "penicillin": ("cephalosporin",),
    "cephalosporin": ("penicillin",),
}

# Conditions that raise the severity of an allergy hit from high to critical.
ANAPHYLAXIS_REACTIONS: Set[str] = {
    "anaphylaxis",
    "anaphylactic shock",
    "angioedema",
    "laryngeal oedema",
    "laryngeal edema",
    "bronchospasm",
    "shock",
}

# Food allergens that cross-react with drug excipients.
FOOD_TO_DRUG_ALIASES: Dict[str, Tuple[str, ...]] = {
    "penicillin": ("penicillium",),
    "aspirin": ("salicylate", "salicylates"),
    "shellfish": ("iodine", "iodine contrast", "iodinated contrast"),
    "latex": ("rubber",),
    "sulfa drugs": ("sulfa", "sulfonamide"),
}


# ---------------------------------------------------------------------------
# Drug-drug interaction rules
# ---------------------------------------------------------------------------
INTERACTION_RULES: Tuple[InteractionRule, ...] = (
    InteractionRule(
        identifier="DD-001",
        drug_a="aspirin",
        drug_b="warfarin",
        severity=CRITICAL,
        mechanism="Additive anticoagulation",
        clinical_effect="Major bleeding risk, including intracranial haemorrhage",
        recommendation="Avoid the combination. If unavoidable, monitor INR closely and counsel on bleeding signs.",
    ),
    InteractionRule(
        identifier="DD-002",
        drug_a="clopidogrel",
        drug_b="warfarin",
        severity=CRITICAL,
        mechanism="Additive antiplatelet and anticoagulant effect",
        clinical_effect="Major bleeding risk",
        recommendation="Prefer a single antithrombotic agent; if combined, reduce warfarin target INR range.",
    ),
    InteractionRule(
        identifier="DD-003",
        drug_a="ssri",
        drug_b="aspirin",
        severity=HIGH,
        mechanism="Reduced platelet serotonin uptake plus platelet inhibition",
        clinical_effect="Increased risk of upper gastrointestinal bleeding",
        recommendation="Add gastroprotection with a PPI, or choose an alternative analgesic.",
    ),
    InteractionRule(
        identifier="DD-004",
        drug_a="ssri",
        drug_b="nsaid",
        severity=HIGH,
        mechanism="Reduced platelet serotonin uptake plus mucosal injury",
        clinical_effect="Increased risk of upper gastrointestinal bleeding",
        recommendation="Add a proton-pump inhibitor or avoid the NSAID.",
    ),
    InteractionRule(
        identifier="DD-005",
        drug_a="warfarin",
        drug_b="ciprofloxacin",
        severity=HIGH,
        mechanism="CYP1A2 and gut flora inhibition reducing warfarin metabolism",
        clinical_effect="Unpredictable rise in INR with bleeding risk",
        recommendation="Select an alternative antibiotic or intensify INR monitoring for the course.",
    ),
    InteractionRule(
        identifier="DD-006",
        drug_a="warfarin",
        drug_b="metronidazole",
        severity=CRITICAL,
        mechanism="Inhibition of CYP2C9 warfarin metabolism",
        clinical_effect="Rapid INR elevation and serious bleeding risk",
        recommendation="Avoid metronidazole. Use an alternative agent, or reduce the warfarin dose with close INR monitoring.",
    ),
    InteractionRule(
        identifier="DD-007",
        drug_a="simvastatin",
        drug_b="clarithromycin",
        severity=CRITICAL,
        mechanism="Strong CYP3A4 inhibition",
        clinical_effect="Myopathy and rhabdomyolysis risk",
        recommendation="Suspend simvastatin for the duration of the macrolide course.",
    ),
    InteractionRule(
        identifier="DD-008",
        drug_a="atorvastatin",
        drug_b="clarithromycin",
        severity=HIGH,
        mechanism="CYP3A4 inhibition raising statin exposure",
        clinical_effect="Myopathy risk",
        recommendation="Temporarily withhold atorvastatin or cap the dose during therapy.",
    ),
    InteractionRule(
        identifier="DD-009",
        drug_a="lisinopril",
        drug_b="potassium",
        severity=HIGH,
        mechanism="Reduced potassium excretion",
        clinical_effect="Hyperkalaemia",
        recommendation="Check serum potassium and renal function before and after starting.",
    ),
    InteractionRule(
        identifier="DD-010",
        drug_a="lisinopril",
        drug_b="spironolactone",
        severity=CRITICAL,
        mechanism="ACE inhibition combined with potassium-sparing diuresis",
        clinical_effect="Severe hyperkalaemia and risk of acute kidney injury",
        recommendation="Avoid unless potassium and renal function are monitored closely.",
    ),
    InteractionRule(
        identifier="DD-011",
        drug_a="methotrexate",
        drug_b="trimethoprim",
        severity=CRITICAL,
        mechanism="Additive antifolate effect",
        clinical_effect="Pancytopenia and bone marrow suppression",
        recommendation="Avoid the combination. Substitute a non-trimethoprim agent.",
    ),
    InteractionRule(
        identifier="DD-012",
        drug_a="digoxin",
        drug_b="clarithromycin",
        severity=HIGH,
        mechanism="P-glycoprotein inhibition reducing digoxin clearance",
        clinical_effect="Digoxin toxicity with bradycardia and arrhythmia",
        recommendation="Monitor digoxin levels and watch for nausea, visual disturbance, and pulse change.",
    ),
    InteractionRule(
        identifier="DD-013",
        drug_a="tramadol",
        drug_b="sertraline",
        severity=HIGH,
        mechanism="Additive serotonergic activity",
        clinical_effect="Serotonin syndrome risk",
        recommendation="Prefer a non-serotonergic analgesic or antidepressant.",
    ),
    InteractionRule(
        identifier="DD-014",
        drug_a="metformin",
        drug_b="ciprofloxacin",
        severity=MODERATE,
        mechanism="Fluoroquinolone effect on glycaemic control",
        clinical_effect="Hypoglycaemia or hyperglycaemia, particularly in older adults",
        recommendation="Monitor blood glucose during and after the antibiotic course.",
    ),
    InteractionRule(
        identifier="DD-015",
        drug_a="levothyroxine",
        drug_b="calcium carbonate",
        severity=MODERATE,
        mechanism="Gastrointestinal binding reducing levothyroxine absorption",
        clinical_effect="Loss of thyroid control",
        recommendation="Separate the two doses by at least four hours.",
    ),
    InteractionRule(
        identifier="DD-016",
        drug_a="levothyroxine",
        drug_b="ferrous sulfate",
        severity=MODERATE,
        mechanism="Gastrointestinal chelation reducing levothyroxine absorption",
        clinical_effect="Loss of thyroid control",
        recommendation="Separate the two doses by at least four hours.",
    ),
    InteractionRule(
        identifier="DD-017",
        drug_a="iron",
        drug_b="levothyroxine",
        severity=MODERATE,
        mechanism="Gastrointestinal chelation",
        clinical_effect="Reduced absorption of both agents",
        recommendation="Separate doses by at least four hours.",
    ),
    InteractionRule(
        identifier="DD-018",
        drug_a="lisinopril",
        drug_b="ibuprofen",
        severity=HIGH,
        mechanism="NSAID inhibition of prostaglandin-mediated renal perfusion",
        clinical_effect="Acute kidney injury and reduced antihypertensive effect",
        recommendation="Avoid the NSAID in patients on ACE inhibitors or ARBs.",
    ),
    InteractionRule(
        identifier="DD-019",
        drug_a="losartan",
        drug_b="ibuprofen",
        severity=HIGH,
        mechanism="NSAID inhibition of prostaglandin-mediated renal perfusion",
        clinical_effect="Acute kidney injury and loss of antihypertensive control",
        recommendation="Avoid the NSAID or monitor renal function closely.",
    ),
    InteractionRule(
        identifier="DD-020",
        drug_a="acetaminophen",
        drug_b="warfarin",
        severity=MODERATE,
        mechanism="Interference with vitamin K dependent clotting at sustained high doses",
        clinical_effect="Raised INR with prolonged regular paracetamol use",
        recommendation="Cap daily paracetamol dose and monitor INR if used long term.",
    ),
    InteractionRule(
        identifier="DD-021",
        drug_a="carbamazepine",
        drug_b="macrolide",
        severity=HIGH,
        mechanism="Cytochrome P450 induction and inhibition",
        clinical_effect="Loss of seizure control or carbamazepine toxicity",
        recommendation="Prefer a non-macrolide antibiotic or adjust the anticonvulsant with level monitoring.",
    ),
    InteractionRule(
        identifier="DD-022",
        drug_a="omeprazole",
        drug_b="clopidogrel",
        severity=MODERATE,
        mechanism="CYP2C19 inhibition reducing clopidogrel activation",
        clinical_effect="Reduced antiplatelet efficacy after myocardial infarction",
        recommendation="Use pantoprazole instead of omeprazole in patients on clopidogrel.",
    ),
    InteractionRule(
        identifier="DD-023",
        drug_a="hydrochlorothiazide",
        drug_b="metformin",
        severity=MODERATE,
        mechanism="Thiazide-induced reduction in renal clearance of metformin",
        clinical_effect="Lactate accumulation risk in renal impairment",
        recommendation="Check renal function before initiating and monitor lactate if impaired.",
    ),
    InteractionRule(
        identifier="DD-024",
        drug_a="metoprolol",
        drug_b="verapamil",
        severity=CRITICAL,
        mechanism="Additive atrioventricular nodal blockade",
        clinical_effect="Complete heart block, severe bradycardia, cardiac arrest risk",
        recommendation="Avoid the combination. Choose diltiazem only with specialist oversight.",
    ),
)

# Class-level interaction pairs. Both sides name a therapeutic class from
# _DRUG_CLASS_MEMBERS, so any member of either class triggers the rule. This is what
# catches pairings the pairwise table cannot enumerate, such as sertraline with aspirin
# (sertraline is never literally named "ssri").
CLASS_INTERACTION_RULES: Tuple[Tuple[str, str, str, str, str, str], ...] = (
    (
        "ssri",
        "anticoagulant",
        HIGH,
        "Reduced platelet serotonin uptake plus platelet inhibition",
        "Increased risk of upper gastrointestinal and intracranial bleeding",
        "Add gastroprotection with a proton-pump inhibitor, or choose an alternative agent.",
    ),
    (
        "ssri",
        "nsaid",
        HIGH,
        "Reduced platelet serotonin uptake plus NSAID mucosal injury",
        "Increased risk of upper gastrointestinal bleeding",
        "Add a proton-pump inhibitor or avoid the NSAID.",
    ),
    (
        "anticoagulant",
        "nsaid",
        HIGH,
        "Additive bleeding risk combined with NSAID mucosal injury",
        "Increased risk of gastrointestinal and intracranial bleeding",
        "Avoid the NSAID, or add gastroprotection and monitor closely.",
    ),
    (
        "ace_inhibitor",
        "nsaid",
        HIGH,
        "NSAID inhibition of prostaglandin-mediated renal perfusion",
        "Acute kidney injury and loss of antihypertensive control",
        "Avoid the NSAID in patients on ACE inhibitors or ARBs.",
    ),
    (
        "arb",
        "nsaid",
        HIGH,
        "NSAID inhibition of prostaglandin-mediated renal perfusion",
        "Acute kidney injury and loss of antihypertensive control",
        "Avoid the NSAID in patients on ACE inhibitors or ARBs.",
    ),
    (
        "statin",
        "antimicrobial_macrolide",
        HIGH,
        "CYP3A4 inhibition raising static exposure",
        "Myopathy and rhabdomyolysis risk",
        "Suspend the statin for the duration of the macrolide course.",
    ),
)


# ---------------------------------------------------------------------------
# Condition-based contraindications
# ---------------------------------------------------------------------------
CONTRAINDICATION_RULES: Tuple[ContraindicationRule, ...] = (
    ContraindicationRule(
        identifier="CX-001",
        drug="metformin",
        condition_keywords=frozenset({"chronic kidney disease", "renal impairment", "c kidney disease"}),
        severity=CRITICAL,
        rationale="Metformin is contraindicated in significant renal impairment because of lactic acidosis risk",
        recommendation="Check eGFR before continuing. Contraindicated when eGFR is below 30 mL/min/1.73m2.",
    ),
    ContraindicationRule(
        identifier="CX-002",
        drug="aceclofenac",
        condition_keywords=frozenset({"chronic kidney disease", "peptic ulcer", "gastritis"}),
        severity=HIGH,
        rationale="NSAIDs worsen renal function and cause gastrointestinal mucosal injury",
        recommendation="Choose paracetamol or a COX-2 selective agent instead.",
    ),
    ContraindicationRule(
        identifier="CX-003",
        drug="aspirin",
        condition_keywords=frozenset({"peptic ulcer", "gastritis"}),
        severity=HIGH,
        rationale="Aspirin irreversibly inhibits platelet function and worsens gastric mucosal damage",
        recommendation="Review the indication. Consider a proton-pump inhibitor with any continued use.",
    ),
    ContraindicationRule(
        identifier="CX-004",
        drug="glibenclamide",
        condition_keywords=frozenset({"chronic kidney disease", "elderly"}),
        severity=HIGH,
        rationale="Long-acting sulfonylureas accumulate in renal impairment and cause prolonged hypoglycaemia",
        recommendation="Switch to a lower-risk agent with shorter duration of action.",
    ),
    ContraindicationRule(
        identifier="CX-005",
        drug="losartan",
        condition_keywords=frozenset({"pregnancy"}),
        severity=CRITICAL,
        rationale="Angiotensin receptor blockers are fetotoxic and contraindicated in pregnancy",
        recommendation="Discontinue immediately and substitute a pregnancy-safe antihypertensive.",
    ),
    ContraindicationRule(
        identifier="CX-006",
        drug="methotrexate",
        condition_keywords=frozenset({"chronic kidney disease", "liver disease", "hepatic impairment"}),
        severity=CRITICAL,
        rationale="Methotrexate is renally and hepatically cleared and is myelosuppressive",
        recommendation="Requires specialist supervision with regular blood monitoring.",
    ),
    ContraindicationRule(
        identifier="CX-007",
        drug="amiodarone",
        condition_keywords=frozenset({"thyroid disorder", "hypothyroidism", "hyperthyroidism"}),
        severity=HIGH,
        rationale="Amiodarone causes both hypothyroidism and thyrotoxicosis",
        recommendation="Monitor thyroid function every six months.",
    ),
    ContraindicationRule(
        identifier="CX-008",
        drug="sotalol",
        condition_keywords=frozenset({"asthma", "chronic obstructive pulmonary disease"}),
        severity=CRITICAL,
        rationale="Beta blockade can precipitate bronchospasm",
        recommendation="Use a cardioselective agent or an alternative antiarrhythmic.",
    ),
)

# Condition keywords that independently make any NSAID unsafe.
NSAID_RISK_CONDITIONS = frozenset(
    {
        "chronic kidney disease",
        "peptic ulcer",
        "gastritis",
        "heart failure",
        "coronary artery disease",
        "stroke",
    }
)

# Drugs whose whole drug class shares one alert title.
THERAPEUTIC_DUPLICATES: Tuple[Tuple[str, str, str], ...] = (
    ("ace_inhibitor", "ACE inhibitor", "ACE inhibitor"),
    ("arb", "ARB", "Angiotensin receptor blocker"),
    ("loop_diuretic", "Loop diuretic", "Loop diuretic"),
    ("statin", "Statin", "HMG-CoA reductase inhibitor"),
    ("biguanide", "Biguanide", "Metformin-class antidiabetic"),
    ("ppi", "Proton pump inhibitor", "Proton pump inhibitor"),
    ("ssri", "SSRI", "Selective serotonin reuptake inhibitor"),
    ("anticoagulant", "Anticoagulant", "Anticoagulant or antiplatelet"),
    ("nsaid", "NSAID", "Non-steroidal anti-inflammatory drug"),
    ("sulfonamide", "Sulfonamide", "Sulfonamide antibacterial"),
    ("beta_blocker", "Beta blocker", "Beta-adrenoceptor blocker"),
    ("calcium_channel_blocker", "Calcium channel blocker", "Calcium channel blocker"),
)


# ---------------------------------------------------------------------------
# Membership helpers
# ---------------------------------------------------------------------------
_ALLERGY_MEMBER_INDEX: Dict[str, str] = {
    member: allergy_class.name
    for allergy_class in ALLERGY_CLASSES
    for member in allergy_class.members
}

_DRUG_CLASS_MEMBERS: Dict[str, frozenset] = {
    "ace_inhibitor": frozenset(
        {"lisinopril", "enalapril", "ramipril", "captopril", "perindopril", "enalapril maleate"}
    ),
    "arb": frozenset(
        {"losartan", "valsartan", "telmisartan", "candesartan", "olmesartan", "azilsartan"}
    ),
    "loop_diuretic": frozenset(
        {"furosemide", "torsemide", "bumetanide", "ethacrynic acid"}
    ),
    "statin": frozenset(
        {"atorvastatin", "simvastatin", "rosuvastatin", "pravastatin", "fluvastatin", "pitavastatin"}
    ),
    "biguanide": frozenset({"metformin", "metformin hydrochloride"}),
    "ppi": frozenset(
        {"omeprazole", "pantoprazole", "esomeprazole", "lansoprazole", "rabeprazole"}
    ),
    "ssri": frozenset(
        {
            "sertraline",
            "fluoxetine",
            "citalopram",
            "escitalopram",
            "paroxetine",
            "fluvoxamine",
            "venlafaxine",
            "duloxetine",
        }
    ),
    "anticoagulant": frozenset(
        {
            "warfarin",
            "heparin",
            "enoxaparin",
            "apixaban",
            "rivaroxaban",
            "dabigatran",
            "clopidogrel",
            "aspirin",
        }
    ),
    "nsaid": frozenset(
        {
            "ibuprofen",
            "naproxen",
            "diclofenac",
            "aceclofenac",
            "indomethacin",
            "celecoxib",
            "etoricoxib",
            "ketoprofen",
        }
    ),
    "sulfonamide": frozenset({"sulfamethoxazole", "co-trimoxazole", "cotrimoxazole"}),
    "beta_blocker": frozenset(
        {"metoprolol", "atenolol", "bisoprolol", "carvedilol", "propranolol", "labetalol", "sotalol"}
    ),
    "calcium_channel_blocker": frozenset(
        {"amlodipine", "verapamil", "diltiazem", "nifedipine", "felodipine"}
    ),
    "antimicrobial_macrolide": frozenset(
        {"clarithromycin", "azithromycin", "erythromycin", "roxithromycin"}
    ),
    "penicillin_family": frozenset(
        {"penicillin", "amoxicillin", "ampicillin", "cloxacillin", "benzylpenicillin"}
    ),
}

_DRUG_TO_CLASS: Dict[str, str] = {
    member: class_name
    for class_name, members in _DRUG_CLASS_MEMBERS.items()
    for member in members
}


@dataclass
class MatchedRule:
    """One rule that fired, carrying everything needed to explain the alert."""

    identifier: str
    severity: str
    category: str
    title: str
    detail: str
    involved: List[str] = field(default_factory=list)
    recommendation: str = ""
    evidence: str = ""


# Dose tokens carry no identity, so they are removed before a drug name is compared.
_DOSE_TOKEN = re.compile(
    r"\b\d+(?:\.\d+)?\s*(?:mg|mcg|ug|g|ml|l|iu|units?|%)\b", re.IGNORECASE
)

# Salt and formulation words routinely appended to a drug name on a prescription. Keeping
# them would make "Warfarin Sodium 5mg" fail to match a rule targeting plain "Warfarin".
_FORMULATION_NOISE = frozenset(
    {
        "sodium",
        "potassium",
        "calcium",
        "magnesium",
        "ammonium",
        "hydrochloride",
        "hcl",
        "succinate",
        "tartrate",
        "maleate",
        "fumarate",
        "sulphate",
        "sulfate",
        "phosphate",
        "acetate",
        "citrate",
        "besylate",
        "besilate",
        "mesylate",
        "mesylate",
        "tablet",
        "tablets",
        "tab",
        "capsule",
        "capsules",
        "cap",
        "injection",
        "inj",
        "syrup",
        "syp",
        "drops",
        "cream",
        "ointment",
        "gel",
        "lotion",
        "sachet",
        "powder",
        "xr",
        "sr",
        "er",
        "dr",
    }
)


def normalize_drug_key(name: str) -> str:
    """Reduce a drug name to a comparable key for rule matching.

    Prescription strings carry salt, dose, and formulation noise ("Warfarin Sodium 5mg
    Tablet"). All of it is stripped so the remaining token matches a rule target.
    """
    text = " ".join(str(name or "").lower().split())
    text = _DOSE_TOKEN.sub(" ", text)

    kept = [word for word in text.split() if word.strip(" .,;:") not in _FORMULATION_NOISE]
    return " ".join(kept).strip(" .,;:")


def allergy_class_of(substance: str) -> Optional[str]:
    """Return the allergy class of a substance, if it belongs to one."""
    key = normalize_drug_key(substance)
    if key in _ALLERGY_MEMBER_INDEX:
        return _ALLERGY_MEMBER_INDEX[key]
    for member, class_name in _ALLERGY_MEMBER_INDEX.items():
        if member in key or key in member:
            return class_name
    return None


def drug_class_of(name: str) -> Optional[str]:
    """Return the therapeutic class of a drug, if it is classified."""
    key = normalize_drug_key(name)
    if key in _DRUG_TO_CLASS:
        return _DRUG_TO_CLASS[key]
    for member, class_name in _DRUG_TO_CLASS.items():
        if member in key or key and key in member:
            return class_name
    return None


def allergy_members(allergy_class_name: str) -> frozenset:
    """Return the members of a named allergy class."""
    for allergy_class in ALLERGY_CLASSES:
        if allergy_class.name == allergy_class_name:
            return allergy_class.members
    return frozenset()


def find_allergy_hits(allergy_substance: str, prescribed_drug: str) -> List[MatchedRule]:
    """Return every allergy rule that the prescribed drug triggers."""
    hits: List[MatchedRule] = []
    allergy_key = normalize_drug_key(allergy_substance)
    drug_key = normalize_drug_key(prescribed_drug)

    if not allergy_key or not drug_key:
        return hits

    direct = allergy_key in drug_key or drug_key in allergy_key
    allergy_class_name = allergy_class_of(allergy_key)
    drug_allergy_class = allergy_class_of(drug_key)

    if direct:
        hits.append(
            MatchedRule(
                identifier="AL-DIRECT",
                severity=CRITICAL,
                category="allergy",
                title=f"Prescribed drug matches documented allergy to {allergy_substance}",
                detail=(
                    f"{prescribed_drug} is a recorded allergen for this patient. "
                    "Administration risks a hypersensitivity reaction."
                ),
                involved=[allergy_substance, prescribed_drug],
                recommendation="Do not dispense. Substitute a therapeutic alternative outside the allergen class.",
                evidence="Patient allergy record matched against the newly prescribed drug.",
            )
        )
        return hits

    if allergy_class_name and drug_allergy_class and drug_allergy_class == allergy_class_name:
        hits.append(
            MatchedRule(
                identifier="AL-CLASS",
                severity=CRITICAL,
                category="allergy",
                title=f"Cross-reactive {allergy_class_name} prescribed against a documented allergy",
                detail=(
                    f"{prescribed_drug} belongs to the {allergy_class_name} class and the patient has a "
                    f"recorded allergy in the same class ({allergy_substance}). Cross-reactivity is clinically likely."
                ),
                involved=[allergy_substance, prescribed_drug],
                recommendation="Select an antibiotic from a non-cross-reactive class.",
                evidence="Allergy class membership matched between the allergy record and the prescription.",
            )
        )
        return hits

    if allergy_class_name and drug_allergy_class and drug_allergy_class in CLASS_CROSS_REACTIVITY.get(allergy_class_name, ()):
        hits.append(
            MatchedRule(
                identifier="AL-CROSSFAMILY",
                severity=HIGH,
                category="allergy",
                title=f"Possible cross-reactivity between {allergy_class_name} and {drug_allergy_class}",
                detail=(
                    f"{prescribed_drug} is a {drug_allergy_class}. Patients allergic to {allergy_key} have an "
                    "elevated risk of reaction through shared structural determinants."
                ),
                involved=[allergy_substance, prescribed_drug],
                recommendation="Administer the first dose under observation, or choose an unrelated class.",
                evidence="Cross-family allergy similarity reported by the terminology service.",
            )
        )

    return hits


def find_interaction_hits(drug_a: str, drug_b: str) -> List[MatchedRule]:
    """Return every drug-drug interaction rule that fires for a pair of drugs."""
    hits: List[MatchedRule] = []
    key_a = normalize_drug_key(drug_a)
    key_b = normalize_drug_key(drug_b)

    for rule in INTERACTION_RULES:
        if not pair_matches(key_a, rule.drug_a, key_b, rule.drug_b):
            continue
        hits.append(
            MatchedRule(
                identifier=rule.identifier,
                severity=rule.severity,
                category="interaction",
                title=f"{rule.drug_a.title()} and {rule.drug_b.title()} interaction",
                detail=(
                    f"Mechanism: {rule.mechanism}. Effect: {rule.clinical_effect}. "
                    f"Both drugs are on this patient's active medication list."
                ),
                involved=[drug_a, drug_b],
                recommendation=rule.recommendation,
                evidence=f"Pairwise interaction rule {rule.identifier} matched both active medications.",
            )
        )

    class_a = drug_class_of(key_a)
    class_b = drug_class_of(key_b)

    for class_a_name, class_b_name, severity, mechanism, effect, recommendation in CLASS_INTERACTION_RULES:
        unordered = {class_a_name, class_b_name} == {class_a, class_b}
        if not unordered:
            continue

        # The title names the two drugs rather than the class pair. A patient on an SSRI
        # plus two different antithrombotics generates two findings that would otherwise
        # carry an identical "SSRI combined with ANTICOAGULANT" heading, reading as a bug
        # and hiding which pairing the clinician is being warned about.
        hits.append(
            MatchedRule(
                identifier="DD-CLASS",
                severity=severity,
                category="interaction",
                title=f"{drug_a} combined with {drug_b}",
                detail=(
                    f"{class_label(class_a)} with {class_label(class_b)}. "
                    f"Mechanism: {mechanism}. Effect: {effect}."
                ),
                involved=[drug_a, drug_b],
                recommendation=recommendation,
                evidence="Therapeutic class pair matched against the class interaction table.",
            )
        )

    return hits


def class_label(class_name: str) -> str:
    """Return the display label for a therapeutic class key, e.g. ``nsaid`` -> ``NSAID``."""
    for key, label, _description in THERAPEUTIC_DUPLICATES:
        if key == class_name:
            return label
    return class_name.replace("_", " ").title()


def pair_matches(key_a: str, target_a: str, key_b: str, target_b: str) -> bool:
    """Return True when a normalized pair matches a rule pair in either order."""
    forward = _name_matches(key_a, target_a) and _name_matches(key_b, target_b)
    reverse = _name_matches(key_b, target_a) and _name_matches(key_a, target_b)
    return forward or reverse


def _name_matches(key: str, target: str) -> bool:
    """Loose containment match tolerant of brand suffixes and salt forms."""
    if not key or not target:
        return False
    if key == target:
        return True
    if target in key:
        return True
    if len(key) > 4 and key in target:
        return True
    return False


def find_contraindication_hits(
    drug: str, condition_names: List[str]
) -> List[MatchedRule]:
    """Return condition-based contraindications for a drug."""
    hits: List[MatchedRule] = []
    drug_key = normalize_drug_key(drug)
    condition_blob = " ".join(str(name or "").lower() for name in condition_names)

    for rule in CONTRAINDICATION_RULES:
        if not _name_matches(drug_key, rule.drug):
            continue
        matched = [
            keyword
            for keyword in rule.condition_keywords
            if keyword in condition_blob
        ]
        if not matched:
            continue
        hits.append(
            MatchedRule(
                identifier=rule.identifier,
                severity=rule.severity,
                category="contraindication",
                title=f"{rule.drug.title()} in the context of {matched[0]}",
                detail=rule.rationale,
                involved=[drug] + matched,
                recommendation=rule.recommendation,
                evidence=f"Condition keyword '{matched[0]}' matched from the patient's condition history.",
            )
        )

    if drug_class_of(drug_key) == "nsaid":
        # Containment rather than equality: the risk set says "peptic ulcer" while the
        # stored condition is the canonical "Peptic Ulcer Disease". Exact matching left
        # every non-aspirin NSAID unflagged in a patient with an ulcer history.
        risky = [
            name
            for name in condition_names
            if _matches_any_risk_condition(str(name))
        ]
        if risky:
            hits.append(
                MatchedRule(
                    identifier="CX-NSAID",
                    severity=HIGH,
                    category="contraindication",
                    title=f"NSAID prescribed with {risky[0]}",
                    detail=(
                        f"{drug} is an NSAID. The patient has {risky[0]}, which materially raises the risk of "
                        "renal injury, gastrointestinal bleeding, and cardiovascular events."
                    ),
                    involved=[drug] + risky,
                    recommendation="Substitute paracetamol or a COX-2 selective agent.",
                    evidence="NSAID risk-condition table matched the patient's condition history.",
                )
            )

    return hits


def _matches_any_risk_condition(condition_name: str) -> bool:
    """Return True when a stored condition name corresponds to an NSAID risk factor."""
    text = " ".join(str(condition_name or "").lower().split())
    if not text:
        return False
    return any(risk in text or text in risk for risk in NSAID_RISK_CONDITIONS)


def find_duplicate_therapy_hits(medication_names: List[str]) -> List[MatchedRule]:
    """Return alerts where two active medications share a therapeutic class."""
    hits: List[MatchedRule] = []
    seen: Dict[str, List[str]] = {}

    for name in medication_names:
        class_name = drug_class_of(name)
        if class_name:
            seen.setdefault(class_name, []).append(name)

    titles = {title: (class_name, label) for class_name, title, label in THERAPEUTIC_DUPLICATES}

    for class_name, members in seen.items():
        if len(members) < 2:
            continue
        label = titles.get(class_name, (class_name, class_name.replace("_", " ").title()))[1]
        hits.append(
            MatchedRule(
                identifier="TX-DUP",
                severity=MODERATE,
                category="duplicate_therapy",
                title=f"Therapeutic duplication: {len(members)} concurrent {label} agents",
                detail=(
                    f"Active medications {', '.join(sorted(members))} all belong to the {label} class. "
                    "Concurrent use risks cumulative adverse effects and confusion at admission."
                ),
                involved=sorted(members),
                recommendation="Reconcile to a single agent in the class before the next prescribing decision.",
                evidence="Two or more active medications matched the same therapeutic class.",
            )
        )

    return hits