import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api/client'
import { useToast } from '../context/ToastContext'
import type { LobbyInfo } from '../api/types'
import LoadingSpinner from '../components/LoadingSpinner'
import BackButton from '../components/BackButton'
import DotPattern from '../components/DotPattern'
import { formatCountdown } from '../utils/formatTime'

const COUNTDOWN_UNITS = [
  { key: 'h', label: 'soat' },
  { key: 'm', label: 'daqiqa' },
  { key: 's', label: 'soniya' },
] as const

export default function LobbyPage() {
  const { examId } = useParams<{ examId: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [lobby, setLobby] = useState<LobbyInfo | null>(null)
  const [remaining, setRemaining] = useState<number>(0)
  const hasNavigated = useRef(false)

  useEffect(() => {
    api.get<LobbyInfo>(`/exams/${examId}/lobby/`).then(({ data }) => {
      if (data.has_ended) {
        toast('Imtihon tugagan', 'error')
        navigate('/', { replace: true })
        return
      }
      if (data.has_started) {
        navigate(`/exam/${examId}`, { replace: true })
        return
      }
      setLobby(data)
      setRemaining(new Date(data.scheduled_start).getTime() - Date.now())
    }).catch(() => {
      toast('Kutish xonasi yuklanmadi', 'error')
      navigate('/', { replace: true })
    })
  }, [examId, navigate, toast])

  useEffect(() => {
    if (!lobby) return

    const startTime = new Date(lobby.scheduled_start).getTime()

    const tick = (): void => {
      const diff = startTime - Date.now()
      if (diff <= 0) {
        clearInterval(interval)
        if (!hasNavigated.current) {
          hasNavigated.current = true
          navigate(`/exam/${examId}`, { replace: true })
        }
        return
      }
      setRemaining(diff)
    }

    const interval = setInterval(tick, 1000)
    tick()
    return () => clearInterval(interval)
  }, [lobby, examId, navigate])

  if (!lobby) {
    return <LoadingSpinner fullScreen label="Yuklanmoqda..." />
  }

  const startTime = new Date(lobby.scheduled_start).toLocaleString('uz-UZ', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })

  const countdown = formatCountdown(remaining)

  return (
    <div className="min-h-screen-dvh flex flex-col">
      {/* Full-screen navy background */}
      <div className="absolute inset-0 bg-gradient-to-b from-primary-800 via-primary-800 to-primary-900" />
      <DotPattern opacity="0.03" size={32} />
      {/* Ambient glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-accent-400/[0.04] rounded-full blur-[120px]" />

      {/* Header */}
      <div className="relative z-10 max-w-2xl mx-auto w-full px-5 pt-6">
        <div className="flex items-center gap-3">
          <BackButton variant="ghost" />
          <span className="text-[13px] font-semibold text-white/30 uppercase tracking-wider">Kutish xonasi</span>
        </div>
      </div>

      {/* Center content */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-5">
        <div className="text-center animate-slide-up">
          {/* Pulsing ring */}
          <div className="relative mx-auto mb-8 w-20 h-20">
            <div className="absolute inset-0 rounded-full bg-accent-400/10 animate-pulse-urgent" />
            <div className="absolute inset-2 rounded-full bg-accent-400/[0.06]" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-3 h-3 rounded-full bg-accent-400" />
            </div>
          </div>

          <h2 className="text-lg font-bold text-white tracking-tight mb-1">
            {lobby.title}
          </h2>
          <p className="text-sm text-white/30 font-medium mb-10">
            {startTime}
          </p>

          <p className="text-[11px] text-white/25 font-bold uppercase tracking-[0.2em] mb-4">
            Boshlanishiga
          </p>

          {/* Countdown blocks */}
          <div className="flex items-center justify-center gap-3">
            {COUNTDOWN_UNITS.map(({ key, label }) => (
              <div key={key} className="text-center">
                <div className="w-[72px] h-[80px] rounded-xl bg-white/[0.06] border border-white/[0.06] flex items-center justify-center mb-1.5">
                  <span className="font-mono tabular-nums font-extrabold text-[32px] text-white tracking-tight">
                    {countdown[key]}
                  </span>
                </div>
                <span className="text-[10px] text-white/20 font-semibold uppercase tracking-wider">
                  {label}
                </span>
              </div>
            ))}
          </div>

          <p className="text-xs text-white/15 mt-10 font-medium">
            Imtihon avtomatik boshlanadi
          </p>
        </div>
      </div>
    </div>
  )
}
