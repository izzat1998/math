import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api/client'
import { useToast } from '../context/ToastContext'
import type { PracticeResults, PracticeBreakdown } from '../api/types'
import LoadingSpinner from '../components/LoadingSpinner'
import BackButton from '../components/BackButton'
import DotPattern from '../components/DotPattern'
import { CheckIcon, XIcon } from '../components/icons'

const MODE_LABELS: Record<string, string> = {
  light: 'Yengil mashq',
  medium: "O'rta mashq",
}

function ResultIcon({ correct }: { correct: boolean }) {
  if (correct) {
    return (
      <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5 bg-emerald-50 text-emerald-500">
        <CheckIcon className="w-4 h-4" />
      </div>
    )
  }
  return (
    <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5 bg-red-50 text-red-400">
      <XIcon className="w-4 h-4" />
    </div>
  )
}

function BreakdownItem({ item, index }: { item: PracticeBreakdown; index: number }) {
  return (
    <div
      className="rounded-xl border border-slate-100 p-4 animate-slide-up"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className="flex items-start gap-3">
        <ResultIcon correct={item.is_correct} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-700 leading-relaxed">
            <span className="text-[11px] text-slate-300 font-bold mr-1.5">{index + 1}.</span>
            {item.question.text}
          </p>

          <div className="mt-2.5 flex flex-wrap gap-2">
            <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-md ${
              item.is_correct
                ? 'bg-emerald-50 text-emerald-600'
                : 'bg-red-50 text-red-500'
            }`}>
              {item.student_answer || '\u2014'}
            </span>
            {!item.is_correct && (
              <span className="inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-md bg-slate-50 text-slate-500">
                To'g'ri: {item.question.correct_answer}
              </span>
            )}
          </div>

          {item.question.explanation && (
            <div className="mt-2.5 pl-3 border-l-2 border-slate-100">
              <p className="text-xs text-slate-400 leading-relaxed">{item.question.explanation}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function PracticeResultsPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [results, setResults] = useState<PracticeResults | null>(null)

  useEffect(() => {
    api.get<PracticeResults>(`/practice/${id}/results/`).then(({ data }) => {
      setResults(data)
    }).catch(() => {
      toast('Natijalar yuklanmadi', 'error')
      navigate('/', { replace: true })
    })
  }, [id, navigate, toast])

  if (!results) {
    return <LoadingSpinner fullScreen label="Natijalar yuklanmoqda..." />
  }

  const pct = results.total > 0 ? Math.round((results.score / results.total) * 100) : 0
  const modeLabel = MODE_LABELS[results.mode] ?? results.mode

  return (
    <div className="min-h-screen-dvh bg-white">
      {/* Hero score section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-800 via-primary-800 to-primary-900" />
        <DotPattern opacity="0.03" />

        <div className="relative max-w-2xl mx-auto px-5 pt-5 pb-10">
          <div className="flex items-center gap-3 mb-8">
            <BackButton />
            <span className="text-[13px] font-semibold text-white/40">{modeLabel}</span>
          </div>

          {/* Score display */}
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-2xl bg-white/[0.08] border border-white/[0.06] mb-4 animate-scale-in">
              <span className="text-4xl font-extrabold text-white tracking-tight">
                {pct}<span className="text-2xl text-white/40">%</span>
              </span>
            </div>
            <h2 className="text-[22px] font-extrabold text-white tracking-tight animate-slide-up">
              {results.score} / {results.total}
            </h2>
            <p className="text-sm text-white/35 mt-1 font-medium animate-slide-up" style={{ animationDelay: '50ms' }}>
              to'g'ri javob
            </p>
          </div>
        </div>
      </div>

      {/* Breakdown */}
      <div className="max-w-2xl mx-auto px-5 py-6">
        <div className="flex items-center gap-2.5 mb-4">
          <h3 className="text-[13px] font-bold text-slate-800 uppercase tracking-wider">Batafsil natija</h3>
          <div className="h-px flex-1 bg-slate-100" />
        </div>

        <div className="space-y-2.5">
          {results.breakdown.map((item, i) => (
            <BreakdownItem key={item.question.id} item={item} index={i} />
          ))}
        </div>

        <div className="mt-8 mb-6">
          <button
            onClick={() => navigate('/')}
            className="w-full h-12 rounded-xl bg-primary-800 text-white font-bold text-sm transition-all active:scale-[0.97] hover:bg-primary-700"
          >
            Bosh sahifaga qaytish
          </button>
        </div>
      </div>
    </div>
  )
}
