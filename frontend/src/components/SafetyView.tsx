import { useState } from 'react'
import {
  simulatePrescription,
  type PatientProfile,
  type SafetyAlert,
  type SafetySimulateResult,
} from '../api'
import { severityLabel, tone } from '../format'
import { Empty, Panel, SeverityChip, Stat } from './Primitives'

function AlertCard({ alert }: { alert: SafetyAlert }) {
  const palette = tone(alert.severity)
  const involvedList = Array.isArray(alert.involved)
    ? alert.involved
    : typeof alert.involved === 'string'
    ? (alert.involved as string).split(',').map((s) => s.trim()).filter(Boolean)
    : []

  return (
    <li className={`rounded-lg border bg-slate-950/40 p-3 ${palette.border}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-100">{alert.title}</div>
          <div className="mt-0.5 text-[11px] text-slate-500 uppercase">{alert.category}</div>
        </div>
        <SeverityChip severity={alert.severity} />
      </div>

      {alert.detail ? <p className="mt-2 text-xs text-slate-400">{alert.detail}</p> : null}

      {involvedList.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {involvedList.map((item) => (
            <span
              key={item}
              className="chip border-slate-700 bg-slate-900 text-[11px] text-slate-300"
            >
              {item}
            </span>
          ))}
        </div>
      ) : null}

      {alert.recommendation ? (
        <p className={`mt-2 border-l-2 pl-2.5 text-xs ${palette.text}`}>
          {alert.recommendation}
        </p>
      ) : null}
    </li>
  )
}

/**
 * Safety findings for the patient.
 *
 * Every alert here is produced by the deterministic rule engine, never by a language model,
 * so the same record always yields the same alerts and each one is explainable and testable.
 */
export function SafetyView({ profile }: { profile: PatientProfile }) {
  const alerts = profile.safety_alerts
  const bySeverity = (level: string) => alerts.filter((alert) => alert.severity === level).length
  const critical = bySeverity('critical')
  const high = bySeverity('high')

  // Live "What-If" Prescription Simulator State
  const [candidateDrug, setCandidateDrug] = useState('')
  const [candidateDose, setCandidateDose] = useState('')
  const [evaluating, setEvaluating] = useState(false)
  const [simResult, setSimResult] = useState<SafetySimulateResult | null>(null)
  const [simError, setSimError] = useState<string | null>(null)

  async function handleSimulate(drugName?: string, drugDose?: string) {
    const targetDrug = (drugName || candidateDrug).trim()
    const targetDose = drugDose !== undefined ? drugDose : candidateDose
    if (!targetDrug) return

    setEvaluating(true)
    setSimError(null)
    try {
      const res = await simulatePrescription(profile.patient.patient_code, targetDrug, targetDose)
      setSimResult(res)
    } catch (err: unknown) {
      setSimError(err instanceof Error ? err.message : 'Simulation failed')
    } finally {
      setEvaluating(false)
    }
  }

  const ordered = [...alerts].sort((left, right) => {
    const rank: Record<string, number> = { critical: 0, high: 1, moderate: 2, low: 3 }
    return (rank[left.severity] ?? 4) - (rank[right.severity] ?? 4)
  })

  return (
    <div className="space-y-4">
      {/* Interactive "What-If" Prospective Prescription Simulator */}
      <div className="rounded-2xl border-2 border-indigo-200/90 bg-gradient-to-br from-indigo-50/70 via-white to-blue-50/40 p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-600 text-white font-bold text-sm shadow-xs">
              ⚡
            </span>
            <div>
              <h3 className="text-sm font-black text-slate-900 tracking-tight">
                Live &quot;What-If&quot; Prescription Simulator
              </h3>
              <p className="text-[11px] text-slate-500">
                Test prospective prescriptions against active drugs, allergies, and organ function with zero hallucination.
              </p>
            </div>
          </div>
          <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-[10px] font-bold text-indigo-700 font-mono">
            Deterministic Engine
          </span>
        </div>

        {/* Prescription Input Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void handleSimulate()
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              value={candidateDrug}
              onChange={(e) => setCandidateDrug(e.target.value)}
              placeholder="Candidate Drug Name (e.g. Aspirin, Amoxicillin, Metformin)..."
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div className="w-28">
            <input
              type="text"
              value={candidateDose}
              onChange={(e) => setCandidateDose(e.target.value)}
              placeholder="Dose (325mg)"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={evaluating || !candidateDrug.trim()}
            className="rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 px-4 py-2 text-xs font-bold text-white transition cursor-pointer shadow-xs"
          >
            {evaluating ? 'Simulating…' : 'Evaluate Safety Interlock'}
          </button>
        </form>

        {/* Quick Test Chips */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
          <span className="text-slate-400 font-semibold mr-1">Quick Scenarios:</span>
          {[
            { drug: 'Aspirin', dose: '325mg', label: 'Aspirin (DDI test)' },
            { drug: 'Amoxicillin', dose: '500mg', label: 'Amoxicillin (Allergy test)' },
            { drug: 'Metformin', dose: '1000mg', label: 'Metformin (Renal test)' },
            { drug: 'Ibuprofen', dose: '400mg', label: 'Ibuprofen (Bleed test)' },
            { drug: 'Lisinopril', dose: '20mg', label: 'Lisinopril (Duplication)' },
          ].map((item) => (
            <button
              key={item.drug}
              type="button"
              onClick={() => {
                setCandidateDrug(item.drug)
                setCandidateDose(item.dose)
                void handleSimulate(item.drug, item.dose)
              }}
              className="rounded-lg bg-white border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/50 px-2.5 py-1 text-slate-700 font-medium transition cursor-pointer shadow-2xs"
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Simulation Error */}
        {simError && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
            {simError}
          </div>
        )}

        {/* Simulation Outcome Card */}
        {simResult && (
          <div
            className={`rounded-xl border p-4 space-y-2.5 animate-fade-in ${
              simResult.is_safe
                ? 'bg-emerald-50/80 border-emerald-300 text-emerald-900'
                : 'bg-rose-50/90 border-rose-300 text-rose-950'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">{simResult.is_safe ? '✅' : '🚨'}</span>
                <span className="font-bold text-xs">
                  {simResult.is_safe
                    ? `SAFE TO PRESCRIBE: ${simResult.candidate_drug} ${simResult.dose || ''}`
                    : `SAFETY INTERLOCK TRIGGERED: ${simResult.candidate_drug} ${simResult.dose || ''}`}
                </span>
              </div>
              {simResult.rxnorm_cui ? (
                <span className="font-mono text-[10px] bg-white/70 px-2 py-0.5 rounded border border-slate-300">
                  RxCUI: {simResult.rxnorm_cui}
                </span>
              ) : null}
            </div>

            {simResult.is_safe ? (
              <p className="text-xs text-emerald-700 leading-relaxed">
                Zero clinical contraindications, severe drug-drug interactions, or allergy cross-reactivities detected against the {simResult.patient_context.active_medications_count} active medications and {simResult.patient_context.allergies_count} allergies for patient {profile.patient.patient_code}.
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-rose-800 font-medium">
                  Detected {simResult.total_findings} finding(s) ({simResult.critical_count} Critical, {simResult.high_count} High) for this candidate prescription:
                </p>
                <div className="space-y-1.5">
                  {simResult.findings.map((f, i) => (
                    <div
                      key={i}
                      className="rounded-lg bg-white/90 border border-rose-200 p-2.5 text-xs text-slate-800 space-y-1 shadow-2xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-rose-700">{f.title}</span>
                        <span className="rounded bg-rose-100 px-1.5 py-0.2 text-[9px] font-bold uppercase text-rose-800">
                          {f.severity}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600">{f.detail}</p>
                      {f.recommendation && (
                        <p className="text-[11px] font-semibold text-rose-900 border-l-2 border-rose-500 pl-2">
                          {f.recommendation}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <Panel title="Safety posture">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Total alerts" value={alerts.length} />
          <Stat
            label="Critical"
            value={critical}
            hint={critical > 0 ? 'Requires immediate review' : 'None'}
          />
          <Stat label="High" value={high} />
          <Stat
            label="Rule set"
            value={<span className="text-sm">Deterministic</span>}
            hint="No LLM in the safety path"
          />
        </div>
      </Panel>

      <Panel title={`Findings (${alerts.length})`}>
        {ordered.length === 0 ? (
          <Empty>
            No interaction, allergy, contraindication, or duplication rules fired for this record.
          </Empty>
        ) : (
          <ul className="space-y-2">
            {ordered.map((alert) => (
              <AlertCard key={alert.id} alert={alert} />
            ))}
          </ul>
        )}
      </Panel>

      {alerts.length > 0 ? (
        <p className="px-1 text-xs text-slate-600">
          Highest severity present:{' '}
          <span className={tone(ordered[0]?.severity).text}>
            {severityLabel(ordered[0]?.severity)}
          </span>
          . These are decision-support signals for clinician review, not clinical decisions.
        </p>
      ) : null}
    </div>
  )
}
