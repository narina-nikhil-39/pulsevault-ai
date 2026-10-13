import type { ReactNode } from 'react'
import { severityLabel, tone } from '../format'

/** Small presentational primitives shared across panels in light hospital theme. */

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
    <section className="rounded-2xl border border-slate-200/80 bg-white shadow-xs">
      <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <h2 className="text-sm font-bold tracking-tight text-slate-900">{title}</h2>
        {action}
      </header>
      <div className="p-5">{children}</div>
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
    <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 px-3.5 py-2.5">
      <div className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">{label}</div>
      <div className="mt-1 text-lg font-bold text-slate-900 tabular-nums">{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-slate-400">{hint}</div> : null}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50/40 px-4 py-8 text-center text-xs text-slate-500">
      {children}
    </p>
  )
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700 font-medium"
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
    <span className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-600">
      {code}
    </span>
  )
}
export default Panel
