export interface AsyncProgressTrackerProps {

  progress: number
  currentStep: string
  status: string
  error?: string | null
  filename?: string
}

export const PIPELINE_STAGES = [
  { key: 'document_uploaded', label: 'Upload Validated', percent: 15, icon: '📄' },
  { key: 'ocr_completed', label: 'Optical OCR Scan', percent: 30, icon: '🔍' },
  { key: 'entities_extracted', label: 'Entities Extracted', percent: 50, icon: '🧬' },
  { key: 'terminology_normalized', label: 'RxNorm & ICD-10 Mapped', percent: 65, icon: '📚' },
  { key: 'timeline_generated', label: 'Timeline Graph Built', percent: 80, icon: '📅' },
  { key: 'safety_checks_completed', label: 'Safety Engine Verified', percent: 90, icon: '🛡️' },
  { key: 'flashcard_generated', label: 'Flashcard Ready', percent: 100, icon: '⚡' },
]

export function AsyncProgressTracker({
  progress,
  currentStep,
  status,
  error,
  filename,
}: AsyncProgressTrackerProps) {
  const currentStageIndex = PIPELINE_STAGES.findIndex((s) => s.key === currentStep)
  const isFailed = status === 'failed' || Boolean(error)
  const isComplete = status === 'completed' || progress >= 100

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm space-y-4">
      {/* Header Info */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-xl font-bold text-xs ${
              isFailed
                ? 'bg-rose-100 text-rose-700'
                : isComplete
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-blue-100 text-blue-700 animate-pulse'
            }`}
          >
            {isFailed ? '✕' : isComplete ? '✓' : '⚙️'}
          </div>
          <div>
            <div className="text-xs font-bold text-slate-800">
              {isFailed
                ? 'Ingestion Pipeline Interrupted'
                : isComplete
                ? 'Clinical Ingestion Completed'
                : 'Asynchronous Ingestion in Progress…'}
            </div>
            {filename && (
              <div className="text-[10px] text-slate-500 font-mono truncate max-w-xs">
                {filename}
              </div>
            )}
          </div>
        </div>

        {/* Percentage Badge */}
        <div
          className={`font-mono text-xs font-bold px-2.5 py-1 rounded-full border ${
            isFailed
              ? 'bg-rose-50 border-rose-200 text-rose-700'
              : isComplete
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-blue-50 border-blue-200 text-blue-700'
          }`}
        >
          {isFailed ? 'Failed' : `${progress}%`}
        </div>
      </div>

      {/* Animated Gradient Progress Bar */}
      <div className="space-y-1">
        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200/60">
          <div
            className={`h-full transition-all duration-500 ease-out ${
              isFailed
                ? 'bg-rose-500'
                : isComplete
                ? 'bg-emerald-500'
                : 'bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-500 animate-[pulse_2s_infinite]'
            }`}
            style={{ width: `${Math.min(Math.max(progress, 5), 100)}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-slate-400 font-medium">
          <span>Intake</span>
          <span>OCR</span>
          <span>Extraction</span>
          <span>Terminology</span>
          <span>Safety</span>
          <span>Complete</span>
        </div>
      </div>

      {/* Stage Stepper List */}
      <div className="pt-2 border-t border-slate-100 space-y-2">
        <div className="text-[11px] font-semibold text-slate-700">Pipeline Stages:</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {PIPELINE_STAGES.map((stage, idx) => {
            const isStageDone = currentStageIndex > idx || isComplete
            const isStageActive = currentStageIndex === idx && !isComplete && !isFailed

            return (
              <div
                key={stage.key}
                className={`flex items-center gap-2 p-2 rounded-xl text-xs transition-all border ${
                  isStageDone
                    ? 'bg-emerald-50/60 border-emerald-200/60 text-emerald-900 font-medium'
                    : isStageActive
                    ? 'bg-blue-50 border-blue-300 text-blue-900 font-bold shadow-xs'
                    : 'bg-slate-50/50 border-slate-100 text-slate-400'
                }`}
              >
                <span className="text-sm shrink-0">{stage.icon}</span>
                <span className="truncate flex-1 text-[11px]">{stage.label}</span>
                <span className="shrink-0 text-[10px] font-mono">
                  {isStageDone ? '✓' : isStageActive ? '••' : `${stage.percent}%`}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Error Alert if failed */}
      {error && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
          <strong>Error:</strong> {error}
        </div>
      )}
    </div>
  )
}
