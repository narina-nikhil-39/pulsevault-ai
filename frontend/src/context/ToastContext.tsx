import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'

export type ToastType = 'error' | 'warning' | 'info' | 'success'

export interface ToastItem {
  id: string
  type: ToastType
  title: string
  message: string
  timestamp: number
  duration?: number
}

// Global event emitter for triggering toasts from non-React modules (such as api.ts)
type ToastListener = (toast: ToastItem) => void
const listeners = new Set<ToastListener>()

export function toastNotify(toast: Omit<ToastItem, 'id' | 'timestamp'>) {
  const item: ToastItem = {
    ...toast,
    id: `toast-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: Date.now(),
    duration: toast.duration ?? 5000,
  }
  listeners.forEach((fn) => fn(item))
}

interface ToastContextValue {
  toasts: ToastItem[]
  addToast: (toast: Omit<ToastItem, 'id' | 'timestamp'>) => void
  removeToast: (id: string) => void
  clearToasts: () => void
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const addToast = useCallback((toast: Omit<ToastItem, 'id' | 'timestamp'>) => {
    toastNotify(toast)
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const clearToasts = useCallback(() => {
    setToasts([])
  }, [])

  // Subscribe to the global toastNotify emitter
  useEffect(() => {
    const handleNewToast: ToastListener = (item) => {
      setToasts((prev) => [...prev, item])

      if (item.duration && item.duration > 0) {
        setTimeout(() => {
          setToasts((current) => current.filter((t) => t.id !== item.id))
        }, item.duration)
      }
    }

    listeners.add(handleNewToast)
    return () => {
      listeners.delete(handleNewToast)
    }
  }, [])

  // Real-time Network Connectivity Interceptors
  useEffect(() => {
    function handleOffline() {
      toastNotify({
        type: 'warning',
        title: 'Network Disconnected',
        message: 'Terminal lost connection to the hospital gateway. Using offline mode.',
        duration: 7000,
      })
    }

    function handleOnline() {
      toastNotify({
        type: 'success',
        title: 'Connection Restored',
        message: 'Reconnected to hospital gateway. Synchronizing live patient records.',
        duration: 4000,
      })
    }

    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)

    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [])

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, clearToasts }}>
      {children}
      {/* Floating Toast Notification Container */}
      <div
        className="fixed top-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none"
        aria-live="polite"
        role="region"
      >
        {toasts.map((toast) => {
          const typeStyles: Record<
            ToastType,
            { bg: string; border: string; text: string; icon: string; iconBg: string }
          > = {
            error: {
              bg: 'bg-rose-50/95',
              border: 'border-rose-200',
              text: 'text-rose-900',
              icon: '✕',
              iconBg: 'bg-rose-600 text-white',
            },
            warning: {
              bg: 'bg-amber-50/95',
              border: 'border-amber-200',
              text: 'text-amber-900',
              icon: '⚠️',
              iconBg: 'bg-amber-500 text-white',
            },
            success: {
              bg: 'bg-emerald-50/95',
              border: 'border-emerald-200',
              text: 'text-emerald-900',
              icon: '✓',
              iconBg: 'bg-emerald-600 text-white',
            },
            info: {
              bg: 'bg-blue-50/95',
              border: 'border-blue-200',
              text: 'text-blue-900',
              icon: 'ℹ️',
              iconBg: 'bg-blue-600 text-white',
            },
          }

          const style = typeStyles[toast.type]

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-2xl border ${style.border} ${style.bg} ${style.text} shadow-lg backdrop-blur-sm transition-all duration-300 animate-slide-in`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-xl font-bold text-xs ${style.iconBg}`}
              >
                {style.icon}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold leading-tight">{toast.title}</div>
                <div className="text-[11px] opacity-90 mt-0.5 leading-snug break-words">
                  {toast.message}
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                className="shrink-0 text-slate-400 hover:text-slate-700 text-xs font-bold p-0.5 rounded cursor-pointer"
                aria-label="Dismiss notification"
              >
                ✕
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}
