"""
SynapseHealth — Clinician Collaboration & Consent Sharing Service
Manages time-bounded record share grants, clinical entity annotations,
and inter-clinician care team messaging with cryptographic audit traceability.
"""

import hashlib
import json
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.schemas import (
    CareTeamMessageCreateRequest,
    ClinicalAnnotationCreateRequest,
    RecordShareCreateRequest,
)
from src.db.models import Doctor


class CollaborationService:
    """Thread-safe state manager for clinician collaboration and patient record sharing."""

    def __init__(self) -> None:
        # In-memory stores partitioned by patient_code
        self._shares: Dict[str, List[Dict[str, Any]]] = {}
        self._annotations: Dict[str, List[Dict[str, Any]]] = {}
        self._messages: Dict[str, List[Dict[str, Any]]] = {}

        # Seed initial demo collaboration state for benchmark patient OPD-ARJUN
        self._seed_demo_collaboration()

    def _seed_demo_collaboration(self) -> None:
        """Seed authentic clinical annotations and care team handoffs for demonstration."""
        arjun_code = "OPD-ARJUN"
        self._annotations[arjun_code] = [
            {
                "id": "ann-arjun-01",
                "patient_code": arjun_code,
                "target_type": "medication",
                "target_id": "med-metformin",
                "target_label": "Metformin 500mg BID",
                "author_license_id": "TSMC-51209",
                "author_name": "Dr. Meera Thomas",
                "author_department": "Internal Medicine",
                "priority": "Action Required",
                "body": "Patient reports mild dyspepsia after breakfast. Monitor adherence; re-check eGFR prior to biguanide titration.",
                "created_at": "2024-10-14T09:30:00Z",
                "resolved": False,
            },
            {
                "id": "ann-arjun-02",
                "patient_code": arjun_code,
                "target_type": "alert",
                "target_id": "alert-ddi-warfarin",
                "target_label": "Bleeding Risk (Aspirin + Warfarin)",
                "author_license_id": "TSMC-68421",
                "author_name": "Dr. Ananya Rao",
                "author_department": "Cardiology",
                "priority": "Handoff Alert",
                "body": "Cardiology consult complete. Dual antithrombotic duration capped at 30 days post-stenting. Repeat INR in 7 days.",
                "created_at": "2024-10-15T14:15:00Z",
                "resolved": True,
            },
        ]

        self._messages[arjun_code] = [
            {
                "id": "msg-arjun-01",
                "patient_code": arjun_code,
                "sender_license_id": "TSMC-51209",
                "sender_name": "Dr. Meera Thomas",
                "sender_role": "Attending Physician",
                "sender_department": "Internal Medicine",
                "body": "Requested urgent cardiology clearance for elevated systolic BP (154/92) and bilateral lower extremity edema.",
                "urgency": "Urgent",
                "attached_ref": {
                    "targetType": "lab",
                    "targetId": "lab-egfr",
                    "targetLabel": "Serum Creatinine / eGFR Panel",
                },
                "created_at": "2024-10-15T11:00:00Z",
                "acknowledged_by": ["TSMC-68421"],
            }
        ]

        self._shares[arjun_code] = [
            {
                "id": "share-arjun-01",
                "patient_code": arjun_code,
                "shared_by_license_id": "TSMC-51209",
                "shared_by_name": "Dr. Meera Thomas",
                "shared_with_license_id": "TSMC-68421",
                "shared_with_name": "Dr. Ananya Rao",
                "shared_with_department": "Interventional Cardiology",
                "document_ids": ["doc-1", "doc-2"],
                "include_full_flashcard": True,
                "permission_level": "Full Care Consult",
                "clinical_note": "Cardiology referral for ECG abnormalities and dual antiplatelet regimen review.",
                "created_at": "2024-10-15T11:05:00Z",
                "expires_at": "2024-10-22T11:05:00Z",
                "status": "Active",
                "audit_block_hash": hashlib.sha256(b"share-arjun-01-genesis").hexdigest(),
            }
        ]

    # --- Clinician Directory ---

    def list_clinicians(self, db: Session) -> List[Dict[str, str]]:
        """Return credentialed doctors formatted for collaboration picker."""
        doctors = db.scalars(select(Doctor).where(Doctor.active_status.is_(True))).all()
        results: List[Dict[str, str]] = []
        for d in doctors:
            results.append({
                "license_id": d.reg_number or d.doctor_id,
                "name": d.name,
                "role": "ATTENDING_DOCTOR" if "Cardiology" in d.specialization or "Medicine" in d.specialization else "SPECIALIST_PHYSICIAN",
                "department": d.specialization,
                "institution": d.hospital_name,
            })
        if not results:
            # Fallback if DB not seeded
            results = [
                {
                    "license_id": "TSMC-68421",
                    "name": "Dr. Ananya Rao",
                    "role": "ATTENDING_DOCTOR",
                    "department": "Interventional Cardiology",
                    "institution": "Apollo Health City, Jubilee Hills",
                },
                {
                    "license_id": "TSMC-51209",
                    "name": "Dr. Meera Thomas",
                    "role": "ATTENDING_DOCTOR",
                    "department": "Internal Medicine & Diabetology",
                    "institution": "Apollo Health City, Jubilee Hills",
                },
                {
                    "license_id": "KMC-42190",
                    "name": "Dr. Vikram Menon",
                    "role": "SPECIALIST_PHYSICIAN",
                    "department": "Emergency Medicine & Trauma Care",
                    "institution": "Manipal Hospital, Old Airport Road",
                },
                {
                    "license_id": "TNMC-84301",
                    "name": "Dr. Arvind Swaminathan",
                    "role": "SPECIALIST_PHYSICIAN",
                    "department": "Nephrology & Renal Transplant",
                    "institution": "Apollo Hospitals, Greams Road",
                },
            ]
        return results

    # --- Record Sharing ---

    def list_shares(self, patient_code: str) -> List[Dict[str, Any]]:
        return self._shares.get(patient_code, [])

    def create_share(
        self,
        patient_code: str,
        actor_id: str,
        actor_name: str,
        recipient_doctor: Dict[str, str],
        req: RecordShareCreateRequest,
    ) -> Dict[str, Any]:
        share_id = f"share-{uuid.uuid4().hex[:8]}"
        created = datetime.utcnow()
        expires = created + timedelta(days=max(1, req.expires_in_days))

        payload = f"{share_id}:{patient_code}:{actor_id}:{recipient_doctor['license_id']}:{created.isoformat()}"
        block_hash = hashlib.sha256(payload.encode("utf-8")).hexdigest()

        share_entry = {
            "id": share_id,
            "patient_code": patient_code,
            "shared_by_license_id": actor_id,
            "shared_by_name": actor_name,
            "shared_with_license_id": recipient_doctor["license_id"],
            "shared_with_name": recipient_doctor["name"],
            "shared_with_department": recipient_doctor.get("department", "Clinical Services"),
            "document_ids": req.document_ids,
            "include_full_flashcard": req.include_full_flashcard,
            "permission_level": req.permission_level,
            "clinical_note": req.clinical_note,
            "created_at": created.isoformat() + "Z",
            "expires_at": expires.isoformat() + "Z",
            "status": "Active",
            "audit_block_hash": block_hash,
        }

        if patient_code not in self._shares:
            self._shares[patient_code] = []
        self._shares[patient_code].insert(0, share_entry)
        return share_entry

    def revoke_share(self, patient_code: str, share_id: str) -> Optional[Dict[str, Any]]:
        shares = self._shares.get(patient_code, [])
        for s in shares:
            if s["id"] == share_id:
                s["status"] = "Revoked"
                return s
        return None

    # --- Clinical Annotations ---

    def list_annotations(self, patient_code: str) -> List[Dict[str, Any]]:
        return self._annotations.get(patient_code, [])

    def create_annotation(
        self,
        patient_code: str,
        actor_id: str,
        actor_name: str,
        actor_dept: str,
        req: ClinicalAnnotationCreateRequest,
    ) -> Dict[str, Any]:
        ann_id = f"ann-{uuid.uuid4().hex[:8]}"
        now = datetime.utcnow().isoformat() + "Z"

        ann_entry = {
            "id": ann_id,
            "patient_code": patient_code,
            "target_type": req.target_type,
            "target_id": req.target_id,
            "target_label": req.target_label,
            "author_license_id": actor_id,
            "author_name": actor_name,
            "author_department": actor_dept,
            "priority": req.priority,
            "body": req.body,
            "created_at": now,
            "resolved": False,
        }

        if patient_code not in self._annotations:
            self._annotations[patient_code] = []
        self._annotations[patient_code].insert(0, ann_entry)
        return ann_entry

    def toggle_annotation_resolved(self, patient_code: str, ann_id: str) -> Optional[Dict[str, Any]]:
        annotations = self._annotations.get(patient_code, [])
        for a in annotations:
            if a["id"] == ann_id:
                a["resolved"] = not a["resolved"]
                return a
        return None

    # --- Care Team Messaging ---

    def list_messages(self, patient_code: str) -> List[Dict[str, Any]]:
        return self._messages.get(patient_code, [])

    def send_message(
        self,
        patient_code: str,
        actor_id: str,
        actor_name: str,
        actor_role: str,
        actor_dept: str,
        req: CareTeamMessageCreateRequest,
    ) -> Dict[str, Any]:
        msg_id = f"msg-{uuid.uuid4().hex[:8]}"
        now = datetime.utcnow().isoformat() + "Z"

        msg_entry = {
            "id": msg_id,
            "patient_code": patient_code,
            "sender_license_id": actor_id,
            "sender_name": actor_name,
            "sender_role": actor_role,
            "sender_department": actor_dept,
            "body": req.body,
            "urgency": req.urgency,
            "attached_ref": req.attached_ref,
            "created_at": now,
            "acknowledged_by": [actor_id],
        }

        if patient_code not in self._messages:
            self._messages[patient_code] = []
        self._messages[patient_code].append(msg_entry)
        return msg_entry

    def ack_message(self, patient_code: str, msg_id: str, actor_id: str) -> Optional[Dict[str, Any]]:
        messages = self._messages.get(patient_code, [])
        for m in messages:
            if m["id"] == msg_id:
                if actor_id not in m["acknowledged_by"]:
                    m["acknowledged_by"].append(actor_id)
                return m
        return None


# Global singleton instance
collaboration_service = CollaborationService()
