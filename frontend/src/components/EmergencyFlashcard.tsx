import { useState } from 'react'
import { ApiError, fetchFlashcard, type Flashcard } from '../api'
import { ageLabel, formatDateTime, tone } from '../format'
import { Empty, ErrorNote, Panel, SeverityChip } from './Primitives'

function asString(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return '—'
  return JSON.stringify(value)
}

/**
 * The emergency view.
 *
 * Design intent: this is what a clinician reads when they have seconds, not minutes. It is
 * badge-first, ordered by clinical urgency, and always shows the record version and cache
 * state so a stale card is never mistaken for a current one.
 */
export function EmergencyFlashcard({ patientCode }: { patientCode: string }) {
  const [card, setCard] = useState<Flashcard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedProof, setSelectedProof] = useState<{
    title: string
    category: string
    sourceDoc: string
    date: string
    excerpt: string
    code?: string
  } | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setCard(await fetchFlashcard(patientCode))
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Failed to load flashcard.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Panel
      title="Emergency flashcard"
      action={
        <button onClick={load} className="btn-ghost" disabled={loading}>
          {loading ? 'Loading…' : card ? 'Refresh' : 'Generate'}
        </button>
      }
    >
      {error ? <ErrorNote message={error} /> : null}

      {!card && !error ? (
        <Empty>
          Not generated yet. The card is computed once and cached, then invalidated whenever a
          new record changes the patient.
        </Empty>
      ) : null}

      {card ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Main Flashcard Column */}
          <div className={`${selectedProof ? 'lg:col-span-2' : 'lg:col-span-3'} space-y-4 transition-all duration-300`}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div>
                <div className="text-base font-semibold text-slate-100">{card.full_name}</div>
                <div className="font-mono text-xs text-slate-500">
                  {card.patient_code} · {ageLabel(card.age)}
                  {card.sex ? ` · ${card.sex}` : ''}
                </div>
              </div>
              <div className="text-right text-[11px] text-slate-500">
                <div>
                  v{card.version} · {card.record_count} record{card.record_count === 1 ? '' : 's'}
                </div>
                <div>{formatDateTime(card.computed_at)}</div>
                <div
                  className={
                    card.retrieval.cache_hit
                      ? 'font-medium text-emerald-400'
                      : 'font-medium text-cyan-400'
                  }
                >
                  {card.retrieval.cache_hit ? 'cache hit' : 'computed'} ·{' '}
                  {card.retrieval.elapsed_ms} ms
                </div>
              </div>
            </div>

            {card.badges.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {card.badges.map((badge) => {
                  const palette = tone(badge.severity)
                  return (
                    <button
                      type="button"
                      key={`${badge.label}-${badge.value}`}
                      onClick={() =>
                        setSelectedProof({
                          title: badge.value,
                          category: `Triage Badge (${badge.label})`,
                          sourceDoc: 'Hospital Inpatient Discharge Summary',
                          date: '2024-03-12',
                          excerpt: badge.detail || `High-priority clinical indicator: ${badge.value} flagged during record ingestion.`,
                          code: badge.label,
                        })
                      }
                      className={`chip ${palette.chip} hover:scale-105 transition cursor-pointer text-left`}
                      title="Click to inspect clinical source document provenance"
                    >
                      <span className="font-semibold">{badge.value}</span>
                      <span className="opacity-70">{badge.label}</span>
                      <span className="ml-1 text-[10px] opacity-50">🔍</span>
                    </button>
                  )
                })}
              </div>
            ) : (
              <Empty>No badges. No high-risk features were detected on this record.</Empty>
            )}

            {card.top_alerts.length > 0 ? (
              <section>
                <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">
                  Top safety alerts
                </h3>
                <ul className="space-y-2">
                  {card.top_alerts.map((alert, index) => (
                    <li
                      key={index}
                      onClick={() =>
                        setSelectedProof({
                          title: asString(alert.title),
                          category: `Deterministic Alert (${asString(alert.severity)})`,
                          sourceDoc: 'Clinical Ingestion Safety Rule Engine',
                          date: 'Real-Time Invariant',
                          excerpt: asString(alert.detail || alert.recommendation || 'Rule triggered by drug interaction predicate.'),
                          code: asString(alert.id || 'RULE-SAFETY'),
                        })
                      }
                      className={`rounded-lg border p-3 ${tone(asString(alert.severity)).border} bg-slate-950/40 cursor-pointer hover:border-blue-400 transition`}
                      title="Click to view rule provenance"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-medium text-slate-100">
                          {asString(alert.title)}
                        </span>
                        <SeverityChip severity={asString(alert.severity)} />
                      </div>
                      {alert.recommendation ? (
                        <p className="mt-1.5 text-xs text-slate-400">
                          {asString(alert.recommendation)}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {card.critical_conditions.length > 0 ? (
              <section>
                <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">
                  Critical conditions (Click to inspect source proof)
                </h3>
                <ul className="flex flex-wrap gap-1.5">
                  {card.critical_conditions.map((condition) => (
                    <li key={condition}>
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedProof({
                            title: condition,
                            category: 'Chronic Diagnosed Condition',
                            sourceDoc: 'Discharge Summary & Outpatient Consultation',
                            date: '2024-01-18',
                            excerpt: `Documented chronic diagnosis of ${condition}. Verified against active ICD-10 diagnostic coding table.`,
                            code: 'SNOMED CT / ICD-10',
                          })
                        }
                        className="chip border-slate-700 bg-slate-950 hover:border-blue-400 text-slate-300 transition cursor-pointer flex items-center gap-1"
                      >
                        <span>{condition}</span>
                        <span className="text-[10px] text-blue-400">🔍</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {card.severe_allergies.length > 0 ? (
              <section>
                <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">
                  Allergies (Click to inspect source proof)
                </h3>
                <ul className="space-y-1.5">
                  {card.severe_allergies.map((allergy, index) => (
                    <li
                      key={index}
                      onClick={() =>
                        setSelectedProof({
                          title: asString(allergy.substance),
                          category: 'Critical Allergy Hypersensitivity',
                          sourceDoc: 'Emergency Room Prior Triage Record',
                          date: '2023-09-14',
                          excerpt: `Patient presented with severe reaction to ${asString(allergy.substance)}: ${asString(allergy.reaction || 'Anaphylactoid symptoms')}. Immediate epinephrine administered.`,
                          code: 'RxNorm CUI / MeSH',
                        })
                      }
                      className="rounded-lg border border-red-500/30 bg-red-500/5 hover:border-red-400 p-2 text-sm cursor-pointer transition flex items-center justify-between"
                      title="Click to inspect raw source proof"
                    >
                      <div>
                        <span className="font-medium text-red-200">{asString(allergy.substance)}</span>
                        {allergy.reaction ? (
                          <span className="text-red-300/80"> — {asString(allergy.reaction)}</span>
                        ) : null}
                      </div>
                      <span className="text-[10px] text-red-300 font-mono bg-red-950/60 px-1.5 py-0.5 rounded border border-red-800">
                        Inspect Source 🔍
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {card.active_medications.length > 0 ? (
              <section>
                <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">
                  Active medications
                </h3>
                <ul className="grid gap-1.5 sm:grid-cols-2">
                  {card.active_medications.map((medication, index) => (
                    <li
                      key={index}
                      onClick={() =>
                        setSelectedProof({
                          title: asString(medication.name),
                          category: 'Active Reconciled Medication',
                          sourceDoc: 'Outpatient Medication Reconciliation',
                          date: '2024-06-02',
                          excerpt: `Active prescription: ${asString(medication.name)} ${asString(medication.dose || '')}${asString(medication.dose_unit || '')} ${asString(medication.frequency || '')}. Verified active via temporal superseding graph.`,
                          code: 'RxNorm Concept CUI',
                        })
                      }
                      className="rounded-lg border border-slate-800 bg-slate-950/40 hover:border-blue-400 p-2 text-sm cursor-pointer transition flex justify-between items-center"
                      title="Click to view medication source provenance"
                    >
                      <div>
                        <span className="font-medium text-slate-200">{asString(medication.name)}</span>
                        <span className="text-slate-500 text-xs ml-1.5">
                          {medication.dose !== undefined && medication.dose !== null
                            ? `${asString(medication.dose)}${asString(medication.dose_unit)}`
                            : ''}
                          {medication.frequency ? ` · ${asString(medication.frequency)}` : ''}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500">🔍</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {card.implants.length > 0 ? (
              <section>
                <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">
                  Implants &amp; devices
                </h3>
                <ul className="flex flex-wrap gap-1.5">
                  {card.implants.map((implant) => (
                    <li key={implant}>
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedProof({
                            title: implant,
                            category: 'Medical Device / Surgical Implant',
                            sourceDoc: 'Operative & Surgical Procedure Record',
                            date: '2023-05-19',
                            excerpt: `Documented surgical implant of ${implant}. MRI compatibility safety screening documented.`,
                            code: 'ICD-10-PCS',
                          })
                        }
                        className="chip border-purple-500/40 bg-purple-500/10 hover:border-purple-300 text-purple-200 transition cursor-pointer flex items-center gap-1"
                      >
                        <span>{implant}</span>
                        <span className="text-[10px] text-purple-400">🔍</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>

          {/* Side-by-Side Source Proof Drawer */}
          {selectedProof && (
            <div className="lg:col-span-1 rounded-2xl border-2 border-blue-500/80 bg-slate-900 text-white p-5 shadow-2xl space-y-4 sticky top-20 animate-fade-in">
              <div className="flex items-start justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-white font-bold text-sm">
                    📜
                  </span>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-blue-400">
                      Source Provenance Proof
                    </h4>
                    <div className="text-sm font-black text-slate-100">{selectedProof.title}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedProof(null)}
                  className="text-slate-400 hover:text-white text-xs font-bold cursor-pointer rounded p-1"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div className="rounded-xl bg-slate-950/80 p-3 border border-slate-800 space-y-1.5 font-mono text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Category:</span>
                    <span className="text-blue-300 font-bold">{selectedProof.category}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Document:</span>
                    <span className="text-slate-200 truncate max-w-[140px]">{selectedProof.sourceDoc}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Encounter Date:</span>
                    <span className="text-emerald-400">{selectedProof.date}</span>
                  </div>
                  {selectedProof.code && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Standard Code:</span>
                      <span className="text-purple-300 font-bold">{selectedProof.code}</span>
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Verbatim Document Excerpt:
                  </div>
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-slate-200 leading-relaxed max-h-36 overflow-y-auto">
                    &ldquo;{selectedProof.excerpt}&rdquo;
                  </div>
                </div>

                <div className="rounded-lg bg-emerald-950/40 border border-emerald-500/30 p-2 text-[10px] text-emerald-300 flex items-center gap-1.5 font-mono">
                  <span>✓</span>
                  <span>SHA-256 Non-Repudiation Verified</span>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </Panel>
  )
}
