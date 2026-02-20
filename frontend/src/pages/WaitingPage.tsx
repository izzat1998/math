import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api/client'
import { useToast } from '../context/ToastContext'
import type { Exam } from '../api/types'
import { formatCountdown } from '../utils/formatTime'
import LoadingSpinner from '../components/LoadingSpinner'
import DotPattern from '../components/DotPattern'
import BackButton from '../components/BackButton'

const COUNTDOWN_UNITS = [
  { key: 'h', label: 'soat' },
  { key: 'm', label: 'daqiqa' },
  { key: 's', label: 'soniya' },
] as const

export default function WaitingPage() {
  const { examId } = useParams<{ examId: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [exam, setExam] = useState<Exam | null>(null)
  const [remaining, setRemaining] = useState<number>(0)
  const hasNavigated = useRef(false)

  useEffect(() => {
    api.get<Exam>(`/exams/${examId}/`).then(({ data }) => {
      setExam(data)
      setRemaining(new Date(data.scheduled_end).getTime() - Date.now())
    }).catch(() => {
      toast('Imtihon ma\'lumotlari yuklanmadi', 'error')
      navigate('/', { replace: true })
    })
  }, [examId, navigate, toast])

  useEffect(() => {
    if (!exam) return

    const endTime = new Date(exam.scheduled_end).getTime()
    let interval: ReturnType<typeof setInterval>

    const tick = (): void => {
      const diff = endTime - Date.now()
      if (diff <= 0) {
        clearInterval(interval)
        if (!hasNavigated.current) {
          hasNavigated.current = true
          navigate('/', { replace: true })
        }
        return
      }
      setRemaining(diff)
    }

    tick()
    interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [exam, navigate])

  if (!exam) {
    return <LoadingSpinner fullScreen label="Yuklanmoqda..." />
  }

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
          <span className="text-[13px] font-semibold text-white/30 uppercase tracking-wider">Natijalar</span>
        </div>
      </div>

      {/* Center content */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-5">
        <div className="text-center animate-slide-up">
          {/* Success check icon */}
          <div className="relative mx-auto mb-8 w-20 h-20">
            <div className="absolute inset-0 rounded-full bg-success-400/10 animate-pulse-urgent" />
            <div className="absolute inset-2 rounded-full bg-success-400/[0.06]" />
            <div className="absolute inset-0 flex items-center justify-center">
              <svg className="w-8 h-8 text-success-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
          </div>

          <h2 className="text-lg font-bold text-white tracking-tight mb-1">
            {exam.title}
          </h2>
          <p className="text-sm text-white/40 font-medium mb-2">
            Javoblaringiz muvaffaqiyatli topshirildi
          </p>
          <p className="text-xs text-white/25 font-medium mb-10">
            Natijalar imtihon oynasi yopilgandan keyin chiqariladi
          </p>

          <p className="text-[11px] text-white/25 font-bold uppercase tracking-[0.2em] mb-4">
            Natijalar chiqishiga
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

          {/* Home button */}
          <button
            onClick={() => navigate('/')}
            className="mt-10 inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white/[0.08] border border-white/[0.08] text-white/60 font-semibold text-sm hover:bg-white/[0.12] transition-colors active:scale-95"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Bosh sahifaga qaytish
          </button>

          <p className="text-xs text-white/15 mt-6 font-medium">
            Sahifa avtomatik yangilanadi
          </p>
        </div>
      </div>
    </div>
  )
}
