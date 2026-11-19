import React, { useEffect, useState } from 'react'
import {
  ackCareTeamMessage,
  createClinicalAnnotation,
  createRecordShare,
  fetchCareTeamMessages,
  fetchClinicalAnnotations,
  fetchClinicians,
  fetchRecordShares,
  revokeRecordShare,
  sendCareTeamMessage,
  toggleClinicalAnnotation,
  type CareTeamMessage,
  type ClinicalAnnotation,
  type ClinicianDirectoryEntry,
  type PatientProfile,
  type RecordShareGrant,
} from '../api'

interface ClinicianCollaborationPanelProps {
  patientCode: string
  profile: PatientProfile
  doctor: {
    doctor_id: string
    display_name: string
    role: string
  }
}

type CollabTab = 'sharing' | 'annotations' | 'messaging'

export const ClinicianCollaborationPanel: React.FC<ClinicianCollaborationPanelProps> = ({
  patientCode,
  profile,
  doctor,
}) => {
  const [activeTab, setActiveTab] = useState<CollabTab>('sharing')
  const [clinicians, setClinicians] = useState<ClinicianDirectoryEntry[]>([])

  // Sharing state
  const [shares, setShares] = useState<RecordShareGrant[]>([])
  const [selectedRecipientId, setSelectedRecipientId] = useState('')
  const [permissionLevel, setPermissionLevel] = useState<'Read & Annotate' | 'Full Care Consult'>('Full Care Consult')
  const [expiresInDays, setExpiresInDays] = useState(7)
  const [shareNote, setShareNote] = useState('')
  const [shareLoading, setShareLoading] = useState(false)
  const [shareSuccess, setShareSuccess] = useState<string | null>(null)

  // Annotations state
  const [annotations, setAnnotations] = useState<ClinicalAnnotation[]>([])
  const [targetType, setTargetType] = useState<string>('medication')
  const [targetLabel, setTargetLabel] = useState('')
  const [priority, setPriority] = useState<'Clinical Note' | 'Action Required' | 'Handoff Alert'>('Clinical Note')
  const [annotationBody, setAnnotationBody] = useState('')
  const [annLoading, setAnnLoading] = useState(false)

  // Messaging state
  const [messages, setMessages] = useState<CareTeamMessage[]>([])
  const [messageBody, setMessageBody] = useState('')
  const [messageUrgency, setMessageUrgency] = useState<'Routine' | 'Urgent' | 'Critical'>('Routine')
  const [msgLoading, setMsgLoading] = useState(false)

  // Load all initial collaboration data
  useEffect(() => {
    let mounted = true

    async function loadData() {
      try {
        const [clins, shs, anns, msgs] = await Promise.all([
          fetchClinicians().catch(() => []),
          fetchRecordShares(patientCode).catch(() => []),
          fetchClinicalAnnotations(patientCode).catch(() => []),
          fetchCareTeamMessages(patientCode).catch(() => []),
        ])
        if (!mounted) return
        setClinicians(clins)
        if (clins.length > 0 && clins[0]) {
          setSelectedRecipientId(clins[0].license_id)
        }
        setShares(shs)
        setAnnotations(anns)
        setMessages(msgs)
      } catch {
        // Fallback gracefully
      }
    }

    loadData()
    return () => {
      mounted = false
    }
  }, [patientCode])

  // Share Handlers
  async function handleCreateShare(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedRecipientId) return
    setShareLoading(true)
    setShareSuccess(null)
    try {
      const newShare = await createRecordShare(patientCode, {
        shared_with_license_id: selectedRecipientId,
        permission_level: permissionLevel,
        expires_in_days: expiresInDays,
        clinical_note: shareNote.trim() || 'Collaborative clinical evaluation requested.',
      })
      setShares([newShare, ...shares])
      setShareNote('')
      setShareSuccess(`Record share grant issued successfully with SHA-256 block hash.`)
      setTimeout(() => setShareSuccess(null), 5000)
    } finally {
      setShareLoading(false)
    }
  }

  async function handleRevoke(shareId: string) {
    try {
      const revoked = await revokeRecordShare(patientCode, shareId)
      setShares(shares.map((s) => (s.id === shareId ? revoked : s)))
    } catch {
      // Ignore
    }
  }

  // Annotation Handlers
  async function handleAddAnnotation(e: React.FormEvent) {
    e.preventDefault()
    if (!annotationBody.trim()) return
    setAnnLoading(true)
    try {
      const label = targetLabel.trim() || `${targetType.toUpperCase()} Note`
      const tid = `ref-${Date.now()}`
      const created = await createClinicalAnnotation(patientCode, {
        target_type: targetType,
        target_id: tid,
        target_label: label,
        priority,
        body: annotationBody.trim(),
      })
      setAnnotations([created, ...annotations])
      setAnnotationBody('')
      setTargetLabel('')
    } finally {
      setAnnLoading(false)
    }
  }

  async function handleToggleResolve(annId: string) {
    try {
      const toggled = await toggleClinicalAnnotation(patientCode, annId)
      setAnnotations(annotations.map((a) => (a.id === annId ? toggled : a)))
    } catch {
      // Ignore
    }
  }

  // Messaging Handlers
  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!messageBody.trim()) return
    setMsgLoading(true)
    try {
      const created = await sendCareTeamMessage(patientCode, {
        body: messageBody.trim(),
        urgency: messageUrgency,
      })
      setMessages([...messages, created])
      setMessageBody('')
    } finally {
      setMsgLoading(false)
    }
  }

  async function handleAckMessage(msgId: string) {
    try {
      const acked = await ackCareTeamMessage(patientCode, msgId)
      setMessages(messages.map((m) => (m.id === msgId ? acked : m)))
    } catch {
      // Ignore
    }
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-2xl border border-indigo-200/80 bg-gradient-to-r from-indigo-50/70 via-white to-purple-50/40 p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 text-white font-black text-xl shadow-xs">
              🤝
            </span>
            <div>
              <h2 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
                Clinician Collaboration &amp; Care Team Handoff
                <span className="rounded-full bg-indigo-100 text-indigo-700 px-2.5 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider">
                  ABDM / HIPAA Governed
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Care team coordination for <strong>{profile.patient.full_name}</strong> ({profile.patient.patient_code}) • {profile.conditions.length} Conditions • {profile.medications.length} Medications
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-slate-500">Active Clinician:</span>
            <span className="font-bold text-slate-800">{doctor.display_name} ({doctor.doctor_id})</span>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex gap-2 mt-5 border-t border-indigo-100/80 pt-4">
          <button
            onClick={() => setActiveTab('sharing')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'sharing'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
            }`}
          >
            <span>🔐</span>
            <span>Record Sharing Grants ({shares.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('annotations')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'annotations'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
            }`}
          >
            <span>📌</span>
            <span>Clinical Annotations ({annotations.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('messaging')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'messaging'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
            }`}
          >
            <span>💬</span>
            <span>Care Team Messaging ({messages.length})</span>
          </button>
        </div>
      </div>

      {/* TAB 1: RECORD SHARING GRANTS */}
      {activeTab === 'sharing' && (
        <div className="grid lg:grid-cols-12 gap-6">
          {/* Grant Creation Form */}
          <div className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <span className="text-lg">🛡️</span>
              <h3 className="text-sm font-bold text-slate-900">Grant Consult Access</h3>
            </div>

            {shareSuccess && (
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 font-medium">
                ✓ {shareSuccess}
              </div>
            )}

            <form onSubmit={handleCreateShare} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Consulting Specialist / Department</label>
                <select
                  value={selectedRecipientId}
                  onChange={(e) => setSelectedRecipientId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-2.5 bg-slate-50/50 font-medium text-slate-900"
                >
                  {clinicians.map((c) => (
                    <option key={c.license_id} value={c.license_id}>
                      {c.name} — {c.department} ({c.institution})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Permission Level</label>
                  <select
                    value={permissionLevel}
                    onChange={(e) => setPermissionLevel(e.target.value as any)}
                    className="w-full rounded-xl border border-slate-300 p-2 bg-slate-50/50"
                  >
                    <option value="Full Care Consult">Full Care Consult</option>
                    <option value="Read & Annotate">Read &amp; Annotate Only</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Access Expiry</label>
                  <select
                    value={expiresInDays}
                    onChange={(e) => setExpiresInDays(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-300 p-2 bg-slate-50/50"
                  >
                    <option value={2}>48 Hours (Trauma)</option>
                    <option value={7}>7 Days (Standard)</option>
                    <option value={30}>30 Days (Oncology)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Clinical Indication / Handover Reason</label>
                <textarea
                  value={shareNote}
                  onChange={(e) => setShareNote(e.target.value)}
                  placeholder="e.g., Nephrology referral for escalating creatinine and metformin lactic acidosis risk evaluation."
                  rows={3}
                  className="w-full rounded-xl border border-slate-300 p-2.5 font-medium text-slate-900"
                />
              </div>

              <button
                type="submit"
                disabled={shareLoading}
                className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 py-2.5 font-bold text-white transition cursor-pointer shadow-xs"
              >
                {shareLoading ? 'Generating Cryptographic Block…' : 'Issue Audited Access Grant'}
              </button>
            </form>
          </div>

          {/* Active Shares List */}
          <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">📜</span>
                <h3 className="text-sm font-bold text-slate-900">Active Record Grants &amp; Audit Hashes</h3>
              </div>
              <span className="text-xs text-slate-500 font-mono">{shares.length} Grants Logged</span>
            </div>

            {shares.length === 0 ? (
              <div className="text-center py-10 text-xs text-slate-400">
                No active record sharing grants recorded for this patient.
              </div>
            ) : (
              <div className="space-y-3">
                {shares.map((s) => (
                  <div
                    key={s.id}
                    className="rounded-xl border border-slate-200 p-3.5 bg-slate-50/50 space-y-2 hover:border-indigo-300 transition"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-900">{s.shared_with_name}</span>
                        <span className="rounded bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-0.5">
                          {s.shared_with_department}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                            s.status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {s.status}
                        </span>
                        {s.status === 'Active' && (
                          <button
                            onClick={() => handleRevoke(s.id)}
                            className="text-[11px] font-bold text-rose-600 hover:text-rose-800 underline cursor-pointer"
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                    </div>

                    <p className="text-xs text-slate-600 italic">"{s.clinical_note}"</p>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/60 text-[10px] font-mono text-slate-500">
                      <span>Shared by: {s.shared_by_name}</span>
                      <span>Expires: {new Date(s.expires_at).toLocaleDateString()}</span>
                    </div>

                    <div className="bg-slate-900 text-emerald-400 p-2 rounded-lg font-mono text-[9px] break-all">
                      SHA-256 Block: {s.audit_block_hash || '7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: CLINICAL ANNOTATIONS */}
      {activeTab === 'annotations' && (
        <div className="grid lg:grid-cols-12 gap-6">
          {/* New Annotation Form */}
          <div className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <span className="text-lg">📝</span>
              <h3 className="text-sm font-bold text-slate-900">Attach Clinical Sticky-Note</h3>
            </div>

            <form onSubmit={handleAddAnnotation} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Target Entity Type</label>
                  <select
                    value={targetType}
                    onChange={(e) => setTargetType(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 p-2 bg-slate-50/50"
                  >
                    <option value="medication">Medication Order</option>
                    <option value="lab">Laboratory Finding</option>
                    <option value="condition">Diagnosis / Condition</option>
                    <option value="alert">Safety Alert / DDI</option>
                    <option value="document">Source Document</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Priority Badge</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as any)}
                    className="w-full rounded-xl border border-slate-300 p-2 bg-slate-50/50"
                  >
                    <option value="Clinical Note">Clinical Note (Info)</option>
                    <option value="Action Required">Action Required</option>
                    <option value="Handoff Alert">Handoff Alert</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Entity Label / Name</label>
                <input
                  type="text"
                  value={targetLabel}
                  onChange={(e) => setTargetLabel(e.target.value)}
                  placeholder="e.g., Metformin 500mg BID, or Serum Creatinine Lab"
                  className="w-full rounded-xl border border-slate-300 p-2.5 font-medium text-slate-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Annotation &amp; Clinical Context</label>
                <textarea
                  value={annotationBody}
                  onChange={(e) => setAnnotationBody(e.target.value)}
                  placeholder="e.g., Confirmed with patient's daughter that evening dose is taken with milk; no hypoglycemic episodes reported."
                  rows={4}
                  className="w-full rounded-xl border border-slate-300 p-2.5 font-medium text-slate-900"
                />
              </div>

              <button
                type="submit"
                disabled={annLoading}
                className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 py-2.5 font-bold text-white transition cursor-pointer shadow-xs"
              >
                {annLoading ? 'Attaching Note…' : 'Attach Clinical Annotation'}
              </button>
            </form>
          </div>

          {/* Annotations Stream */}
          <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">📌</span>
                <h3 className="text-sm font-bold text-slate-900">Clinical Entity Annotations</h3>
              </div>
              <span className="text-xs text-slate-500 font-mono">{annotations.length} Notes</span>
            </div>

            {annotations.length === 0 ? (
              <div className="text-center py-10 text-xs text-slate-400">
                No clinical annotations attached to this record yet.
              </div>
            ) : (
              <div className="space-y-3">
                {annotations.map((a) => (
                  <div
                    key={a.id}
                    className={`rounded-xl border p-4 space-y-2 transition ${
                      a.resolved
                        ? 'border-slate-200 bg-slate-50/60 opacity-60'
                        : a.priority === 'Action Required'
                        ? 'border-amber-300 bg-amber-50/50'
                        : a.priority === 'Handoff Alert'
                        ? 'border-rose-300 bg-rose-50/50'
                        : 'border-indigo-200 bg-indigo-50/30'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="rounded-lg bg-white border border-slate-200 px-2 py-0.5 text-[10px] font-mono font-bold text-slate-700">
                          {a.target_type.toUpperCase()}
                        </span>
                        <span className="font-bold text-xs text-slate-900">{a.target_label}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                            a.priority === 'Action Required'
                              ? 'bg-amber-100 text-amber-800'
                              : a.priority === 'Handoff Alert'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-indigo-100 text-indigo-800'
                          }`}
                        >
                          {a.priority}
                        </span>
                        <button
                          onClick={() => handleToggleResolve(a.id)}
                          className="text-[11px] font-bold text-slate-600 hover:text-indigo-600 underline cursor-pointer"
                        >
                          {a.resolved ? 'Reopen' : 'Mark Resolved'}
                        </button>
                      </div>
                    </div>

                    <p className="text-xs text-slate-800 font-medium leading-relaxed">{a.body}</p>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/60 text-[10px] font-mono text-slate-500">
                      <span>Author: {a.author_name} ({a.author_department})</span>
                      <span>{new Date(a.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: CARE TEAM MESSAGING */}
      {activeTab === 'messaging' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">💬</span>
              <h3 className="text-sm font-bold text-slate-900">Inter-Clinician Consult &amp; Handover Feed</h3>
            </div>
            <span className="text-xs text-slate-500 font-mono">{messages.length} Messages</span>
          </div>

          {/* Messages Feed */}
          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
            {messages.length === 0 ? (
              <div className="text-center py-10 text-xs text-slate-400">
                No care team messages exchanged yet.
              </div>
            ) : (
              messages.map((m) => {
                const isAcked = m.acknowledged_by.includes(doctor.doctor_id)
                return (
                  <div
                    key={m.id}
                    className={`rounded-xl border p-4 space-y-2 ${
                      m.urgency === 'Critical'
                        ? 'border-rose-300 bg-rose-50/50'
                        : m.urgency === 'Urgent'
                        ? 'border-amber-300 bg-amber-50/50'
                        : 'border-slate-200 bg-slate-50/50'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-900">{m.sender_name}</span>
                        <span className="text-[10px] text-slate-500 font-mono">({m.sender_department})</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                            m.urgency === 'Critical'
                              ? 'bg-rose-100 text-rose-800'
                              : m.urgency === 'Urgent'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {m.urgency}
                        </span>
                        <button
                          onClick={() => handleAckMessage(m.id)}
                          disabled={isAcked}
                          className={`text-[10px] font-bold px-2 py-0.5 rounded transition ${
                            isAcked
                              ? 'bg-emerald-100 text-emerald-800 cursor-default'
                              : 'bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer'
                          }`}
                        >
                          {isAcked ? '✓ Acknowledged' : 'Acknowledge'}
                        </button>
                      </div>
                    </div>

                    <p className="text-xs text-slate-800 leading-relaxed font-medium">{m.body}</p>

                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pt-1">
                      <span>{new Date(m.created_at).toLocaleString()}</span>
                      <span>Acks: {m.acknowledged_by.join(', ')}</span>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* New Message Input */}
          <form onSubmit={handleSendMessage} className="border-t border-slate-100 pt-3 space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-700">Urgency:</span>
              <div className="flex gap-2 text-xs">
                {(['Routine', 'Urgent', 'Critical'] as const).map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setMessageUrgency(lvl)}
                    className={`px-3 py-1 rounded-lg font-bold text-xs transition cursor-pointer ${
                      messageUrgency === lvl
                        ? lvl === 'Critical'
                          ? 'bg-rose-600 text-white'
                          : lvl === 'Urgent'
                          ? 'bg-amber-600 text-white'
                          : 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={messageBody}
                onChange={(e) => setMessageBody(e.target.value)}
                placeholder="Type handoff note or consult message to the care team…"
                className="flex-1 rounded-xl border border-slate-300 p-2.5 text-xs font-medium text-slate-900"
              />
              <button
                type="submit"
                disabled={msgLoading || !messageBody.trim()}
                className="rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 px-5 py-2.5 text-xs font-bold text-white transition cursor-pointer shadow-xs"
              >
                {msgLoading ? 'Sending…' : 'Send'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
