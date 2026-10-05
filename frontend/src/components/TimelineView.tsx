import type { PatientProfile } from '../api'
import { formatDate } from '../format'
import { CodeChip, Empty, Panel } from './Primitives'

const KIND_TONE: Record<string, string> = {
  condition: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200',
  medication: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
  lab: 'border-violet-500/40 bg-violet-500/10 text-violet-200',
  procedure: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
  implant: 'border-purple-500/40 bg-purple-500/10 text-purple-200',
  allergy: 'border-red-500/40 bg-red-500/10 text-red-200',
  record: 'border-slate-600 bg-slate-800 text-slate-300',
}

/**
 * Chronological view across every ingested document.
 *
 * Entries are ordered by date and grouped by year, which is what makes a conflict between
 * documents legible: two sources disagreeing about a medication appear on adjacent rows.
 */
export function TimelineView({ profile }: { profile: PatientProfile }) {
  if (profile.timeline.length === 0) {
    return (
      <Panel title="Longitudinal timeline">
        <Empty>No dated clinical events were extracted from this record.</Empty>
      </Panel>
    )
  }

  const groups = new Map<number | null, typeof profile.timeline>()
  for (const entry of profile.timeline) {
    const bucket = groups.get(entry.year)
    if (bucket) {
      bucket.push(entry)
    } else {
      groups.set(entry.year, [entry])
    }
  }

  return (
    <Panel title={`Longitudinal timeline (${profile.timeline.length} events)`}>
      <ol className="relative space-y-5 border-l border-slate-800 pl-5">
        {[...groups.entries()].map(([year, entries]) => (
          <li key={year ?? 'undated'}>
            <div className="relative mb-2">
              <span
                className="absolute -left-[26px] top-1 h-2.5 w-2.5 rounded-full border-2 border-slate-900 bg-cyan-400"
                aria-hidden="true"
              />
              <h3 className="text-sm font-semibold text-slate-200">
                {year ?? 'Undated'}
              </h3>
            </div>
            <ul className="space-y-1.5">
              {entries.map((entry, index) => (
                <li
                  key={`${entry.kind}-${entry.label}-${index}`}
                  className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`chip ${KIND_TONE[entry.kind] ?? KIND_TONE.record}`}>
                        {entry.kind}
                      </span>
                      <span className="text-sm text-slate-100">{entry.label}</span>
                      <CodeChip code={entry.code} />
                    </div>
                    <span className="shrink-0 text-xs text-slate-500 tabular-nums">
                      {formatDate(entry.date)}
                    </span>
                  </div>
                  {entry.detail ? (
                    <p className="mt-1 text-xs text-slate-400">{entry.detail}</p>
                  ) : null}
                  {entry.chronic ? (
                    <span className="mt-1 inline-block text-[11px] text-slate-500">
                      chronic condition
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </Panel>
  )
}
