import { useState } from 'react'
import { downloadFhirBundle, fetchFhirBundle } from '../api'

interface FhirExportButtonProps {
  patientCode: string
}

export function FhirExportButton({ patientCode }: FhirExportButtonProps) {
  const [downloading, setDownloading] = useState(false)
  const [inspecting, setInspecting] = useState(false)
  const [fhirData, setFhirData] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleDownload() {
    setDownloading(true)
    setError(null)
    try {
      await downloadFhirBundle(patientCode)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to download FHIR bundle.')
    } finally {
      setDownloading(false)
    }
  }

  async function handleInspect() {
    setInspecting(true)
    setError(null)
    try {
      const data = await fetchFhirBundle(patientCode)
      setFhirData(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to retrieve FHIR bundle.')
      setInspecting(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-1.5">
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-500/20 disabled:opacity-50"
          title="Download HL7 FHIR Release 4 JSON Bundle"
        >
          <span>📦</span>
          <span>{downloading ? 'Exporting...' : 'Export FHIR R4'}</span>
        </button>
        <button
          onClick={handleInspect}
          className="rounded-lg border border-slate-700 bg-slate-800/60 px-2 py-1.5 text-xs text-slate-300 transition hover:bg-slate-700 hover:text-white"
          title="Preview FHIR R4 JSON structures"
        >
          Inspect JSON
        </button>
      </div>

      {error ? (
        <span className="text-[10px] text-rose-400 block mt-1">{error}</span>
      ) : null}

      {inspecting && fhirData ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl border border-slate-800 bg-slate-950 p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">🔥</span>
                <h3 className="font-semibold text-white text-sm">
                  HL7 FHIR Release 4 Bundle — Patient {patientCode}
                </h3>
              </div>
              <button
                onClick={() => {
                  setInspecting(false)
                  setFhirData(null)
                }}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="my-3 flex items-center justify-between text-xs text-slate-400">
              <span>
                Standard:{' '}
                <strong className="text-cyan-300">HL7 FHIR R4 (Collection Bundle)</strong>
              </span>
              <span>
                Total Resources: <strong className="text-white">{String(fhirData.total ?? 0)}</strong>
              </span>
            </div>

            <pre className="flex-1 overflow-auto rounded-lg border border-slate-800 bg-slate-900/80 p-4 text-[11px] font-mono text-cyan-200/90">
              {JSON.stringify(fhirData, null, 2)}
            </pre>

            <div className="mt-4 flex justify-end gap-3 pt-2">
              <button
                onClick={() => {
                  setInspecting(false)
                  setFhirData(null)
                }}
                className="rounded-lg border border-slate-700 px-4 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
              >
                Close
              </button>
              <button
                onClick={handleDownload}
                className="rounded-lg bg-cyan-500 px-4 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400"
              >
                Download .json
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
