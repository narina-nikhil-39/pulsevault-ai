import { useState } from 'react'
import { ApiError, fetchFlashcard, type Flashcard } from '../api'
import { ageLabel, formatDateTime, severityLabel, tone } from '../format'
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
        <div className="space-y-4">
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
                  <span
                    key={`${badge.label}-${badge.value}`}
                    className={`chip ${palette.chip}`}
                    title={badge.detail}
                  >
                    <span className="font-semibold">{badge.value}</span>
                    <span className="opacity-70">{badge.label}</span>
                  </span>
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
                    className={`rounded-lg border p-3 ${tone(asString(alert.severity)).border} bg-slate-950/40`}
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
                Critical conditions
              </h3>
              <ul className="flex flex-wrap gap-1.5">
                {card.critical_conditions.map((condition) => (
                  <li key={condition} className="chip border-slate-700 bg-slate-950 text-slate-300">
                    {condition}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {card.severe_allergies.length > 0 ? (
            <section>
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">
                Allergies
              </h3>
              <ul className="space-y-1.5">
                {card.severe_allergies.map((allergy, index) => (
                  <li
                    key={index}
                    className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm"
                  >
                    <span className="font-medium text-red-200">{asString(allergy.substance)}</span>
                    {allergy.reaction ? (
                      <span className="text-red-300/80"> — {asString(allergy.reaction)}</span>
                    ) : null}
                    {allergy.severity ? (
                      <span className="ml-2 text-[11px] text-slate-500">
                        {severityLabel(asString(allergy.severity))}
                      </span>
                    ) : null}
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
                    className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm"
                  >
                    <span className="font-medium text-slate-200">{asString(medication.name)}</span>
                    <span className="text-slate-500">
                      {medication.dose !== undefined && medication.dose !== null
                        ? ` ${asString(medication.dose)}${asString(medication.dose_unit)}`
                        : ''}
                      {medication.frequency ? ` · ${asString(medication.frequency)}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {card.implants.length > 0 ? (
            <section>
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">
                Implants & devices
              </h3>
              <ul className="flex flex-wrap gap-1.5">
                {card.implants.map((implant) => (
                  <li
                    key={implant}
                    className="chip border-purple-500/40 bg-purple-500/10 text-purple-200"
                  >
                    {implant}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}
    </Panel>
  )
}
