import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import api from '../api/client'
import type { ReactNode } from 'react'
import type { DashboardData } from '../api/types'
import LoadingSpinner from '../components/LoadingSpinner'
import EloBadge from '../components/EloBadge'
import DotPattern from '../components/DotPattern'
import { ArrowRightIcon, LightningIcon, ClockIcon, DocumentIcon } from '../components/icons'

const CARD_CLASS = 'group bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.04)] p-5 animate-slide-up'
const CARD_HOVER_CLASS = `${CARD_CLASS} cursor-pointer hover:shadow-[0_1px_3px_rgba(0,0,0,0.06),0_12px_32px_rgba(0,0,0,0.08)] transition-shadow`

interface PracticeCardProps {
  mode: 'light' | 'medium'
  icon: ReactNode
  title: string
  badge: string
  badgeColor: string
  description: string
  loading: boolean
  disabled: boolean
  animationDelay?: string
  onClick: () => void
}

function PracticeCard({
  icon,
  title,
  badge,
  badgeColor,
  description,
  loading,
  disabled,
  animationDelay,
  onClick,
}: PracticeCardProps) {
  return (
    <div
      className={CARD_HOVER_CLASS}
      style={animationDelay ? { animationDelay } : undefined}
      onClick={() => !disabled && onClick()}
    >
      <div className="flex items-center gap-4">
        {icon}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-slate-800 text-[15px] tracking-tight">{title}</h3>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${badgeColor}`}>
              {badge}
            </span>
          </div>
          <p className="text-[13px] text-slate-400 font-medium mt-0.5">{description}</p>
        </div>
        <div className="shrink-0">
          {loading ? (
            <LoadingSpinner size="sm" />
          ) : (
            <div className="w-9 h-9 rounded-xl bg-primary-800 flex items-center justify-center group-hover:bg-primary-700 transition-colors">
              <ArrowRightIcon className="w-4 h-4 text-white" strokeWidth={2.5} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { fullName, logout } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [dashboardLoaded, setDashboardLoaded] = useState(false)
  const [starting, setStarting] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    api.get<DashboardData>('/me/dashboard/').then(({ data }) => {
      if (!cancelled) {
        setDashboard(data)
        setDashboardLoaded(true)
      }
    }).catch(() => {
      if (!cancelled) {
        setDashboardLoaded(true)
        toast('Dashboard ma\'lumotlarini yuklashda xatolik', 'error')
      }
    })

    return () => { cancelled = true }
  }, [toast])

  const startPractice = async (mode: 'light' | 'medium'): Promise<void> => {
    setStarting(mode)
    try {
      const { data } = await api.post('/practice/start/', { mode })
      navigate(`/practice/${data.id}`)
    } catch (err) {
      const error = err as { response?: { data?: { error?: string } } }
      const msg = error.response?.data?.error || 'Xatolik yuz berdi'
      toast(msg, 'error')
      setStarting(null)
    }
  }

  const upcoming = dashboard?.upcoming_exam ?? null

  const upcomingTime = upcoming?.scheduled_start
    ? new Date(upcoming.scheduled_start).toLocaleString('uz-UZ', {
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  const firstName = fullName?.split(' ')[0] || 'Talaba'
  const userInitial = fullName?.charAt(0)?.toUpperCase() || '?'

  const raschDisplay = dashboard?.rasch_scaled !== null && dashboard?.rasch_scaled !== undefined
    ? Math.round(dashboard.rasch_scaled)
    : null

  return (
    <div className="min-h-screen-dvh bg-white">
      {/* Hero header */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-700 via-primary-800 to-primary-900" />
        <DotPattern />
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-accent-400/[0.07] rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl" />

        <div className="relative max-w-2xl mx-auto px-5 pt-6 pb-10">
          {/* Nav row */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-white/[0.12] backdrop-blur-sm border border-white/[0.08] flex items-center justify-center">
                <span className="text-sm font-extrabold text-white/90">M</span>
              </div>
              <span className="text-[13px] font-semibold text-white/40 tracking-wide">MATH EXAM</span>
            </div>
            <div className="flex items-center gap-2.5">
              {dashboard && <EloBadge elo={dashboard.elo} />}
              <div className="flex items-center gap-2 pl-2 border-l border-white/10">
                <span className="text-[13px] text-white/50 font-medium">{fullName}</span>
                <div className="w-7 h-7 rounded-lg bg-white/[0.12] border border-white/[0.08] flex items-center justify-center">
                  <span className="text-[11px] font-bold text-white/80">{userInitial}</span>
                </div>
              </div>
              <button
                onClick={() => { logout(); window.location.reload() }}
                className="text-sm text-white/40 hover:text-red-400 transition-colors font-medium pl-2 border-l border-white/10"
              >
                Chiqish
              </button>
            </div>
          </div>

          {/* Welcome text */}
          <div className="mb-6">
            <h1 className="text-[28px] font-extrabold text-white tracking-tight leading-tight">
              Salom, {firstName}
            </h1>
            <p className="text-[15px] text-white/40 mt-1.5 font-medium">
              Mashq yoki haqiqiy imtihonni tanlang
            </p>
          </div>

          {/* Rasch ability score */}
          {dashboardLoaded && raschDisplay !== null && (
            <div className="bg-white/[0.08] backdrop-blur-sm border border-white/[0.08] rounded-2xl p-4 mb-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-bold text-white/30 uppercase tracking-wider mb-1">Qobiliyat darajasi</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-[36px] font-extrabold text-white tracking-tight leading-none">{raschDisplay}</span>
                    <span className="text-[13px] font-semibold text-white/30">/ 75</span>
                  </div>
                </div>
                <div className="w-16 h-16 rounded-full border-[3px] border-white/10 flex items-center justify-center relative">
                  <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 64 64">
                    <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
                    <circle
                      cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="3"
                      strokeDasharray={`${(raschDisplay / 75) * 175.9} 175.9`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="text-xs font-bold text-white/60">{Math.round((raschDisplay / 75) * 100)}%</span>
                </div>
              </div>
            </div>
          )}

          {/* Achievements */}
          {dashboardLoaded && dashboard && dashboard.achievements.length > 0 && (
            <div className="flex gap-2 mt-3 overflow-x-auto pb-1 scrollbar-hide">
              {dashboard.achievements.map((a, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 bg-white/[0.08] border border-white/[0.08] rounded-xl px-3 py-2 shrink-0"
                >
                  <span className="text-base">{a.icon}</span>
                  <span className="text-[11px] font-bold text-white/60 whitespace-nowrap">{a.name}</span>
                </div>
              ))}
            </div>
          )}

          {/* Stats row */}
          {dashboardLoaded && dashboard && (
            <div className="grid grid-cols-3 gap-2.5 mt-4">
              <div className="bg-white/[0.06] border border-white/[0.06] rounded-xl p-3 text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <svg className="w-3.5 h-3.5 text-accent-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                  </svg>
                  <span className="text-[10px] font-bold text-white/25 uppercase tracking-wider">ELO</span>
                </div>
                <span className="text-lg font-extrabold text-white">{dashboard.elo}</span>
              </div>
              <div className="bg-white/[0.06] border border-white/[0.06] rounded-xl p-3 text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <span className="text-sm">🔥</span>
                  <span className="text-[10px] font-bold text-white/25 uppercase tracking-wider">Seriya</span>
                </div>
                <span className="text-lg font-extrabold text-white">{dashboard.current_streak}</span>
              </div>
              <div className="bg-white/[0.06] border border-white/[0.06] rounded-xl p-3 text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <svg className="w-3.5 h-3.5 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  <span className="text-[10px] font-bold text-white/25 uppercase tracking-wider">Imtihonlar</span>
                </div>
                <span className="text-lg font-extrabold text-white">{dashboard.exams_taken}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Cards */}
      <div className="max-w-2xl mx-auto px-5 -mt-1">
        <div className="space-y-3.5">
          {/* Upcoming exam card */}
          <div
            className={CARD_CLASS}
            style={{ animationDelay: '0ms' }}
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-50 to-primary-100/50 flex items-center justify-center shrink-0">
                <DocumentIcon className="w-5 h-5 text-primary-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-slate-800 text-[15px] tracking-tight">Haqiqiy imtihon</h3>
                  <span className="text-[10px] font-bold text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full uppercase tracking-wider">
                    PDF
                  </span>
                </div>
                <p className="text-[13px] text-slate-400 font-medium mt-0.5">45 ta savol &middot; 150 daqiqa</p>
              </div>
            </div>

            {!dashboardLoaded ? (
              <div className="h-11 flex items-center justify-center">
                <LoadingSpinner size="sm" />
              </div>
            ) : upcoming ? (
              <>
                <div className="mb-3.5 p-3 bg-slate-50 rounded-xl">
                  <p className="text-sm font-semibold text-slate-700">{upcoming.title}</p>
                  <p className="text-xs text-slate-400 mt-0.5 font-medium">{upcomingTime}</p>
                </div>
                <button
                  onClick={() => {
                    const path = upcoming.has_started
                      ? `/exam/${upcoming.id}`
                      : `/exam/${upcoming.id}/lobby`
                    navigate(path)
                  }}
                  className="w-full flex items-center justify-center gap-2.5 h-11 rounded-xl bg-primary-800 text-white font-bold text-sm transition-all active:scale-[0.97] hover:bg-primary-700"
                >
                  {upcoming.has_started ? 'Imtihonga kirish' : 'Kutish xonasiga kirish'}
                  <ArrowRightIcon className="w-4 h-4" strokeWidth={2.5} />
                </button>
              </>
            ) : (
              <div className="h-11 flex items-center justify-center text-sm text-slate-300 font-medium">
                Rejalashtirilgan imtihon yo'q
              </div>
            )}
          </div>

          {/* Practice cards */}
          <PracticeCard
            mode="light"
            icon={
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100/50 flex items-center justify-center shrink-0">
                <LightningIcon className="w-5 h-5 text-emerald-500" />
              </div>
            }
            title="Yengil mashq"
            badge="Tezkor"
            badgeColor="text-emerald-600 bg-emerald-50"
            description="6 ta savol &middot; 30 daqiqa"
            loading={starting === 'light'}
            disabled={!!starting}
            animationDelay="60ms"
            onClick={() => startPractice('light')}
          />

          <PracticeCard
            mode="medium"
            icon={
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-50 to-amber-100/50 flex items-center justify-center shrink-0">
                <ClockIcon className="w-5 h-5 text-amber-500" />
              </div>
            }
            title="O'rta mashq"
            badge="Tavsiya"
            badgeColor="text-amber-600 bg-amber-50"
            description="10 ta savol &middot; 60 daqiqa"
            loading={starting === 'medium'}
            disabled={!!starting}
            animationDelay="120ms"
            onClick={() => startPractice('medium')}
          />
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-2 gap-3 mt-5">
          <Link
            to="/leaderboard"
            className="flex items-center gap-3 bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.04)] p-4 hover:shadow-[0_1px_3px_rgba(0,0,0,0.06),0_12px_32px_rgba(0,0,0,0.08)] transition-shadow animate-slide-up"
            style={{ animationDelay: '180ms' }}
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-50 to-violet-100/50 flex items-center justify-center shrink-0">
              <svg className="w-4.5 h-4.5 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 0 0 7.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M18.75 4.236c.982.143 1.954.317 2.916.52A6.003 6.003 0 0 1 16.27 9.728M18.75 4.236V4.5c0 2.108-.966 3.99-2.48 5.228m0 0a6.023 6.023 0 0 1-2.52.556m0 0a6.023 6.023 0 0 1-2.52-.556" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-slate-700">Reyting</p>
              <p className="text-[11px] text-slate-400 font-medium">Reyting jadvali</p>
            </div>
          </Link>

          <Link
            to="/history"
            className="flex items-center gap-3 bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.04)] p-4 hover:shadow-[0_1px_3px_rgba(0,0,0,0.06),0_12px_32px_rgba(0,0,0,0.08)] transition-shadow animate-slide-up"
            style={{ animationDelay: '240ms' }}
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-50 to-sky-100/50 flex items-center justify-center shrink-0">
              <svg className="w-4.5 h-4.5 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-slate-700">Tarix</p>
              <p className="text-[11px] text-slate-400 font-medium">Imtihon natijalari</p>
            </div>
          </Link>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-center gap-5 mt-10 mb-8 text-[13px] text-slate-300 font-medium">
          <Link to="/leaderboard" className="hover:text-primary-500 transition-colors">
            Reyting jadvali
          </Link>
          <span className="w-1 h-1 rounded-full bg-slate-200" />
          <Link to="/history" className="hover:text-primary-500 transition-colors">
            Tarix
          </Link>
        </div>
      </div>
    </div>
  )
}
