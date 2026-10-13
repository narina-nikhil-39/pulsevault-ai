/**
 * Presentation helpers shared across the console.
 *
 * Severity colouring is centralised here so that a given severity always reads the same way,
 * which matters more than usual in this UI: colour is a safety signal, not decoration.
 */

export type Severity = 'critical' | 'high' | 'moderate' | 'low' | 'info'

export interface Tone {
  chip: string
  dot: string
  border: string
  text: string
}

const TONES: Record<Severity, Tone> = {
  critical: {
    chip: 'border-rose-200 bg-rose-50 text-rose-700',
    dot: 'bg-rose-500',
    border: 'border-rose-200',
    text: 'text-rose-700',
  },
  high: {
    chip: 'border-orange-200 bg-orange-50 text-orange-700',
    dot: 'bg-orange-500',
    border: 'border-orange-200',
    text: 'text-orange-700',
  },
  moderate: {
    chip: 'border-amber-200 bg-amber-50 text-amber-700',
    dot: 'bg-amber-500',
    border: 'border-amber-200',
    text: 'text-amber-700',
  },
  low: {
    chip: 'border-sky-200 bg-sky-50 text-sky-700',
    dot: 'bg-sky-500',
    border: 'border-sky-200',
    text: 'text-sky-700',
  },
  info: {
    chip: 'border-slate-200 bg-slate-100 text-slate-700',
    dot: 'bg-slate-400',
    border: 'border-slate-200',
    text: 'text-slate-700',
  },
}

export function tone(severity: string | null | undefined): Tone {
  if (!severity) {
    return TONES.info
  }
  return TONES[severity.toLowerCase() as Severity] ?? TONES.info
}

export function severityLabel(severity: string | null | undefined): string {
  if (!severity) {
    return 'Unspecified'
  }
  return severity.charAt(0).toUpperCase() + severity.slice(1).toLowerCase()
}

/** `2024-03-05` becomes `05 Mar 2024`; unparseable values are returned unchanged. */
export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return '—'
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return parsed.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return '—'
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return parsed.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function ageLabel(age: number | null | undefined): string {
  return age === null || age === undefined ? '—' : `${age} yrs`
}

/** Render a lab value with its unit, preferring the server's preformatted text. */
export function labDisplay(
  valueText: string | null | undefined,
  numValue: number | null | undefined,
  unit: string | null | undefined,
): string {
  if (valueText) {
    return valueText
  }
  if (numValue === null || numValue === undefined) {
    return '—'
  }
  return unit ? `${numValue} ${unit}` : String(numValue)
}

function value(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : String(value)
}

export function medicationDose(
  dose: number | null,
  doseUnit: string | null,
  frequency: string | null,
): string {
  if (dose === null || dose === undefined) {
    return frequency ?? '—'
  }
  const amount = `${dose}${doseUnit ?? ''}`
  return frequency ? `${amount} ${frequency}` : amount
}

export { value as scalar }
