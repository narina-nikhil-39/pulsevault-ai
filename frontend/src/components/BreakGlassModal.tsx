import { useState } from 'react'
import { breakGlassOverride, type BreakGlassResponse } from '../api'

const CLINICAL_REASONS = [
  {
    code: 'TRAUMA_UNCONSCIOUS',
    label: 'Unconscious Trauma Victim (Severe trauma / Golden Hour triage)',
  },
  {
    code: 'CARDIAC_ARREST',
    label: 'Cardiac Arrest (Resuscitation with inaccessible history)',
  },
  {
    code: 'MASS_CASUALTY',
    label: 'Mass Casualty Incident (Unresponsive / unidentified patient)',
  },
  {
    code: 'UNRESPONSIVE_OVERDOSE',
    label: 'Suspected Overdose / Poisoning (Unconscious patient)',
  },
  {
    code: 'ACUTE_ANAPHYLAXIS',
    label: 'Severe Anaphylactic Shock (Urgent allergy / adrenaline review)',
  },
  {
    code: 'CRITICAL_HYPOXIA',
    label: 'Acute Respiratory Failure (Emergency airway & intubation triage)',
  },
]

interface BreakGlassModalProps {
  patientCode: string
  onSuccess: (res: BreakGlassResponse) => void
  onClose: () => void
}

export function BreakGlassModal({ patientCode, onSuccess, onClose }: BreakGlassModalProps) {
  const [doctorId, setDoctorId] = useState('DR-001')
  const [doctorPassword, setDoctorPassword] = useState('demo1234')
  const [nurseId, setNurseId] = useState('RN-001')
  const [nursePassword, setNursePassword] = useState('nurse1234')
  const [reasonCode, setReasonCode] = useState('TRAUMA_UNCONSCIOUS')
  const [justification, setJustification] = useState(
    'Unconscious trauma patient with severe blood loss, no relatives or phone available.',
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const response = await breakGlassOverride({
        patient_code: patientCode,
        doctor_id: doctorId.trim(),
        doctor_password: doctorPassword,
        nurse_cosigner_id: nurseId.trim(),
        nurse_password: nursePassword,
        clinical_reason_code: reasonCode,
        justification_notes: justification.trim(),
      })
      onSuccess(response)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Emergency authorization failed.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-xl rounded-xl border border-red-500/50 bg-slate-950 p-6 shadow-2xl shadow-red-950/40">
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-red-500/40 bg-red-500/10 text-xl font-bold text-red-400">
              🚨
            </span>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-white">
                Emergency Break-Glass Override
              </h2>
              <p className="text-xs text-red-300/80">
                Target Patient:{' '}
                <span className="font-mono font-semibold text-white">{patientCode}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 transition hover:text-white"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        <div className="mb-4 rounded-lg border border-red-900/60 bg-red-950/40 p-3 text-xs leading-relaxed text-red-200">
          <strong className="font-semibold text-red-400">CRITICAL STATUTORY NOTICE:</strong> This
          override issues a strictly audited 60-minute ephemeral emergency token. An immutable
          SHA-256 block hash will be permanently recorded in the cryptographic audit ledger.
        </div>

        {error ? (
          <div className="mb-4 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Attending Physician ID
              </label>
              <input
                type="text"
                value={doctorId}
                onChange={(e) => setDoctorId(e.target.value)}
                required
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-red-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Physician Password / PIN
              </label>
              <input
                type="password"
                value={doctorPassword}
                onChange={(e) => setDoctorPassword(e.target.value)}
                required
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-red-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Charge Nurse Co-Signer ID
              </label>
              <input
                type="text"
                value={nurseId}
                onChange={(e) => setNurseId(e.target.value)}
                required
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-red-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-300">
                Nurse Password / PIN
              </label>
              <input
                type="password"
                value={nursePassword}
                onChange={(e) => setNursePassword(e.target.value)}
                required
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-red-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">
              Clinical Reason Code
            </label>
            <select
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-red-500 focus:outline-none"
            >
              {CLINICAL_REASONS.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.code} — {r.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">
              Clinical Emergency Justification Notes
            </label>
            <textarea
              rows={2}
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              required
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-red-500 focus:outline-none"
            />
          </div>

          <div className="mt-5 flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 transition hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2 text-xs font-semibold text-white shadow-lg shadow-red-600/30 transition hover:bg-red-500 disabled:opacity-50"
            >
              {loading ? 'Authenticating & Sealing...' : 'Execute Break-Glass Override'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
