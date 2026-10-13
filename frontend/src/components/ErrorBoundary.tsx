import { Component, type ErrorInfo, type ReactNode } from 'react'
import { toastNotify } from '../context/ToastContext'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  onReset?: () => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
  copied: boolean
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
    copied: false,
  }

  public static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught an unhandled client error:', error, errorInfo)
    this.setState({ errorInfo })

    // Surface non-intrusive warning toast
    try {
      toastNotify({
        type: 'error',
        title: 'Component Fault Intercepted',
        message: error.message || 'An unexpected client error occurred in the clinical view.',
        duration: 8000,
      })
    } catch {
      // Ignore if toast provider not mounted
    }
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null, copied: false })
    if (this.props.onReset) {
      this.props.onReset()
    }
  }

  private handleReload = (): void => {
    window.location.reload()
  }

  private handleCopyDiagnostic = (): void => {
    const errorText = [
      `Error: ${this.state.error?.name}: ${this.state.error?.message}`,
      `Stack: ${this.state.error?.stack}`,
      `Component Stack: ${this.state.errorInfo?.componentStack}`,
      `User Agent: ${navigator.userAgent}`,
      `Timestamp: ${new Date().toISOString()}`,
    ].join('\n\n')

    navigator.clipboard.writeText(errorText).then(() => {
      this.setState({ copied: true })
      setTimeout(() => this.setState({ copied: false }), 2500)
    })
  }

  public render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="min-h-[400px] flex items-center justify-center p-6 bg-[#F8FAFC]">
          <div className="max-w-xl w-full rounded-2xl border border-amber-200/90 bg-white p-7 shadow-lg space-y-5 text-center">
            {/* Safety Shield Header */}
            <div className="flex flex-col items-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 border border-amber-200/80 mb-3 shadow-xs">
                <span className="text-2xl">🛡️</span>
              </div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                Clinical Workspace Safeguard Active
              </h2>
              <p className="text-xs text-slate-500 mt-1 max-w-md">
                An unexpected interface exception was caught and isolated to protect patient data integrity and clinical audit fidelity.
              </p>
            </div>

            {/* Error Message Pill */}
            {this.state.error && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-mono text-left break-words">
                <strong>Exception:</strong> {this.state.error.message}
              </div>
            )}

            {/* Diagnostic Stack Trace Disclosure */}
            {this.state.errorInfo && (
              <details className="text-left rounded-xl bg-slate-900 text-slate-200 p-3 text-[10px] font-mono border border-slate-800">
                <summary className="cursor-pointer text-slate-400 font-semibold select-none mb-1">
                  View Technical Diagnostic Stack
                </summary>
                <pre className="whitespace-pre-wrap overflow-x-auto max-h-40 pt-2 text-slate-300">
                  {this.state.error?.stack}
                  {this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}

            {/* Recovery Action Buttons */}
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReset}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-sm transition cursor-pointer"
              >
                Recover View
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                Reload Application
              </button>
              <button
                type="button"
                onClick={this.handleCopyDiagnostic}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                {this.state.copied ? '✓ Copied Diagnostics' : 'Copy Diagnostics'}
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
