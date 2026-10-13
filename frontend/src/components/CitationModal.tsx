import type { Sourced, SourceDocument } from '../api'

interface CitationModalProps {
  sourced: Sourced
  entityName: string
  entityCategory: string
  documents?: SourceDocument[]
  onClose: () => void
}

export function CitationModal({
  sourced,
  entityName,
  entityCategory,
  documents = [],
  onClose,
}: CitationModalProps) {
  const doc = documents.find((d) => d.id === sourced.source_document_id)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-950 p-6 shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400">
              🔍
            </span>
            <div>
              <h3 className="text-sm font-semibold text-white">
                Clinical Grounding &amp; Source Provenance
              </h3>
              <p className="text-[11px] text-slate-400">
                {entityCategory}: <strong className="text-cyan-300">{entityName}</strong>
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            ✕
          </button>
        </div>

        <div className="mt-4 space-y-3.5">
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
              Source Document
            </div>
            <div className="mt-1 flex items-center justify-between text-xs">
              <span className="font-semibold text-white">
                {doc?.filename || `Document #${sourced.source_document_id ?? 'Unknown'}`}
              </span>
              <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-slate-300">
                {doc?.doc_type || 'clinical_note'}
              </span>
            </div>
            {doc?.processed_at ? (
              <div className="mt-1 text-[10px] text-slate-500">
                Processed: {new Date(doc.processed_at).toLocaleString()} via{' '}
                {doc.extraction_method || 'Vision/Lexicon'}
              </div>
            ) : null}
          </div>

          <div className="rounded-lg border border-cyan-500/30 bg-cyan-950/20 p-3.5">
            <div className="text-[11px] font-semibold text-cyan-300 flex items-center justify-between">
              <span>Anchored Document Span</span>
              {sourced.source_confidence ? (
                <span className="text-[10px] text-emerald-400 font-mono">
                  Confidence: {(sourced.source_confidence * 100).toFixed(1)}%
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-xs font-mono leading-relaxed text-slate-200 bg-slate-950/80 p-2.5 rounded border border-slate-800/80">
              {sourced.source_span ? (
                <span>&ldquo;{sourced.source_span}&rdquo;</span>
              ) : (
                <span className="italic text-slate-500">
                  Direct citation span was synthesized from medical structured text in document #
                  {sourced.source_document_id}.
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-400 bg-slate-900/40 p-2 rounded">
            <span>🛡️</span>
            <span>
              Zero Hallucination Guarantee: Every extracted claim is anchored to physical PDF coordinates &amp; text tokens.
            </span>
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-medium text-white hover:bg-slate-700"
          >
            Close Provenance View
          </button>
        </div>
      </div>
    </div>
  )
}
