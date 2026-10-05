import { useState } from 'react'
import { ApiError, fetchAudit, type AuditEvent } from '../api'
import { formatDateTime } from '../format'
import { Empty, ErrorNote, Panel } from './Primitives'

function detailText(detail: Record<string, unknown>): string {
  const entries = Object.entries(detail)
  if (entries.length === 0) {
    return ''
  }
  return entries
    .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
    .join(' · ')
}

/**
 * Access audit trail for the selected patient.
 *
 * Covers reads and retrievals as well as the ingestion events, so the record of how a
 * profile came to exist is visible next to the record of who has viewed it.
 */
export function AuditView({ patientCode }: { patientCode: string }) {
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setEvents(await fetchAudit(patientCode))
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Failed to load audit trail.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Panel
      title="Audit trail"
      action={
        <button onClick={load} className="btn-ghost" disabled={loading}>
          {loading ? 'Loading…' : events.length === 0 ? 'Load' : 'Refresh'}
        </button>
      }
    >
      {error ? <ErrorNote message={error} /> : null}

      {!events.length && !error && !loading ? (
        <Empty>Load the trail to see who has accessed this record.</Empty>
      ) : null}

      {events.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] tracking-wide text-slate-500 uppercase">
                <th className="pb-2">When</th>
                <th className="pb-2">Actor</th>
                <th className="pb-2">Action</th>
                <th className="pb-2">Detail</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id} className="border-t border-slate-800/70 align-top">
                  <td className="py-2 pr-3 text-xs whitespace-nowrap text-slate-500 tabular-nums">
                    {formatDateTime(event.created_at)}
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs text-slate-300">{event.actor}</td>
                  <td className="py-2 pr-3">
                    <span className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 font-mono text-[11px] text-slate-300">
                      {event.action}
                    </span>
                  </td>
                  <td className="py-2 text-xs text-slate-500">
                    {detailText(event.detail) || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Panel>
  )
}
