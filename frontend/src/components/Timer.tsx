import { useState, useEffect } from 'react'

interface TimerProps {
  startedAt: string
  durationMinutes: number
  onExpire: () => void
}

type Urgency = 'normal' | 'warning' | 'urgent'

function getUrgency(ms: number): Urgency {
  const minutes = ms / 60000
  if (minutes <= 5) return 'urgent'
  if (minutes <= 10) return 'warning'
  return 'normal'
}

const urgencyStyles: Record<Urgency, string> = {
  normal: 'bg-slate-100 text-slate-700',
  warning: 'bg-warning-50 text-warning-600 border-warning-200',
  urgent: 'bg-danger-50 text-danger-600 border-danger-200 animate-pulse-urgent',
}

const urgencyIcon: Record<Urgency, string> = {
  normal: 'text-slate-400',
  warning: 'text-warning-500',
  urgent: 'text-danger-500',
}

export default function Timer({ startedAt, durationMinutes, onExpire }: TimerProps) {
  const [remainingMs, setRemainingMs] = useState<number>(() => {
    const endTime = new Date(startedAt).getTime() + durationMinutes * 60 * 1000
    return Math.max(0, endTime - Date.now())
  })

  useEffect(() => {
    const endTime = new Date(startedAt).getTime() + durationMinutes * 60 * 1000

    const tick = () => {
      const diff = endTime - Date.now()
      if (diff <= 0) {
        setRemainingMs(0)
        onExpire()
        return
      }
      setRemainingMs(diff)
    }

    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [startedAt, durationMinutes, onExpire])

  const h = Math.floor(remainingMs / 3600000)
  const m = Math.floor((remainingMs % 3600000) / 60000)
  const s = Math.floor((remainingMs % 60000) / 1000)
  const formatted = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  const urgency = getUrgency(remainingMs)

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${urgencyStyles[urgency]}`}>
      <svg className={`w-4 h-4 ${urgencyIcon[urgency]}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
      <span className="font-mono tabular-nums font-bold">{formatted}</span>
    </div>
  )
}
