import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import api from '../api/client'
import type { ReactNode } from 'react'
import type { UpcomingExam } from '../api/types'
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
  const { isAuthenticated, fullName } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [upcoming, setUpcoming] = useState<UpcomingExam['exam']>(null)
  const [upcomingLoaded, setUpcomingLoaded] = useState(false)
  const [starting, setStarting] = useState<string | null>(null)
  const [myElo, setMyElo] = useState<number | null>(null)
  const [inviteCode, setInviteCode] = useState('')
  const [codeError, setCodeError] = useState('')
  const [codeLoading, setCodeLoading] = useState(false)

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login', { replace: true })
      return
    }
    api.get<UpcomingExam>('/exams/upcoming/').then(({ data }) => {
      setUpcoming(data.exam)
      setUpcomingLoaded(true)
    }).catch(() => setUpcomingLoaded(true))

    api.get<{ current_elo: number }>('/me/elo-history/').then(({ data }) => {
      setMyElo(data.current_elo)
    }).catch(() => {})
  }, [isAuthenticated, navigate])

  const startPractice = async (mode: 'light' | 'medium'): Promise<void> => {
    setStarting(mode)
    try {
      const { data } = await api.post('/practice/start/', { mode })
      navigate(`/practice/${data.id}`)
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Xatolik yuz berdi'
      toast(msg, 'error')
      setStarting(null)
    }
  }

  if (!isAuthenticated) return null

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

  return (
    <div className="min-h-screen-dvh bg-white">
      {/* Hero header */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-700 via-primary-800 to-primary-900" />
        <DotPattern />
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-accent-400/[0.07] rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl" />

        <div className="relative max-w-2xl mx-auto px-5 pt-6 pb-10">
          {/* Nav row */}
          <div className="flex items-center justify-between mb-10">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-white/[0.12] backdrop-blur-sm border border-white/[0.08] flex items-center justify-center">
                <span className="text-sm font-extrabold text-white/90">M</span>
              </div>
              <span className="text-[13px] font-semibold text-white/40 tracking-wide">MATH EXAM</span>
            </div>
            <div className="flex items-center gap-2.5">
              {myElo !== null && <EloBadge elo={myElo} />}
              <div className="flex items-center gap-2 pl-2 border-l border-white/10">
                <span className="text-[13px] text-white/50 font-medium">{fullName}</span>
                <div className="w-7 h-7 rounded-lg bg-white/[0.12] border border-white/[0.08] flex items-center justify-center">
                  <span className="text-[11px] font-bold text-white/80">{userInitial}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Welcome text */}
          <div>
            <h1 className="text-[28px] font-extrabold text-white tracking-tight leading-tight">
              Salom, {firstName}
            </h1>
            <p className="text-[15px] text-white/40 mt-1.5 font-medium">
              Mashq yoki haqiqiy imtihonni tanlang
            </p>
          </div>
        </div>
      </div>

      {/* Cards */}
      <div className="max-w-2xl mx-auto px-5 -mt-1">
        <div className="space-y-3.5">
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
            animationDelay="60ms"
            onClick={() => startPractice('medium')}
          />

          {/* Real exam */}
          <div
            className={CARD_CLASS}
            style={{ animationDelay: '120ms' }}
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

            {!upcomingLoaded ? (
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
              <div className="space-y-3">
                <div className="h-11 flex items-center justify-center text-sm text-slate-300 font-medium">
                  Rejalashtirilgan imtihon yo'q
                </div>
                <div className="border-t border-slate-100 pt-3">
                  <p className="text-xs text-slate-400 font-medium mb-2">Taklif kodingiz bormi?</p>
                  {codeError && (
                    <p className="text-xs text-danger-500 font-medium mb-2">{codeError}</p>
                  )}
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault()
                      if (!inviteCode.trim()) return
                      setCodeError('')
                      setCodeLoading(true)
                      try {
                        const { data } = await api.post('/auth/invite-code/', {
                          code: inviteCode,
                          full_name: fullName || 'Talaba',
                        })
                        if (data.exam_id) {
                          navigate(`/exam/${data.exam_id}`)
                        }
                      } catch {
                        setCodeError("Kod noto'g'ri yoki ishlatilgan")
                      } finally {
                        setCodeLoading(false)
                      }
                    }}
                    className="flex gap-2"
                  >
                    <input
                      type="text"
                      placeholder="XXXX-XXXX"
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                      className="!h-10 !rounded-xl !border-[1.5px] !font-mono !tracking-[0.15em] !text-center !text-sm !font-bold !text-primary-500 flex-1"
                    />
                    <button
                      type="submit"
                      disabled={codeLoading || !inviteCode.trim()}
                      className="h-10 px-4 rounded-xl bg-primary-800 text-white font-bold text-sm disabled:opacity-50 transition-all active:scale-[0.97] hover:bg-primary-700 shrink-0"
                    >
                      {codeLoading ? <LoadingSpinner size="sm" /> : 'Kirish'}
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-center gap-5 mt-10 mb-8 text-[13px] text-slate-300 font-medium">
          <Link to="/leaderboard" className="hover:text-primary-500 transition-colors">
            Reyting jadvali
          </Link>
          <span className="w-1 h-1 rounded-full bg-slate-200" />
          <Link to="/admin" className="hover:text-primary-500 transition-colors">
            Admin panel
          </Link>
        </div>
      </div>
    </div>
  )
}
