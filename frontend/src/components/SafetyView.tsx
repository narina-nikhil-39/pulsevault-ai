import type { PatientProfile, SafetyAlert } from '../api'
import { severityLabel, tone } from '../format'
import { Empty, Panel, SeverityChip, Stat } from './Primitives'

function AlertCard({ alert }: { alert: SafetyAlert }) {
  const palette = tone(alert.severity)
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

      {alert.involved.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {alert.involved.map((item) => (
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

  const ordered = [...alerts].sort((left, right) => {
    const rank: Record<string, number> = { critical: 0, high: 1, moderate: 2, low: 3 }
    return (rank[left.severity] ?? 4) - (rank[right.severity] ?? 4)
  })

  return (
    <div className="space-y-4">
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
