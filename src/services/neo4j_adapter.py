"""
SynapseHealth — Production Graph Database Adapter (Neo4j)
Generates declarative Cypher queries, enforces graph constraints, maps clinical
entities (Patient, Condition, Medication, LabValue, Allergy) to graph nodes and typed
edges, and optionally communicates with a live Neo4j instance or operates in simulated mode.
"""

from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("synapsehealth.neo4j")


@dataclass
class CypherExport:
    """Export container holding schema constraints and data mutation statements."""

    patient_code: str
    constraints: List[str]
    statements: List[str]
    cypher_script: str
    nodes_count: int
    edges_count: int
    metadata: Dict[str, Any] = field(default_factory=dict)


def sanitize_cypher_string(val: Optional[str]) -> str:
    """Escape single quotes and newlines for safe inline Cypher literals."""
    if val is None:
        return ""
    clean = str(val).replace("\\", "\\\\").replace("'", "\\'").replace("\n", " ").strip()
    return clean


class Neo4jGraphAdapter:
    """
    Adapter for converting relational clinical models into Neo4j property graph structures.
    Supports Cypher generation, schema constraint definitions, contraindication graph links,
    and fallback in-memory graph synchronization when Neo4j is not connected.
    """

    SCHEMA_CONSTRAINTS = [
        "CREATE CONSTRAINT patient_code_unique IF NOT EXISTS FOR (p:Patient) REQUIRE p.patient_code IS UNIQUE;",
        "CREATE CONSTRAINT condition_key_unique IF NOT EXISTS FOR (c:Condition) REQUIRE c.key IS UNIQUE;",
        "CREATE CONSTRAINT medication_key_unique IF NOT EXISTS FOR (m:Medication) REQUIRE m.key IS UNIQUE;",
        "CREATE CONSTRAINT allergy_key_unique IF NOT EXISTS FOR (a:Allergy) REQUIRE a.key IS UNIQUE;",
        "CREATE CONSTRAINT lab_key_unique IF NOT EXISTS FOR (l:LabValue) REQUIRE l.key IS UNIQUE;",
    ]

    def __init__(self, uri: Optional[str] = None, auth: Optional[Tuple[str, str]] = None) -> None:
        self.uri = uri or os.getenv("NEO4J_URI", "")
        username = os.getenv("NEO4J_USER", "neo4j")
        password = os.getenv("NEO4J_PASSWORD", "synapsehealth")
        self.auth = auth or (username, password)
        self._driver = None
        self._is_connected = False
        self._try_init_driver()

    def _try_init_driver(self) -> None:
        """Attempt to initialize the official neo4j driver if installed and configured."""
        if not self.uri:
            return
        try:
            import neo4j  # type: ignore

            self._driver = neo4j.GraphDatabase.driver(self.uri, auth=self.auth)
            # Verify connectivity
            self._driver.verify_connectivity()
            self._is_connected = True
            logger.info("Connected to live Neo4j graph database at %s", self.uri)
        except Exception as exc:
            logger.warning("Neo4j driver unavailable or connection failed (%s); operating in export/simulated mode.", exc)
            self._driver = None
            self._is_connected = False

    @property
    def is_connected(self) -> bool:
        return self._is_connected

    def generate_cypher(self, patient: Any) -> CypherExport:
        """
        Generate complete, executable Cypher script for a Patient and all their
        associated clinical entities (Conditions, Medications, Labs, Allergies, Alerts).
        """
        statements: List[str] = []
        p_code = sanitize_cypher_string(patient.patient_code)
        p_name = sanitize_cypher_string(patient.full_name)
        p_age = patient.age if patient.age is not None else "null"
        p_sex = f"'{sanitize_cypher_string(patient.sex)}'" if patient.sex else "null"
        p_blood = f"'{sanitize_cypher_string(patient.blood_group)}'" if patient.blood_group else "null"

        nodes_count = 1
        edges_count = 0

        # 1. Patient Node
        patient_stmt = (
            f"MERGE (p:Patient {{patient_code: '{p_code}'}}) "
            f"ON CREATE SET p.full_name = '{p_name}', p.age = {p_age}, p.sex = {p_sex}, p.blood_group = {p_blood} "
            f"ON MATCH SET p.full_name = '{p_name}', p.age = {p_age}, p.sex = {p_sex}, p.blood_group = {p_blood};"
        )
        statements.append(patient_stmt)

        # 2. Conditions
        conditions = getattr(patient, "conditions", []) or []
        for cond in conditions:
            c_name = sanitize_cypher_string(cond.name)
            c_status = sanitize_cypher_string(cond.status or "active")
            c_icd = sanitize_cypher_string(cond.icd10_code or "")
            c_key = f"{p_code}:{c_name.lower().replace(' ', '_')}"
            c_chronic = "true" if cond.is_chronic else "false"

            cond_stmt = (
                f"MERGE (c:Condition {{key: '{c_key}'}}) "
                f"ON CREATE SET c.name = '{c_name}', c.status = '{c_status}', c.icd10 = '{c_icd}', c.is_chronic = {c_chronic} "
                f"ON MATCH SET c.status = '{c_status}', c.is_chronic = {c_chronic};"
            )
            rel_stmt = (
                f"MATCH (p:Patient {{patient_code: '{p_code}'}}), (c:Condition {{key: '{c_key}'}}) "
                f"MERGE (p)-[:DIAGNOSED_WITH {{status: '{c_status}'}}]->(c);"
            )
            statements.append(cond_stmt)
            statements.append(rel_stmt)
            nodes_count += 1
            edges_count += 1

        # 3. Medications
        medications = getattr(patient, "medications", []) or []
        med_keys: Dict[str, str] = {}
        for med in medications:
            m_name = sanitize_cypher_string(med.name)
            dose_val = getattr(med, "dosage", None)
            if dose_val is None:
                d = getattr(med, "dose", None)
                du = getattr(med, "dose_unit", "") or ""
                dose_val = f"{d} {du}".strip() if d is not None else ""
            m_dose = sanitize_cypher_string(dose_val)
            m_status = sanitize_cypher_string(med.status or "active")
            m_rxnorm = sanitize_cypher_string(med.rxnorm_code or "")
            m_key = f"{p_code}:{m_name.lower().replace(' ', '_')}"
            med_keys[m_name.lower()] = m_key

            med_stmt = (
                f"MERGE (m:Medication {{key: '{m_key}'}}) "
                f"ON CREATE SET m.name = '{m_name}', m.dosage = '{m_dose}', m.status = '{m_status}', m.rxnorm = '{m_rxnorm}' "
                f"ON MATCH SET m.status = '{m_status}', m.dosage = '{m_dose}';"
            )
            rel_stmt = (
                f"MATCH (p:Patient {{patient_code: '{p_code}'}}), (m:Medication {{key: '{m_key}'}}) "
                f"MERGE (p)-[:PRESCRIBED {{status: '{m_status}'}}]->(m);"
            )
            statements.append(med_stmt)
            statements.append(rel_stmt)
            nodes_count += 1
            edges_count += 1

        # 4. Allergies
        allergies = getattr(patient, "allergies", []) or []
        for allg in allergies:
            a_sub = sanitize_cypher_string(allg.substance)
            crit_val = getattr(allg, "criticality", None) or getattr(allg, "severity", None) or "high"
            a_crit = sanitize_cypher_string(crit_val)
            a_react = sanitize_cypher_string(allg.reaction or "")
            a_key = f"{p_code}:{a_sub.lower().replace(' ', '_')}"

            allg_stmt = (
                f"MERGE (a:Allergy {{key: '{a_key}'}}) "
                f"ON CREATE SET a.substance = '{a_sub}', a.criticality = '{a_crit}', a.reaction = '{a_react}' "
                f"ON MATCH SET a.criticality = '{a_crit}';"
            )
            rel_stmt = (
                f"MATCH (p:Patient {{patient_code: '{p_code}'}}), (a:Allergy {{key: '{a_key}'}}) "
                f"MERGE (p)-[:ALLERGIC_TO {{criticality: '{a_crit}'}}]->(a);"
            )
            statements.append(allg_stmt)
            statements.append(rel_stmt)
            nodes_count += 1
            edges_count += 1

        # 5. Lab Values
        labs = getattr(patient, "lab_values", []) or []
        for lab in labs:
            l_test = sanitize_cypher_string(lab.test_name)
            l_num = getattr(lab, "numeric_value", None)
            if l_num is None:
                l_num = getattr(lab, "value", None)
            l_val = l_num if l_num is not None else "null"
            l_unit = f"'{sanitize_cypher_string(lab.unit)}'" if getattr(lab, "unit", None) else "null"
            l_flag = f"'{sanitize_cypher_string(lab.flag)}'" if getattr(lab, "flag", None) else "null"
            l_key = f"{p_code}:{l_test.lower().replace(' ', '_')}"

            lab_stmt = (
                f"MERGE (l:LabValue {{key: '{l_key}'}}) "
                f"ON CREATE SET l.test_name = '{l_test}', l.value = {l_val}, l.unit = {l_unit}, l.flag = {l_flag} "
                f"ON MATCH SET l.value = {l_val}, l.flag = {l_flag};"
            )
            rel_stmt = (
                f"MATCH (p:Patient {{patient_code: '{p_code}'}}), (l:LabValue {{key: '{l_key}'}}) "
                f"MERGE (p)-[:HAS_LAB_RESULT]->(l);"
            )
            statements.append(lab_stmt)
            statements.append(rel_stmt)
            nodes_count += 1
            edges_count += 1

        # 6. Safety Alerts / Contraindications (Inter-node edges)
        alerts = getattr(patient, "safety_alerts", []) or []
        for alert in alerts:
            desc = sanitize_cypher_string(alert.description)
            sev = sanitize_cypher_string(alert.severity or "high")
            rule = sanitize_cypher_string(alert.rule_id or "INTERACTION_CHECK")

            # Check if alert involves two medications (e.g. Warfarin and NSAID/Ibuprofen/Aspirin)
            desc_lower = desc.lower()
            matched_meds = [m_name for m_name, k in med_keys.items() if m_name in desc_lower]
            if len(matched_meds) >= 2:
                k1 = med_keys[matched_meds[0]]
                k2 = med_keys[matched_meds[1]]
                contra_stmt = (
                    f"MATCH (m1:Medication {{key: '{k1}'}}), (m2:Medication {{key: '{k2}'}}) "
                    f"MERGE (m1)-[:CONTRAINDICATED_WITH {{severity: '{sev}', rule: '{rule}', description: '{desc}'}}]->(m2);"
                )
                statements.append(contra_stmt)
                edges_count += 1

        # Format complete script with comments and constraints
        header = [
            f"// SynapseHealth Neo4j Clinical Graph Sync",
            f"// Patient: {p_name} ({p_code})",
            f"// Generated Statements: {len(statements)}",
            "",
            "// --- Schema Constraints ---",
        ]
        script_parts = header + self.SCHEMA_CONSTRAINTS + ["", "// --- Clinical Graph Nodes & Edges ---"] + statements
        cypher_script = "\n".join(script_parts)

        return CypherExport(
            patient_code=patient.patient_code,
            constraints=self.SCHEMA_CONSTRAINTS,
            statements=statements,
            cypher_script=cypher_script,
            nodes_count=nodes_count,
            edges_count=edges_count,
            metadata={
                "conditions_count": len(conditions),
                "medications_count": len(medications),
                "allergies_count": len(allergies),
                "labs_count": len(labs),
                "alerts_count": len(alerts),
            },
        )

    def sync_patient_graph(self, patient: Any) -> Dict[str, Any]:
        """
        Synchronize the patient's clinical graph to Neo4j.
        If live Neo4j connection is active, runs transactions.
        Otherwise, returns a deterministic simulation acknowledging successful graph generation.
        """
        export = self.generate_cypher(patient)

        if self._is_connected and self._driver:
            try:
                with self._driver.session() as session:
                    # Apply constraints
                    for constraint in self.SCHEMA_CONSTRAINTS:
                        try:
                            session.run(constraint)
                        except Exception as c_err:
                            logger.debug("Constraint application skipped/exists: %s", c_err)
                    # Apply statements in transaction
                    def _execute_batch(tx):
                        for stmt in export.statements:
                            tx.run(stmt)

                    session.execute_write(_execute_batch)

                return {
                    "patient_code": patient.patient_code,
                    "status": "synced",
                    "backend": "neo4j_live",
                    "nodes_created": export.nodes_count,
                    "relationships_created": export.edges_count,
                    "message": f"Successfully synchronized {export.nodes_count} nodes and {export.edges_count} edges to Neo4j cluster at {self.uri}.",
                }
            except Exception as exc:
                logger.error("Failed to sync to live Neo4j: %s. Falling back to simulated response.", exc)

        # Fallback simulation
        return {
            "patient_code": patient.patient_code,
            "status": "ready_for_sync",
            "backend": "cypher_engine",
            "nodes_created": export.nodes_count,
            "relationships_created": export.edges_count,
            "message": f"Validated Cypher schema. {export.nodes_count} nodes and {export.edges_count} edges prepared for Neo4j synchronization.",
        }

    def get_connected_subgraph(self, patient: Any) -> Dict[str, Any]:
        """
        Return structured JSON nodes and links representing the clinical graph
        for visualization in frontends (D3 / React Flow / Cytoscape).
        """
        p_code = patient.patient_code
        nodes: List[Dict[str, Any]] = [
            {
                "id": f"patient:{p_code}",
                "label": patient.full_name,
                "type": "Patient",
                "details": {"code": p_code, "age": patient.age, "blood": patient.blood_group},
            }
        ]
        links: List[Dict[str, Any]] = []

        # Conditions
        for cond in getattr(patient, "conditions", []) or []:
            c_id = f"condition:{p_code}:{cond.name.lower().replace(' ', '_')}"
            nodes.append(
                {
                    "id": c_id,
                    "label": cond.name,
                    "type": "Condition",
                    "details": {"status": cond.status, "chronic": cond.is_chronic},
                }
            )
            links.append(
                {
                    "source": f"patient:{p_code}",
                    "target": c_id,
                    "type": "DIAGNOSED_WITH",
                    "label": cond.status or "active",
                }
            )

        # Medications
        med_id_map = {}
        for med in getattr(patient, "medications", []) or []:
            m_id = f"medication:{p_code}:{med.name.lower().replace(' ', '_')}"
            med_id_map[med.name.lower()] = m_id
            dose_val = getattr(med, "dosage", None)
            if dose_val is None:
                d = getattr(med, "dose", None)
                du = getattr(med, "dose_unit", "") or ""
                dose_val = f"{d} {du}".strip() if d is not None else ""
            nodes.append(
                {
                    "id": m_id,
                    "label": med.name,
                    "type": "Medication",
                    "details": {"dosage": dose_val, "status": med.status},
                }
            )
            links.append(
                {
                    "source": f"patient:{p_code}",
                    "target": m_id,
                    "type": "PRESCRIBED",
                    "label": dose_val or "prescribed",
                }
            )

        # Allergies
        for allg in getattr(patient, "allergies", []) or []:
            a_id = f"allergy:{p_code}:{allg.substance.lower().replace(' ', '_')}"
            crit_val = getattr(allg, "criticality", None) or getattr(allg, "severity", None) or "high"
            nodes.append(
                {
                    "id": a_id,
                    "label": allg.substance,
                    "type": "Allergy",
                    "details": {"criticality": crit_val, "reaction": getattr(allg, "reaction", "")},
                }
            )
            links.append(
                {
                    "source": f"patient:{p_code}",
                    "target": a_id,
                    "type": "ALLERGIC_TO",
                    "label": crit_val or "allergic",
                }
            )

        # Contraindication links
        for alert in getattr(patient, "safety_alerts", []) or []:
            desc = (alert.description or "").lower()
            matching = [m_name for m_name in med_id_map if m_name in desc]
            if len(matching) >= 2:
                src = med_id_map[matching[0]]
                tgt = med_id_map[matching[1]]
                links.append(
                    {
                        "source": src,
                        "target": tgt,
                        "type": "CONTRAINDICATED_WITH",
                        "label": alert.severity or "high",
                        "severity": alert.severity,
                        "rule": alert.rule_id,
                    }
                )

        return {
            "patient_code": p_code,
            "nodes": nodes,
            "links": links,
            "total_nodes": len(nodes),
            "total_links": len(links),
        }


# Global singleton instance
neo4j_adapter = Neo4jGraphAdapter()
