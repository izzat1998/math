import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import type { ReactNode } from 'react'

type ToastVariant = 'success' | 'error' | 'warning'

interface Toast {
  id: number
  message: string
  variant: ToastVariant
}

interface ToastContextType {
  toast: (message: string, variant?: ToastVariant) => void
}

const ToastContext = createContext<ToastContextType | null>(null)

let nextId = 0

const variantStyles: Record<ToastVariant, string> = {
  success: 'bg-success-50 border-success-100 text-success-700',
  error: 'bg-danger-50 border-danger-100 text-danger-700',
  warning: 'bg-warning-50 border-warning-100 text-warning-600',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timeoutIds = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  // Cleanup all toast timers on unmount
  useEffect(() => {
    return () => {
      timeoutIds.current.forEach(tid => clearTimeout(tid))
    }
  }, [])

  const toast = useCallback((message: string, variant: ToastVariant = 'error') => {
    const id = ++nextId
    const MAX_TOASTS = 5
    setToasts((prev) => {
      const next = [...prev, { id, message, variant }]
      return next.length > MAX_TOASTS ? next.slice(-MAX_TOASTS) : next
    })
    const timeoutId = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
      timeoutIds.current.delete(id)
    }, 3000)
    timeoutIds.current.set(id, timeoutId)
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {toasts.length > 0 && (
        <div role="status" aria-live="polite" aria-atomic="true" className="fixed bottom-20 inset-x-0 z-50 flex flex-col items-center gap-2 px-4 pointer-events-none sm:bottom-auto sm:top-4 sm:right-4 sm:left-auto sm:items-end">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`pointer-events-auto px-4 py-2.5 rounded-xl border text-sm font-medium shadow-lg animate-slide-up ${variantStyles[t.variant]}`}
            >
              {t.message}
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextType {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
