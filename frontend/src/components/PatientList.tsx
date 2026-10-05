import { useEffect, useState } from 'react'
import { ApiError, searchPatients, type PatientSummary } from '../api'
import { ageLabel } from '../format'
import { Empty, ErrorNote, Panel } from './Primitives'

/** Searchable roster of patients with records already ingested. */
export function PatientList({
  selected,
  onSelect,
}: {
  selected: string | null
  onSelect: (patientCode: string) => void
}) {
  const [query, setQuery] = useState('')
  const [patients, setPatients] = useState<PatientSummary[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const results = await searchPatients(query.trim())
        if (!cancelled) {
          setPatients(results)
          setError(null)
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof ApiError ? caught.message : 'Failed to load patients.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    // Debounce so typing does not issue a request per keystroke.
    const handle = window.setTimeout(load, query ? 250 : 0)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [query])

  return (
    <Panel title={`Patients (${patients.length})`}>
      <input
        className="field mb-3"
        placeholder="Search by name or code"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-label="Search patients"
      />

      {error ? <ErrorNote message={error} /> : null}

      {loading && patients.length === 0 ? (
        <p className="px-1 py-4 text-center text-sm text-slate-500">Loading…</p>
      ) : patients.length === 0 ? (
        <Empty>
          {query ? 'No patients match that search.' : 'No records ingested yet. Upload one to begin.'}
        </Empty>
      ) : (
        <ul className="space-y-1.5">
          {patients.map((patient) => {
            const isSelected = patient.patient_code === selected
            return (
              <li key={patient.patient_code}>
                <button
                  onClick={() => onSelect(patient.patient_code)}
                  aria-current={isSelected}
                  className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    isSelected
                      ? 'border-cyan-500/50 bg-cyan-500/10'
                      : 'border-slate-800 bg-slate-950/40 hover:border-slate-700 hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium text-slate-100">
                      {patient.full_name}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-slate-500">
                      {patient.patient_code}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500">
                    <span>{ageLabel(patient.age)}</span>
                    {patient.sex ? <span>· {patient.sex}</span> : null}
                    {patient.blood_group ? <span>· {patient.blood_group}</span> : null}
                    <span>· {patient.record_count} record{patient.record_count === 1 ? '' : 's'}</span>
                    {patient.critical_alert_count > 0 ? (
                      <span className="ml-auto rounded-full bg-red-500/15 px-1.5 py-0.5 font-medium text-red-300">
                        {patient.critical_alert_count} critical
                      </span>
                    ) : null}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
