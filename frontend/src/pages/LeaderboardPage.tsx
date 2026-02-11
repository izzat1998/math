import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import type { LeaderboardResponse, EloHistoryResponse } from '../api/types'
import EloChart from '../components/EloChart'
import LoadingSpinner from '../components/LoadingSpinner'
import { useTelegram } from '../hooks/useTelegram'

function DeltaIndicator({ delta }: { delta: number }) {
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
  return (
    <span className="text-[12px] font-bold text-slate-300">—</span>
  )
}

function LeaderboardRow({
  rank,
  name,
  elo,
  exams,
  delta,
  isCurrent,
}: {
  rank: number
  name: string
  elo: number
  exams: number
  delta: number
  isCurrent: boolean
}) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 border-b border-slate-100 last:border-b-0 ${
      isCurrent ? 'bg-accent-50/50' : ''
    }`}>
      <span className={`w-6 text-center text-[13px] font-bold ${
        rank <= 3 ? 'text-slate-700' : 'text-slate-400'
      }`}>
        {rank}
      </span>

      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
        isCurrent
          ? 'bg-accent-500 text-white'
          : 'bg-primary-500/10 text-primary-600'
      }`}>
        <span className="text-xs font-bold">{name.charAt(0).toUpperCase()}</span>
      </div>

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold truncate ${isCurrent ? 'text-accent-700' : 'text-slate-700'}`}>
          {name}
          {isCurrent && <span className="ml-1.5 text-[10px] font-bold text-accent-500">(Siz)</span>}
        </p>
        <p className="text-[11px] text-slate-400">
          {exams} ta imtihon
        </p>
      </div>

      <div className="flex items-center gap-2">
        <DeltaIndicator delta={delta} />
        <span className="text-sm font-extrabold text-slate-800">{elo}</span>
      </div>
    </div>
  )
}

export default function LeaderboardPage() {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()
  const { isTelegram, showBackButton, hideBackButton } = useTelegram()
  const [data, setData] = useState<LeaderboardResponse | null>(null)
  const [eloHistory, setEloHistory] = useState<EloHistoryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isTelegram) {
      showBackButton(() => navigate('/'))
      return () => hideBackButton()
    }
  }, [isTelegram, showBackButton, hideBackButton, navigate])

  useEffect(() => {
    api.get<LeaderboardResponse>('/leaderboard/')
      .then(({ data }) => setData(data))
      .catch(() => setError('Failed to load leaderboard'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (isAuthenticated) {
      api.get<EloHistoryResponse>('/me/elo-history/')
        .then(({ data }) => setEloHistory(data))
        .catch(() => {})
    }
  }, [isAuthenticated])

  if (error) {
    return <div className="text-center text-red-400 p-8">{error}</div>
  }

  if (!data && loading) {
    return <LoadingSpinner fullScreen label="Reyting yuklanmoqda..." />
  }

  return (
    <div className="min-h-screen-dvh bg-slate-50 bg-noise pb-safe">
      {/* Header */}
      <div className="bg-primary-800 pt-6 pb-24 px-4 relative overflow-hidden">

        {!isTelegram && (
          <button
            onClick={() => navigate('/')}
            className="relative z-10 inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80 mb-4 transition-colors active:scale-95 font-medium"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Bosh sahifa
          </button>
        )}

        <p className="relative z-10 text-[13px] font-semibold text-white/40 text-center tracking-wide uppercase">
          Reyting jadvali
        </p>
      </div>

      {/* My Elo card */}
      {eloHistory && (
        <div className="flex justify-center -mt-16 mb-4 relative z-10 px-4">
          <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/80 border border-slate-200/60 p-5 w-full max-w-sm">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1">Sizning reytingingiz</p>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-extrabold text-slate-800 tracking-tight">{eloHistory.current_elo}</span>
              <span className="text-[13px] text-slate-400 font-medium">{eloHistory.exams_taken} ta imtihon</span>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 animate-slide-up" style={{ animationDelay: '0.1s', animationFillMode: 'both' }}>
        {/* List */}
        {loading ? (
          <div className="py-12">
            <LoadingSpinner label="Yuklanmoqda..." />
          </div>
        ) : data && data.entries.length === 0 ? (
          <div className="text-center py-12 text-sm text-slate-400">
            Hali ma'lumot yo'q
          </div>
        ) : data && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden mb-5">
            {data.entries.map((entry) => (
              <LeaderboardRow
                key={entry.student_id}
                rank={entry.rank}
                name={entry.full_name}
                elo={entry.elo}
                exams={entry.exams_taken}
                delta={entry.last_elo_delta}
                isCurrent={entry.is_current_user}
              />
            ))}

            {data.my_entry && !data.entries.some((e) => e.is_current_user) && (
              <>
                <div className="px-4 py-1.5 bg-slate-50 border-y border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Sizning o'rningiz</span>
                </div>
                <LeaderboardRow
                  rank={data.my_entry.rank}
                  name={data.my_entry.full_name}
                  elo={data.my_entry.elo}
                  exams={data.my_entry.exams_taken}
                  delta={data.my_entry.last_elo_delta}
                  isCurrent
                />
              </>
            )}
          </div>
        )}

        {/* Chart */}
        {eloHistory && eloHistory.history.length >= 2 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-4 mb-6">
            <h2 className="text-[13px] font-bold text-slate-500 mb-3 tracking-wide uppercase">Reyting dinamikasi</h2>
            <EloChart history={eloHistory.history} />
          </div>
        )}
      </div>
    </div>
  )
}
