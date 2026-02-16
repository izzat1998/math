import { createContext, useContext, useState, useCallback } from 'react'
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

  const toast = useCallback((message: string, variant: ToastVariant = 'error') => {
    const id = ++nextId
    const MAX_TOASTS = 5
    setToasts((prev) => {
      const next = [...prev, { id, message, variant }]
      // Keep only the most recent toasts to prevent stack overflow
      return next.length > MAX_TOASTS ? next.slice(-MAX_TOASTS) : next
    })
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3000)
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {toasts.length > 0 && (
        <div className="fixed bottom-20 inset-x-0 z-50 flex flex-col items-center gap-2 px-4 pointer-events-none sm:bottom-auto sm:top-4 sm:right-4 sm:left-auto sm:items-end">
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
