import { useState, type FormEvent } from 'react'
import {
  queryPatientRag,
  type RagChunk,
  type RagQueryResponse,
} from '../api'

interface RagAssistantViewProps {
  patientCode: string
}

const SUGGESTED_QUERIES = [
  'Current medications, dosages, and active status',
  'Known drug-drug interactions or contraindications',
  'Allergies, hypersensitivity reactions, and severity',
  'Chronic diseases and documented medical history',
  'Recent laboratory test values and abnormal flags',
]

export function RagAssistantView({ patientCode }: RagAssistantViewProps) {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [response, setResponse] = useState<RagQueryResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedChunk, setSelectedChunk] = useState<RagChunk | null>(null)

  async function handleSearch(searchQuery: string) {
    const trimmed = searchQuery.trim()
    if (!trimmed) return

    setLoading(true)
    setError(null)
    try {
      const res = await queryPatientRag(patientCode, trimmed)
      setResponse(res)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg || 'Failed to query vector store.')
    } finally {
      setLoading(false)
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void handleSearch(query)
  }

  return (
    <div className="space-y-6">
      {/* Search Header Banner */}
      <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50/60 via-white to-sky-50/40 p-6 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white text-xl shadow-md shadow-blue-500/20">
              🤖
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 tracking-tight">
                Grounded Clinical AI Assistant (Qdrant RAG)
              </h3>
              <p className="text-xs text-slate-500">
                Patient-scoped semantic vector retrieval with spatial bounding-box coordinates.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Patient Scoped: <span className="font-mono font-bold">{patientCode}</span>
            </span>
            {response ? (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 border border-slate-200">
                Backend: <strong className="font-mono text-slate-800">{response.backend}</strong>
              </span>
            ) : null}
          </div>
        </div>

        {/* Query Input Bar */}
        <form onSubmit={onSubmit} className="flex gap-2.5">
          <div className="relative flex-1">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask a clinical question (e.g., 'What medications is this patient taking?', 'Any drug contraindications?')..."
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition shadow-inner"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50 transition shadow-sm cursor-pointer"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span>Searching Vector Index...</span>
              </>
            ) : (
              <>
                <span>Search Records</span>
                <span>→</span>
              </>
            )}
          </button>
        </form>

        {/* Suggested Clinical Query Pills */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Quick Prompts:
          </span>
          {SUGGESTED_QUERIES.map((sq) => (
            <button
              key={sq}
              type="button"
              onClick={() => {
                setQuery(sq)
                void handleSearch(sq)
              }}
              className="rounded-lg border border-slate-200/90 bg-white/90 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 transition cursor-pointer"
            >
              {sq}
            </button>
          ))}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-rose-600 hover:text-rose-900 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Query Results */}
      {response && (
        <div className="space-y-5 animate-fade-in">
          {/* Grounded Synthesis Card */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-blue-600">✨</span>
                <h4 className="text-sm font-bold text-slate-900">
                  Grounded Clinical Synthesis
                </h4>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-0.5 text-[11px] font-semibold text-blue-700 border border-blue-200">
                {response.results_count} Vector Block(s) Matched
              </span>
            </div>

            <div className="whitespace-pre-line text-xs font-sans text-slate-700 leading-relaxed bg-slate-50/70 p-4 rounded-xl border border-slate-200/60 font-mono">
              {response.answer}
            </div>

            <div className="flex items-center gap-2 text-[11px] text-slate-400 pt-1">
              <span>🛡️</span>
              <span>
                Zero Hallucination Constraint: Output is directly grounded in extracted physical PDF blocks and coordinates.
              </span>
            </div>
          </div>

          {/* Retrieved Grounding Chunks */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Retrieved Source Blocks &amp; Spatial Bounding Boxes ({response.chunks.length})
              </h4>
              <span className="text-[11px] text-slate-400">
                Click any citation badge to view spatial coordinates
              </span>
            </div>

            {response.chunks.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center text-xs text-slate-400">
                No matching vector chunks located for this query within patient {patientCode}&apos;s profile.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {response.chunks.map((chunk, idx) => {
                  const scorePercent = Math.max(0, Math.min(100, Math.round(chunk.score * 100)))

                  return (
                    <div
                      key={chunk.chunk_id || idx}
                      className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs hover:border-blue-300 transition flex flex-col justify-between space-y-3"
                    >
                      <div>
                        {/* Header metadata */}
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <span className="font-semibold text-xs text-slate-800 truncate" title={chunk.document_title || `Doc #${chunk.document_id}`}>
                            📄 {chunk.document_title || `Document #${chunk.document_id}`}
                          </span>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {/* Clickable Page Citation Badge */}
                            <button
                              type="button"
                              onClick={() => setSelectedChunk(chunk)}
                              className="rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-2 py-0.5 text-[11px] font-bold transition cursor-pointer flex items-center gap-1"
                              title="Click to view bounding-box coordinate grounding"
                            >
                              <span>🔍</span>
                              <span>Page {chunk.page}</span>
                            </button>

                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono font-medium text-slate-600">
                              Sim: {scorePercent}%
                            </span>
                          </div>
                        </div>

                        {/* Verbatim Chunk Text */}
                        <p className="text-xs text-slate-700 font-mono bg-slate-50 p-2.5 rounded-lg border border-slate-200/60 leading-relaxed break-words">
                          &ldquo;{chunk.text}&rdquo;
                        </p>
                      </div>

                      {/* Bounding-box coordinate footer */}
                      <div className="flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-100 pt-2 font-mono">
                        <span>
                          bbox: [{chunk.bbox.map((n) => Math.round(n)).join(', ')}]
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedChunk(chunk)}
                          className="text-blue-600 hover:underline font-sans font-semibold cursor-pointer"
                        >
                          Inspect Coordinates →
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Spatial Bounding-Box Modal */}
      {selectedChunk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 text-base">
                  📐
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Physical Document Coordinate Grounding
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Spatial bounding box verified from source digital layer.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedChunk(null)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="rounded-xl bg-slate-50 p-3 border border-slate-200/80 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Source Document:</span>
                  <span className="font-semibold text-slate-800">
                    {selectedChunk.document_title || `Doc #${selectedChunk.document_id}`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Page Index:</span>
                  <span className="font-bold text-blue-600">Page {selectedChunk.page}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Vector Similarity Score:</span>
                  <span className="font-mono text-emerald-600 font-bold">
                    {(selectedChunk.score * 100).toFixed(2)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Patient Boundary:</span>
                  <span className="font-mono text-slate-800">{selectedChunk.patient_code}</span>
                </div>
              </div>

              {/* Spatial Coordinates Pill */}
              <div className="rounded-xl bg-blue-50/70 p-3.5 border border-blue-200/80 space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-blue-800">
                  Spatial Coordinates [x0, y0, x1, y1]
                </div>
                <div className="grid grid-cols-4 gap-2 text-center font-mono text-[11px]">
                  <div className="bg-white p-1.5 rounded-lg border border-blue-200">
                    <div className="text-[9px] text-slate-400">x0 (Left)</div>
                    <div className="font-bold text-slate-800">{selectedChunk.bbox[0]}</div>
                  </div>
                  <div className="bg-white p-1.5 rounded-lg border border-blue-200">
                    <div className="text-[9px] text-slate-400">y0 (Top)</div>
                    <div className="font-bold text-slate-800">{selectedChunk.bbox[1]}</div>
                  </div>
                  <div className="bg-white p-1.5 rounded-lg border border-blue-200">
                    <div className="text-[9px] text-slate-400">x1 (Right)</div>
                    <div className="font-bold text-slate-800">{selectedChunk.bbox[2]}</div>
                  </div>
                  <div className="bg-white p-1.5 rounded-lg border border-blue-200">
                    <div className="text-[9px] text-slate-400">y1 (Bottom)</div>
                    <div className="font-bold text-slate-800">{selectedChunk.bbox[3]}</div>
                  </div>
                </div>
              </div>

              {/* Verbatim Excerpt */}
              <div className="space-y-1">
                <div className="text-[11px] font-semibold text-slate-500">
                  Anchored Source Text:
                </div>
                <div className="p-3 bg-slate-900 text-slate-100 rounded-xl font-mono text-xs leading-relaxed max-h-36 overflow-y-auto">
                  &ldquo;{selectedChunk.text}&rdquo;
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedChunk(null)}
                className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700 transition cursor-pointer"
              >
                Close Grounding View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
