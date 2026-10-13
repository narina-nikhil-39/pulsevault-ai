import { useState } from 'react'
import type { Allergy, SafetyAlert } from '../api'

interface TopSafetyBannerProps {
  alerts: SafetyAlert[]
  allergies: Allergy[]
  onViewAlerts?: () => void
}

export function TopSafetyBanner({ alerts, allergies, onViewAlerts }: TopSafetyBannerProps) {
  const [dismissed, setDismissed] = useState(false)

  const criticalAlerts = alerts.filter((a) => a.severity.toLowerCase() === 'critical')
  const warningAlerts = alerts.filter((a) => a.severity.toLowerCase() === 'warning')
  const severeAllergies = allergies.filter((a) =>
    ['critical', 'severe'].includes((a.severity || '').toLowerCase()),
  )

  const totalThreats = criticalAlerts.length + warningAlerts.length + severeAllergies.length
  if (totalThreats === 0) return null

  if (dismissed) {
    return (
      <div className="mb-4 flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs shadow-2xs">
        <div className="flex items-center gap-2 text-rose-700">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75"></span>
            <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-600"></span>
          </span>
          <span className="font-bold text-rose-900">
            {criticalAlerts.length} Critical Contraindications &amp; {severeAllergies.length} Severe
            Allergies Active
          </span>
        </div>
        <button
          onClick={() => setDismissed(false)}
          className="font-bold text-blue-600 hover:text-blue-700 underline text-xs"
        >
          Expand Safety Banner
        </button>
      </div>
    )
  }

  return (
    <div className="mb-5 overflow-hidden rounded-2xl border border-rose-200 bg-rose-50/80 p-4.5 shadow-xs">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-100 text-rose-600 text-sm font-bold">
            ⚠️
          </span>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-rose-900">
              Deterministic Safety &amp; Allergy Guardrail Alert
            </h3>
            <p className="text-[11px] text-rose-700">
              Evaluated in real-time across patient history, active regimens, and renal thresholds.
            </p>
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-xs font-semibold text-slate-400 hover:text-slate-600 transition"
          title="Minimize safety strip"
        >
          ✕ Dismiss
        </button>
      </div>

      <div className="mt-3.5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {criticalAlerts.map((alert) => (
          <div
            key={alert.id}
            className="rounded-xl border border-rose-200 bg-white p-3 text-xs shadow-2xs"
          >
            <div className="flex items-center gap-1.5 font-bold text-rose-700">
              <span className="inline-block h-2 w-2 rounded-full bg-rose-600"></span>
              {alert.title}
            </div>
            <p className="mt-1 text-[11px] leading-snug text-slate-700 line-clamp-2">
              {alert.detail}
            </p>
            {alert.recommendation ? (
              <p className="mt-1.5 text-[10px] text-amber-800 font-medium bg-amber-50 px-2 py-0.5 rounded border border-amber-200/60">
                Rx Action: {alert.recommendation}
              </p>
            ) : null}
          </div>
        ))}

        {severeAllergies.map((allergy, i) => (
          <div
            key={`allergy-${i}`}
            className="rounded-xl border border-amber-200 bg-white p-3 text-xs shadow-2xs"
          >
            <div className="flex items-center gap-1.5 font-bold text-amber-800">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-500"></span>
              Severe Allergy: {allergy.substance}
            </div>
            <p className="mt-1 text-[11px] leading-snug text-slate-700">
              Reaction: {allergy.reaction || 'Anaphylaxis risk'}
            </p>
          </div>
        ))}

        {warningAlerts.map((alert) => (
          <div
            key={alert.id}
            className="rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-2xs"
          >
            <div className="flex items-center gap-1.5 font-bold text-amber-700">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-400"></span>
              {alert.title}
            </div>
            <p className="mt-1 text-[11px] leading-snug text-slate-600 line-clamp-2">
              {alert.detail}
            </p>
          </div>
        ))}
      </div>

      {onViewAlerts ? (
        <div className="mt-3 flex justify-end">
          <button
            onClick={onViewAlerts}
            className="text-[11px] font-bold text-blue-600 hover:text-blue-700 underline"
          >
            View all safety checks &amp; pharmacology rules →
          </button>
        </div>
      ) : null}
    </div>
  )
}
export default TopSafetyBanner
