import { useCallback, useState } from 'react'
import {
  ApiError,
  fetchPipeline,
  uploadRecord,
  type PipelineResult,
  type PipelineStep,
} from '../api'
import { ErrorNote, Panel } from './Primitives'

const STEP_TONE: Record<string, string> = {
  complete: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200',
  running: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
  pending: 'border-slate-700 bg-slate-950/40 text-slate-500',
  failed: 'border-red-500/40 bg-red-500/10 text-red-200',
}

const STATUS_MARK: Record<string, string> = {
  complete: '✓',
  running: '•',
  pending: '·',
  failed: '✕',
}

function StepRow({ step, index }: { step: PipelineStep; index: number }) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs ${STEP_TONE[step.status] ?? STEP_TONE.pending}`}
        aria-hidden="true"
      >
        {STATUS_MARK[step.status] ?? '·'}
      </span>
      <div className="min-w-0 flex-1 pb-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="text-sm text-slate-200">{step.label}</span>
          <span className="font-mono text-[11px] text-slate-600">{step.key}</span>
        </div>
        <div className="text-[11px] text-slate-600">
          {index + 1}. {step.detail ?? 'no detail recorded'}
        </div>
      </div>
    </li>
  )
}

/**
 * Record intake with a visible trace of the agent pipeline.
 *
 * The stage list is not decoration: it is the agent trace the backend returns for the run,
 * so a clinician can see which stage produced a given extraction or alert.
 */
export function UploadPanel({ onProcessed }: { onProcessed: (patientCode: string) => void }) {
  const [patientCode, setPatientCode] = useState('SH-1024')
  const [patientName, setPatientName] = useState('Anita Sharma')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PipelineResult | null>(null)

  const reset = useCallback(() => {
    setResult(null)
    setError(null)
  }, [])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!file) {
      setError('Choose a PDF or image first.')
      return
    }

    setBusy(true)
    setError(null)
    try {
      const accepted = await uploadRecord(file, patientCode.trim(), patientName.trim())
      // The upload endpoint runs the pipeline synchronously, so the result is ready now.
      const pipeline = await fetchPipeline(accepted.document_id)
      setResult(pipeline)
      onProcessed(accepted.patient_code)
      setFile(null)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Upload failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title="Ingest record" action={result ? <button onClick={reset} className="btn-ghost">Clear</button> : null}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-slate-400">Patient code</span>
          <input
            className="field"
            value={patientCode}
            onChange={(event) => setPatientCode(event.target.value)}
            placeholder="SH-1024"
            required
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-slate-400">Patient name</span>
          <input
            className="field"
            value={patientName}
            onChange={(event) => setPatientName(event.target.value)}
            placeholder="Full name"
            required
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-slate-400">
            Record (PDF, PNG, JPEG, TIFF, WEBP)
          </span>
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff,.webp"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="field file:mr-3 file:rounded file:border-0 file:bg-slate-800 file:px-2 file:py-1 file:text-slate-300"
            required
          />
        </label>

        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? 'Running pipeline…' : 'Upload and process'}
        </button>

        {error ? <ErrorNote message={error} /> : null}
      </form>

      {result ? (
        <div className="mt-5 border-t border-slate-800 pt-4">
          <div className="mb-3 grid grid-cols-4 gap-2 text-center">
            <div>
              <div className="text-lg font-semibold tabular-nums">{result.entities_extracted}</div>
              <div className="text-[11px] text-slate-500">extracted</div>
            </div>
            <div>
              <div className="text-lg font-semibold tabular-nums">{result.normalized_count}</div>
              <div className="text-[11px] text-slate-500">normalized</div>
            </div>
            <div>
              <div className="text-lg font-semibold tabular-nums">{result.safety_alerts}</div>
              <div className="text-[11px] text-slate-500">alerts</div>
            </div>
            <div>
              <div className="text-lg font-semibold tabular-nums text-red-300">
                {result.critical_alerts}
              </div>
              <div className="text-[11px] text-slate-500">critical</div>
            </div>
          </div>

          <ol>
            {result.steps.map((step, index) => (
              <StepRow key={step.key} step={step} index={index} />
            ))}
          </ol>

          {result.warnings.length > 0 ? (
            <ul className="mt-2 space-y-1 border-t border-slate-800 pt-3">
              {result.warnings.map((warning) => (
                <li key={warning} className="text-xs text-amber-300/90">
                  {warning}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </Panel>
  )
}
