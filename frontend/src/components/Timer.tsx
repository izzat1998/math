import { useState, useEffect, useRef } from 'react'

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
  normal: 'bg-primary-800/60 text-white/90 border-primary-700/50',
  warning: 'bg-warning-500/15 text-warning-500 border-warning-500/30',
  urgent: 'bg-danger-500/15 text-danger-500 border-danger-500/40 animate-glow-pulse',
}

export default function Timer({ startedAt, durationMinutes, onExpire }: TimerProps) {
  const [remainingMs, setRemainingMs] = useState<number>(() => {
    const endTime = new Date(startedAt).getTime() + durationMinutes * 60 * 1000
    return Math.max(0, endTime - Date.now())
  })

  const onExpireRef = useRef(onExpire)
  onExpireRef.current = onExpire

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const endTime = new Date(startedAt).getTime() + durationMinutes * 60 * 1000

    const tick = () => {
      const diff = endTime - Date.now()
      if (diff <= 0) {
        setRemainingMs(0)
        if (intervalRef.current) clearInterval(intervalRef.current)
        onExpireRef.current()
        return
      }
      setRemainingMs(diff)
    }

    intervalRef.current = setInterval(tick, 1000)

    // Force immediate update when tab becomes visible again
    // (browsers throttle timers in background tabs)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [startedAt, durationMinutes])

  const h = Math.floor(remainingMs / 3600000)
  const m = Math.floor((remainingMs % 3600000) / 60000)
  const s = Math.floor((remainingMs % 60000) / 1000)
  const formatted = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  const urgency = getUrgency(remainingMs)

  return (
    <div
      role="timer"
      aria-live="polite"
      className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border text-sm transition-all duration-300 ${urgencyStyles[urgency]}`}
    >
      {/* Pulsing dot indicator */}
      <span className="relative flex h-2 w-2">
        <span className={`absolute inset-0 rounded-full ${
          urgency === 'urgent' ? 'bg-danger-500 animate-pulse-urgent' :
          urgency === 'warning' ? 'bg-warning-500 animate-pulse-urgent' :
          'bg-accent-400'
        } opacity-75`} />
        <span className={`relative inline-flex rounded-full h-2 w-2 ${
          urgency === 'urgent' ? 'bg-danger-500' :
          urgency === 'warning' ? 'bg-warning-500' :
          'bg-accent-400'
        }`} />
      </span>
      <span className="font-mono tabular-nums font-bold tracking-tight text-[15px]">
        {formatted}
      </span>
    </div>
  )
}
