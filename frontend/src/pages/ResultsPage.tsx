import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import api from '../api/client'
import type { ExamResults, AnswerBreakdown } from '../api/types'
import EloChangeCard from '../components/EloChangeCard'
import LoadingSpinner from '../components/LoadingSpinner'
import { useTelegram } from '../hooks/useTelegram'
import { useMobileDetect } from '../hooks/useMobileDetect'

function ScoreCircle({ value, total, size = 160 }: { value: number; total: number; size?: number }) {
  const radius = (size - 20) / 2
  const circumference = 2 * Math.PI * radius
  const progress = total > 0 ? value / total : 0
  const offset = circumference * (1 - progress)
  const percent = Math.round(progress * 100)
  const isGood = progress >= 0.7

  return (
    <div className="relative animate-count-up" style={{ width: size, height: size }}>
      {/* Glow effect for good scores */}
      {isGood && (
        <div
          className="absolute inset-0 rounded-full blur-2xl opacity-20"
          style={{ background: `radial-gradient(circle, #06b6d4 0%, transparent 70%)` }}
        />
      )}
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={10}
          className="text-slate-100"
        />
        {/* Progress ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={10}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
          style={{
            stroke: isGood
              ? 'url(#scoreGradient)'
              : progress >= 0.5 ? '#f59e0b' : '#f43f5e',
          }}
        />
        <defs>
          <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-extrabold text-slate-800 leading-none tracking-tight">
          {value}
        </span>
        <span className="text-sm font-bold text-slate-400 mt-0.5">
          / {total}
        </span>
        <span className={`text-xs font-bold mt-1.5 px-2 py-0.5 rounded-full ${
          isGood ? 'bg-accent-500/10 text-accent-600' :
          progress >= 0.5 ? 'bg-warning-500/10 text-warning-600' :
          'bg-danger-500/10 text-danger-600'
        }`}>
          {percent}%
        </span>
      </div>
    </div>
  )
}

function mcqCellClass(answered: boolean, correct: boolean | undefined): string {
  if (!answered) return 'bg-slate-50 text-slate-300 ring-1 ring-slate-100'
  if (correct) return 'bg-success-50 text-success-600 ring-1 ring-success-200'
  return 'bg-danger-50 text-danger-500 ring-1 ring-danger-200'
}

function subPartBadgeClass(part: { is_correct: boolean } | undefined): string {
  if (!part) return 'bg-slate-100 text-slate-400'
  if (part.is_correct) return 'bg-success-100 text-success-700'
  return 'bg-danger-100 text-danger-700'
}

function subPartLabel(part: { is_correct: boolean } | undefined): string {
  if (!part) return "—"
  if (part.is_correct) return "To'g'ri"
  return "Noto'g'ri"
}

function SubPartDetail({ label, part }: { label: string; part: AnswerBreakdown | undefined }) {
  if (!part) return null
  return (
    <div className="flex gap-4 text-slate-500">
      <span>{label}) Siz: <span className="font-semibold text-slate-700">{part.student_answer}</span></span>
    </div>
  )
}

export default function ResultsPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const [results, setResults] = useState<ExamResults | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedQ, setExpandedQ] = useState<number | null>(null)
  const { isTelegram, showBackButton, hideBackButton, hapticNotification } = useTelegram()
  const { isMobile } = useMobileDetect()

  useEffect(() => {
    api.get<ExamResults>(`/sessions/${sessionId}/results/`).then(({ data }) => {
      setResults(data)
      hapticNotification('success')
    }).catch((err) => {
      setError('Failed to load results. Please try again.')
      console.error(err)
    })
  }, [sessionId, hapticNotification])

  useEffect(() => {
    if (isTelegram) {
      showBackButton(() => navigate('/'))
      return () => hideBackButton()
    }
  }, [isTelegram, showBackButton, hideBackButton, navigate])

  if (error) {
    return (
      <div className="min-h-screen-dvh flex items-center justify-center bg-slate-50 bg-noise px-4">
        <div className="text-center">
          <p className="text-danger-600 font-semibold mb-4">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="text-sm text-primary-600 font-medium hover:underline"
          >
            Bosh sahifaga qaytish
          </button>
        </div>
      </div>
    )
  }

  if (!results) {
    return <LoadingSpinner fullScreen label="Natijalar yuklanmoqda..." />
  }

  // Exam still open — show waiting screen
  if (!results.exam_closed) {
    return (
      <div className="min-h-screen-dvh bg-slate-50 bg-noise flex flex-col items-center justify-center px-4">
        <div className="bg-white rounded-3xl shadow-xl border border-slate-200/60 p-8 max-w-sm w-full text-center">
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-primary-50 flex items-center justify-center">
            <svg className="w-8 h-8 text-primary-500 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-slate-800 mb-2">
            Imtihon davom etmoqda
          </h2>
          <p className="text-sm text-slate-500 mb-4">
            {results.message || "Natijalar imtihon yopilgandan keyin e'lon qilinadi"}
          </p>
          {results.exam_title && (
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
              {results.exam_title}
            </p>
          )}
          {results.is_auto_submitted && (
            <div className="mt-4 flex items-center justify-center gap-2 p-2 bg-warning-50 border border-warning-200/50 rounded-xl">
              <span className="text-warning-500 text-sm">⚡</span>
              <p className="text-[12px] text-warning-700 font-medium">Vaqt tugadi — avtomatik topshirildi</p>
            </div>
          )}
          {!isTelegram && (
            <Link
              to="/"
              className="mt-5 inline-flex items-center gap-1.5 text-sm text-primary-600 font-semibold hover:text-primary-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
              </svg>
              Bosh sahifaga qaytish
            </Link>
          )}
        </div>
      </div>
    )
  }

  // Count unique question numbers to avoid inflating totals from sub-parts (a, b)
  const uniqueCorrectQuestions = new Set(
    results.breakdown.filter((b) => b.is_correct).map((b) => b.question_number)
  )
  const uniqueAnsweredQuestions = new Set(
    results.breakdown.map((b) => b.question_number)
  )
  const correctCount = uniqueCorrectQuestions.size
  const wrongCount = uniqueAnsweredQuestions.size - correctCount
  const mcqAnswered = new Set(
    results.breakdown.filter((b) => b.question_number <= 35).map((b) => b.question_number)
  ).size
  const unansweredMcq = 35 - mcqAnswered
  const scoreTotal = results.exercises_total
  const scoreValue = results.exercises_correct
  const gridCols = isMobile ? 5 : 7
  const progress = scoreTotal > 0 ? scoreValue / scoreTotal : 0

  return (
    <div className="min-h-screen-dvh bg-slate-50 bg-noise pb-safe">
      {/* Hero section with dark header */}
      <div className="bg-gradient-to-b from-primary-800 via-primary-700 to-slate-50 pt-6 pb-24 px-4 relative overflow-hidden">
        {/* Decorative glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[300px] h-[200px] bg-accent-500/10 rounded-full blur-[80px]" />

        {!isTelegram && (
          <Link
            to="/"
            className="relative z-10 inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80 mb-6 transition-colors active:scale-95 font-medium"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
            Bosh sahifa
          </Link>
        )}

        {results.exam_title && (
          <p className="relative z-10 text-[13px] font-semibold text-white/40 text-center tracking-wide uppercase">
            {results.exam_title}
          </p>
        )}
      </div>

      {/* Score circle — overlaps the dark header */}
      <div className="flex justify-center -mt-20 mb-4 relative z-10">
        <div className="bg-white rounded-3xl p-5 shadow-xl shadow-slate-200/80 border border-slate-200/60">
          <ScoreCircle value={scoreValue} total={scoreTotal} size={isMobile ? 150 : 170} />
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 animate-slide-up" style={{ animationDelay: '0.15s', animationFillMode: 'both' }}>
        {/* Score message */}
        <p className="text-center text-sm font-semibold text-slate-400 mb-4">
          {progress >= 0.7
            ? 'Yaxshi natija!'
            : progress >= 0.5
              ? 'O\'rtacha natija'
              : 'Mashq qilishda davom eting'}
        </p>

        {/* Stats chips */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-success-50 text-success-700 text-xs font-bold ring-1 ring-success-200/50">
            <span className="w-1.5 h-1.5 rounded-full bg-success-500" />
            {correctCount} to'g'ri
          </span>
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-danger-50 text-danger-600 text-xs font-bold ring-1 ring-danger-200/50">
            <span className="w-1.5 h-1.5 rounded-full bg-danger-500" />
            {wrongCount} noto'g'ri
          </span>
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 text-slate-500 text-xs font-bold ring-1 ring-slate-200/50">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
            {unansweredMcq} bo'sh
          </span>
        </div>

        {results.elo && <EloChangeCard elo={results.elo} />}

        {results.is_auto_submitted && (
          <div className="mb-4 flex items-center gap-2.5 p-3 bg-warning-50 border border-warning-200/50 rounded-2xl">
            <span className="text-warning-500 text-sm">⚡</span>
            <p className="text-[13px] text-warning-700 font-medium">Vaqt tugadi — avtomatik topshirildi</p>
          </div>
        )}

        {/* Questions 1-35 grid */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-4 mb-3">
          <h2 className="text-[13px] font-bold text-slate-500 mb-3 tracking-wide uppercase">Test savollari</h2>
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}>
            {Array.from({ length: 35 }, (_, i) => i + 1).map((q) => {
              const entry = results.breakdown.find((b) => b.question_number === q && !b.sub_part)
              const answered = !!entry
              const correct = entry?.is_correct
              const isExpanded = results.exam_closed && expandedQ === q && answered
              return (
                <div key={q} className="flex flex-col">
                  <button
                    onClick={() => results.exam_closed && answered && setExpandedQ(expandedQ === q ? null : q)}
                    className={`aspect-square rounded-xl flex flex-col items-center justify-center transition-all active:scale-90 ${mcqCellClass(answered, correct)} ${results.exam_closed && answered ? 'cursor-pointer' : ''}`}
                  >
                    <span className="text-[13px] font-bold leading-none">
                      {!answered ? '—' : correct ? '✓' : '✗'}
                    </span>
                    <span className="text-[9px] font-semibold mt-0.5 opacity-60">{q}</span>
                  </button>
                  {isExpanded && entry && (
                    <div className="mt-1 rounded-xl bg-slate-50 border border-slate-200 px-2 py-1.5 text-[10px] text-slate-500 space-y-0.5 animate-scale-in">
                      <div>Siz: <span className="font-bold text-slate-700">{entry.student_answer}</span></div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Questions 36-45 */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-4 mb-5">
          <h2 className="text-[13px] font-bold text-slate-500 mb-3 tracking-wide uppercase">Ochiq savollar</h2>
          <div className="space-y-2">
            {Array.from({ length: 10 }, (_, i) => i + 36).map((q) => {
              const partA = results.breakdown.find((b) => b.question_number === q && b.sub_part === 'a')
              const partB = results.breakdown.find((b) => b.question_number === q && b.sub_part === 'b')
              return (
                <div key={q} className="p-3 bg-slate-50/70 rounded-xl border border-slate-100">
                  <div className="flex items-center gap-3">
                    <span className="w-7 font-bold text-slate-700 text-sm">{q}.</span>
                    <div className="flex gap-1.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-bold ${subPartBadgeClass(partA)}`}>
                        a) {subPartLabel(partA)}
                      </span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-bold ${subPartBadgeClass(partB)}`}>
                        b) {subPartLabel(partB)}
                      </span>
                    </div>
                  </div>
                  {results.exam_closed && (
                    <div className="mt-2 ml-10 space-y-1 text-xs">
                      <SubPartDetail label="a" part={partA} />
                      <SubPartDetail label="b" part={partB} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Leaderboard link */}
        <Link
          to="/leaderboard"
          className="w-full h-[52px] rounded-2xl bg-white border border-slate-200/60 shadow-sm text-slate-700 font-bold text-[15px] flex items-center justify-center gap-2.5 transition-all active:scale-[0.97] mb-3"
        >
          <svg className="w-5 h-5 text-accent-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
          </svg>
          Reyting jadvali
        </Link>

        {/* Share button */}
        <button
          onClick={() => {
            if (isTelegram && window.Telegram?.WebApp) {
              const text = `${results.exam_title}: ${scoreValue}/${scoreTotal} (${Math.round(progress * 100)}%)`
              window.Telegram.WebApp.showAlert(text)
            } else if (navigator.share) {
              navigator.share({
                title: 'Imtihon natijalari',
                text: `${results.exam_title}: ${scoreValue}/${scoreTotal} (${Math.round(progress * 100)}%)`,
              })
            }
          }}
          className="w-full h-[52px] rounded-2xl text-white font-bold text-[15px] flex items-center justify-center gap-2.5 transition-all active:scale-[0.97] shadow-lg shadow-primary-500/15 mb-6"
          style={{ background: 'linear-gradient(135deg, #1e3a5f, #0f2035)' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
          Natijani ulashish
        </button>
      </div>
    </div>
  )
}
