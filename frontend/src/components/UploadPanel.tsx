import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ApiError,
  fetchPipeline,
  uploadRecordAsync,
  getJobStatus,
  type JobStatusItem,
  type PipelineResult,
  type PipelineStep,
} from '../api'
import { ErrorNote, Panel } from './Primitives'
import { AsyncProgressTracker } from './AsyncProgressTracker'

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
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs ${
          STEP_TONE[step.status] ?? STEP_TONE.pending
        }`}
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
 * Record intake with live asynchronous background progress tracking.
 */
export function UploadPanel({ onProcessed }: { onProcessed: (patientCode: string) => void }) {
  const [patientCode, setPatientCode] = useState('SH-1024')
  const [patientName, setPatientName] = useState('Anita Sharma')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PipelineResult | null>(null)
  const [activeJob, setActiveJob] = useState<JobStatusItem | null>(null)

  const pollTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    }
  }, [])

  const reset = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
    setResult(null)
    setActiveJob(null)
    setError(null)
    setBusy(false)
  }, [])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!file) {
      setError('Choose a PDF or image first.')
      return
    }

    setBusy(true)
    setError(null)
    setResult(null)
    setActiveJob(null)

    try {
      const accepted = await uploadRecordAsync(file, patientCode.trim(), patientName.trim())

      // Initial state
      setActiveJob({
        job_id: accepted.job_id,
        patient_code: accepted.patient_code,
        patient_name: patientName.trim(),
        filename: file.name,
        document_id: accepted.document_id,
        status: 'queued',
        progress: 10,
        current_step: 'document_uploaded',
        steps: [],
        result: null,
        error: null,
        created_at: new Date().toISOString(),
        completed_at: null,
      })

      // Start live polling every 500ms
      const poll = async () => {
        try {
          const status = await getJobStatus(accepted.job_id)
          setActiveJob(status)

          if (status.status === 'completed') {
            if (pollTimerRef.current) {
              clearInterval(pollTimerRef.current)
              pollTimerRef.current = null
            }
            setBusy(false)

            // Ingestion complete -> load full breakdown
            if (accepted.document_id) {
              try {
                const pipeline = await fetchPipeline(accepted.document_id)
                setResult(pipeline)
              } catch (pipeErr) {
                console.error('Failed to fetch pipeline result:', pipeErr)
              }
            }
            onProcessed(accepted.patient_code)
            setFile(null)
          } else if (status.status === 'failed') {
            if (pollTimerRef.current) {
              clearInterval(pollTimerRef.current)
              pollTimerRef.current = null
            }
            setBusy(false)
            setError(status.error || 'Asynchronous ingestion failed.')
          }
        } catch (pollErr) {
          console.warn('Poll status error:', pollErr)
        }
      }

      await poll()
      pollTimerRef.current = window.setInterval(poll, 500)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Upload failed.')
      setBusy(false)
    }
  }

  return (
    <Panel
      title="Ingest record"
      action={result || activeJob ? <button onClick={reset} className="btn-ghost">Clear</button> : null}
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-slate-400">Patient code</span>
          <input
            className="field"
            value={patientCode}
            onChange={(event) => setPatientCode(event.target.value)}
            placeholder="SH-1024"
            required
            disabled={busy}
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
            disabled={busy}
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
            disabled={busy}
          />
        </label>

        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? 'Running Async Ingestion…' : 'Upload and process'}
        </button>

        {error ? <ErrorNote message={error} /> : null}
      </form>

      {/* Live Asynchronous Progress Stepper */}
      {busy && activeJob && (
        <div className="mt-4">
          <AsyncProgressTracker
            progress={activeJob.progress}
            currentStep={activeJob.current_step}
            status={activeJob.status}
            error={activeJob.error}
            filename={activeJob.filename}
          />
        </div>
      )}

      {/* Final Outcome Breakdown */}
      {result && (
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
      )}
    </Panel>
  )
}
