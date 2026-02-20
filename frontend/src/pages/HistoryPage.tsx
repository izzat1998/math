import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import { useToast } from '../context/ToastContext'
import { useTelegram } from '../hooks/useTelegram'
import type { ExamHistoryEntry } from '../api/types'
import LoadingSpinner from '../components/LoadingSpinner'
import BackButton from '../components/BackButton'
import DotPattern from '../components/DotPattern'

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleString('uz-UZ', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function EloDelta({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="text-[12px] font-bold text-slate-300">—</span>
  if (delta > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[12px] font-bold text-success-600">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
        </svg>
        +{delta}
      </span>
    )
  }
  if (delta < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[12px] font-bold text-danger-600">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
        {delta}
      </span>
    )
  }
  return <span className="text-[12px] font-bold text-slate-300">0</span>
}

export default function HistoryPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { isTelegram, showBackButton, hideBackButton } = useTelegram()
  const [entries, setEntries] = useState<ExamHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (isTelegram) {
      showBackButton(() => navigate('/'))
      return () => hideBackButton()
    }
  }, [isTelegram, showBackButton, hideBackButton, navigate])

  useEffect(() => {
    api.get<ExamHistoryEntry[]>('/me/history/')
      .then(({ data }) => setEntries(data))
      .catch(() => {
        setError(true)
        toast('Tarix yuklanmadi', 'error')
      })
      .finally(() => setLoading(false))
  }, [toast])

  if (loading) {
    return <LoadingSpinner fullScreen label="Tarix yuklanmoqda..." />
  }

  return (
    <div className="min-h-screen-dvh bg-slate-50 bg-noise pb-safe">
      {/* Header */}
      <div className="bg-primary-800 pt-6 pb-20 px-5 relative overflow-hidden">
        <DotPattern opacity="0.03" />

        <div className="relative z-10 max-w-2xl mx-auto">
          {!isTelegram && (
            <div className="mb-4">
              <BackButton />
            </div>
          )}
          <p className="text-[13px] font-semibold text-white/40 text-center tracking-wide uppercase">
            Imtihon tarixi
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 -mt-12 relative z-10 animate-slide-up">
        {error ? (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-danger-50 border border-danger-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-danger-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-slate-800 mb-1">Xatolik yuz berdi</h3>
            <p className="text-sm text-slate-400 font-medium mb-4">Ma'lumotlarni yuklab bo'lmadi</p>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-500 text-white rounded-xl font-semibold text-sm hover:bg-primary-600 transition-colors active:scale-95"
            >
              Qayta yuklash
            </button>
          </div>
        ) : entries.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-slate-800 mb-1">Tarix bo'sh</h3>
            <p className="text-sm text-slate-400 font-medium">Siz hali birorta ham imtihon topshirmagansiz</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden mb-6">
            {entries.map((entry, idx) => {
              const scorePercent = entry.exercises_total > 0
                ? Math.round((entry.exercises_correct / entry.exercises_total) * 100)
                : 0

              return (
                <div
                  key={entry.session_id}
                  onClick={() => navigate(`/results/${entry.session_id}`)}
                  className={`flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-slate-50 transition-colors active:bg-slate-100 ${
                    idx < entries.length - 1 ? 'border-b border-slate-100' : ''
                  }`}
                >
                  {/* Score circle */}
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                    scorePercent >= 70
                      ? 'bg-success-50 text-success-600'
                      : scorePercent >= 40
                        ? 'bg-warning-50 text-warning-600'
                        : 'bg-danger-50 text-danger-600'
                  }`}>
                    <span className="text-sm font-extrabold">{scorePercent}%</span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-700 truncate">{entry.exam_title}</p>
                      {entry.is_auto_submitted && (
                        <span className="text-[9px] font-bold text-warning-600 bg-warning-50 px-1.5 py-0.5 rounded-full uppercase shrink-0">
                          Avto
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-[12px] text-slate-400 font-medium">
                        {entry.exercises_correct}/{entry.exercises_total} to'g'ri
                      </p>
                      {entry.rasch_scaled !== null && (
                        <>
                          <span className="w-0.5 h-0.5 rounded-full bg-slate-300" />
                          <p className="text-[12px] text-slate-400 font-medium">
                            Rasch: {Math.round(entry.rasch_scaled)}
                          </p>
                        </>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-300 font-medium mt-0.5">
                      {formatDate(entry.submitted_at)}
                    </p>
                  </div>

                  {/* ELO delta + arrow */}
                  <div className="flex items-center gap-2 shrink-0">
                    <EloDelta delta={entry.elo_delta} />
                    <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
