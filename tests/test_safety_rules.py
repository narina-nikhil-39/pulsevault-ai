"""
Deterministic safety-rule unit tests.

These assert the verdict, not the wording. Because the safety engine is the clinical
guardrail of this system, a change in any expected severity must be treated as a clinical
change and reviewed, not silently accepted.
"""

from src.engine import safety_rules as rules


def _severities(hits):
    return sorted(hit.severity for hit in hits)


def test_allergy_class_cross_reactivity_is_critical():
    """A penicillin allergy must block any beta-lactam, including amoxicillin."""
    hits = rules.find_allergy_hits("Penicillin", "Amoxicillin")

    assert hits, "penicillin allergy must flag amoxicillin"
    assert rules.CRITICAL in _severities(hits)


def test_non_cross_reactive_drug_is_not_flagged():
    """An unrelated drug must not trigger a penicillin allergy."""
    assert rules.find_allergy_hits("Penicillin", "Azithromycin") == []


def test_direct_allergy_match_is_critical():
    """Prescribing the recorded allergen itself must always be critical."""
    hits = rules.find_allergy_hits("Penicillin", "Penicillin")

    assert hits
    assert rules.CRITICAL in _severities(hits)


def test_aspirin_with_warfarin_is_critical():
    """Dual antithrombotic therapy is the highest-bleeding-risk pair in the table."""
    hits = rules.find_interaction_hits("Aspirin", "Warfarin")

    assert hits
    assert rules.CRITICAL in _severities(hits)
    assert any("bleed" in hit.detail.lower() for hit in hits)


def test_warfarin_with_ciprofloxacin_is_flagged():
    """A CYP2C9 inhibitor raises INR and must be flagged."""
    hits = rules.find_interaction_hits("Warfarin", "Ciprofloxacin")

    assert hits
    assert rules.HIGH in _severities(hits)


def test_statin_with_macrolide_is_flagged():
    """Clarithromycin inhibits CYP3A4 and raises statin myopathy risk."""
    hits = rules.find_interaction_hits("Atorvastatin", "Clarithromycin")

    assert hits
    assert rules.HIGH in _severities(hits)


def test_sertraline_with_anticoagulant_class_is_flagged():
    """Class-level matching must catch an SSRI paired with an antithrombotic."""
    hits = rules.find_interaction_hits("Sertraline", "Warfarin")

    assert hits
    assert rules.HIGH in _severities(hits)


def test_interaction_matching_is_order_independent():
    """Drug pairs must be matched in either order."""
    forward = rules.find_interaction_hits("Aspirin", "Warfarin")
    reverse = rules.find_interaction_hits("Warfarin", "Aspirin")

    assert [h.identifier for h in forward] == [h.identifier for h in reverse]


def test_no_interaction_for_unrelated_pair():
    """Two safe drugs together must produce nothing."""
    assert rules.find_interaction_hits("Paracetamol", "Amoxicillin") == []


def test_metformin_in_chronic_kidney_disease_is_critical():
    """Metformin with CKD is a lactic-acidosis risk and must be critical."""
    hits = rules.find_contraindication_hits("Metformin", ["Chronic Kidney Disease"])

    assert hits
    assert rules.CRITICAL in _severities(hits)


def test_nsaid_with_peptic_ulcer_is_flagged():
    """An NSAID in a patient with an ulcer history is a GI-bleed risk."""
    hits = rules.find_contraindication_hits("Ibuprofen", ["Peptic Ulcer Disease"])

    assert hits
    assert any(hit.severity in (rules.HIGH, rules.MODERATE) for hit in hits)


def test_nsaid_with_renal_impairment_is_flagged():
    """An NSAID in CKD must be caught by the renal contraindication path."""
    hits = rules.find_contraindication_hits("Ibuprofen", ["Chronic Kidney Disease"])

    assert hits
    assert any(hit.severity in (rules.CRITICAL, rules.HIGH) for hit in hits)


def test_metformin_without_renal_disease_is_not_flagged():
    """The same drug in a patient without CKD must not be contraindicated."""
    assert rules.find_contraindication_hits("Metformin", ["Type 2 Diabetes Mellitus"]) == []


def test_duplicate_therapy_within_a_class_is_flagged():
    """Two statins together is therapeutic duplication."""
    hits = rules.find_duplicate_therapy_hits(["Atorvastatin", "Rosuvastatin"])

    assert hits
    assert rules.MODERATE in _severities(hits)


def test_no_duplicate_for_two_different_classes():
    """One drug from each of two classes is not duplication."""
    assert rules.find_duplicate_therapy_hits(["Aspirin", "Metformin"]) == []


def test_normalize_drug_key_strips_brand_and_form_noise():
    """Salt, brand, and formulation noise must not defeat a rule match."""
    assert rules.normalize_drug_key("Warfarin Sodium 5mg Tablet") == "warfarin"
    assert rules.normalize_drug_key("  AMOXICILLIN  ") == "amoxicillin"


def test_class_labels_are_human_readable():
    """Class keys must render as labels, never as raw internal keys."""
    assert rules.class_label("nsaid") == "NSAID"
    assert rules.class_label("ssri") == "SSRI"
    assert rules.class_label("anticoagulant") == "Anticoagulant"
    # An unknown key must still degrade to readable text rather than raw snake_case.
    assert "_" not in rules.class_label("some_unknown_class")


def test_class_interaction_titles_name_the_specific_drugs():
    """A class-pair finding must name the drugs, so two findings are distinguishable."""
    hits = rules.find_interaction_hits("Sertraline", "Aspirin")
    titles = [hit.title for hit in hits]

    assert titles
    for title in titles:
        assert "SERTRALINE" not in title, f"raw class key leaked into title: {title}"
        assert "Sertraline" in title and "Aspirin" in title


def test_allergy_class_lookup_covers_beta_lactams():
    """Beta-lactams must resolve to one allergy class so cross-reactivity fires."""
    for drug in ("Penicillin", "Amoxicillin", "Ampicillin"):
        assert rules.allergy_class_of(drug), f"{drug} must belong to a beta-lactam class"


def test_antithrombotics_share_one_class():
    """Warfarin, aspirin, and clopidogrel must share the anticoagulant class."""
    classes = {
        rules.drug_class_of("Warfarin"),
        rules.drug_class_of("Aspirin"),
        rules.drug_class_of("Clopidogrel"),
    }
    assert classes == {"anticoagulant"}


def test_unknown_drugs_yield_no_class_rather_than_guessing():
    """An unrecognised drug must not be silently assigned a class."""
    assert rules.drug_class_of("Somenewunavailablecompound") is None
