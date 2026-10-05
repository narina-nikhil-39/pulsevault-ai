import type { ReactNode } from 'react'
import { severityLabel, tone } from '../format'

/** Small presentational primitives shared by every panel. */

export function Panel({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="panel">
      <header className="panel-header">
        <h2 className="panel-title">{title}</h2>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  )
}

export function SeverityChip({ severity }: { severity: string | null | undefined }) {
  const palette = tone(severity)
  return (
    <span className={`chip ${palette.chip}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${palette.dot}`} aria-hidden="true" />
      {severityLabel(severity)}
    </span>
  )
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string
  value: ReactNode
  hint?: string
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
      <div className="text-[11px] tracking-wide text-slate-500 uppercase">{label}</div>
      <div className="mt-1 text-xl font-semibold text-slate-100 tabular-nums">{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-slate-500">{hint}</div> : null}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-slate-800 px-4 py-6 text-center text-sm text-slate-500">
      {children}
    </p>
  )
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
    >
      {message}
    </div>
  )
}

/** Render a terminology code as a monospace chip, or nothing when unmapped. */
export function CodeChip({ code }: { code: string | null | undefined }) {
  if (!code) {
    return null
  }
  return (
    <span className="rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 font-mono text-[11px] text-slate-400">
      {code}
    </span>
  )
}
