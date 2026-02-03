import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api/client'
import { useToast } from '../context/ToastContext'
import type { PracticeSession, Question } from '../api/types'
import Timer from '../components/Timer'
import MathKeyboard from '../components/MathKeyboard'
import LoadingSpinner from '../components/LoadingSpinner'
import { ArrowLeftIcon, CheckIcon } from '../components/icons'

const MODE_LABELS: Record<string, string> = {
  light: 'Yengil mashq',
  medium: "O'rta mashq",
}

function questionPillClass(isCurrent: boolean, isAnswered: boolean): string {
  if (isCurrent) return 'bg-primary-800 text-white shadow-sm scale-110'
  if (isAnswered) return 'bg-primary-800/10 text-primary-700'
  return 'bg-slate-50 text-slate-300'
}

export default function PracticeExamPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [session, setSession] = useState<PracticeSession | null>(null)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [showKeyboard, setShowKeyboard] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.get<PracticeSession>(`/practice/${id}/`).then(({ data }) => {
      if (data.status === 'submitted') {
        navigate(`/practice/${id}/results`, { replace: true })
        return
      }
      setSession(data)
      setAnswers(data.answers || {})
    }).catch(() => {
      toast('Sessiya yuklanmadi', 'error')
      navigate('/', { replace: true })
    })
  }, [id, navigate, toast])

  const question: Question | null = session?.questions[currentIdx] ?? null

  const saveAnswer = useCallback((questionId: string, answer: string): void => {
    setAnswers(prev => ({ ...prev, [questionId]: answer }))
    api.post(`/practice/${id}/answer/`, { question_id: questionId, answer }).catch(() => {})
  }, [id])

  const handleSubmit = useCallback(async (): Promise<void> => {
    if (!session || submitted) return
    if (!confirm("Topshirishni xohlaysizmi? Topshirgandan keyin javoblarni o'zgartira olmaysiz.")) return

    try {
      await api.post(`/practice/${session.id}/submit/`)
      setSubmitted(true)
      navigate(`/practice/${session.id}/results`)
    } catch {
      toast('Topshirishda xatolik', 'error')
    }
  }, [session, submitted, navigate, toast])

  const handleExpire = useCallback((): void => {
    if (!session || submitted) return
    api.post(`/practice/${session.id}/submit/`).then(() => {
      setSubmitted(true)
      toast('Vaqt tugadi! Javoblar topshirildi.', 'success')
      navigate(`/practice/${session.id}/results`)
    }).catch(() => {
      toast('Vaqt tugadi, lekin topshirishda xatolik.', 'error')
    })
  }, [session, submitted, navigate, toast])

  const handleSymbol = useCallback((text: string): void => {
    if (!question || !inputRef.current) return
    const input = inputRef.current
    const start = input.selectionStart ?? input.value.length
    const end = input.selectionEnd ?? start
    const newVal = input.value.slice(0, start) + text + input.value.slice(end)
    saveAnswer(question.id, newVal)
    requestAnimationFrame(() => {
      const pos = start + text.length
      input.setSelectionRange(pos, pos)
      input.focus()
    })
  }, [question, saveAnswer])

  const handleBackspace = useCallback((): void => {
    if (!question || !inputRef.current) return
    const input = inputRef.current
    const start = input.selectionStart ?? input.value.length
    const end = input.selectionEnd ?? start
    let newVal: string
    if (start !== end) {
      newVal = input.value.slice(0, start) + input.value.slice(end)
    } else if (start > 0) {
      newVal = input.value.slice(0, start - 1) + input.value.slice(start)
    } else {
      return
    }
    saveAnswer(question.id, newVal)
    requestAnimationFrame(() => {
      const pos = start !== end ? start : Math.max(0, start - 1)
      input.setSelectionRange(pos, pos)
      input.focus()
    })
  }, [question, saveAnswer])

  const handleCursorMove = useCallback((dir: 'left' | 'right'): void => {
    if (!inputRef.current) return
    const input = inputRef.current
    const pos = input.selectionStart ?? 0
    const newPos = dir === 'left' ? Math.max(0, pos - 1) : Math.min(input.value.length, pos + 1)
    input.setSelectionRange(newPos, newPos)
    input.focus()
  }, [])

  const handleEnter = useCallback((): void => {
    if (!session) return
    if (currentIdx < session.questions.length - 1) {
      setCurrentIdx(prev => prev + 1)
    }
  }, [session, currentIdx])

  if (!session) {
    return <LoadingSpinner fullScreen label="Yuklanmoqda..." />
  }

  const currentAnswer = question ? (answers[question.id] || '') : ''
  const answeredCount = Object.values(answers).filter(Boolean).length
  const totalQuestions = session.questions.length
  const modeLabel = MODE_LABELS[session.mode] ?? session.mode
  const progress = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0

  return (
    <div className="min-h-screen-dvh flex flex-col bg-white">
      {/* Header */}
      <div className="bg-primary-800 shrink-0 z-30">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (confirm('Chiqishni xohlaysizmi? Javoblaringiz saqlanadi.')) navigate('/')
              }}
              className="w-8 h-8 rounded-lg bg-white/[0.08] flex items-center justify-center active:scale-90 transition-transform"
            >
              <ArrowLeftIcon className="w-4 h-4 text-white/60" />
            </button>
            <div>
              <p className="text-[13px] font-bold text-white tracking-tight">{modeLabel}</p>
              <p className="text-[11px] text-white/35 font-medium">{answeredCount} / {totalQuestions} javob berilgan</p>
            </div>
          </div>
          <Timer
            startedAt={session.started_at}
            durationMinutes={session.duration}
            onExpire={handleExpire}
          />
        </div>
        {/* Progress bar */}
        <div className="h-0.5 bg-white/[0.06]">
          <div
            className="h-full bg-accent-400 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Question area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-5 py-6">
          {question && (
            <div className="animate-fade-in" key={question.id}>
              {/* Question meta */}
              <div className="flex items-center gap-2.5 mb-5">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-primary-800 text-white text-xs font-bold">
                  {currentIdx + 1}
                </span>
                <div className="h-px flex-1 bg-slate-100" />
                <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">{question.topic}</span>
              </div>

              {/* Question text */}
              <div className="mb-6">
                <p className="text-[17px] text-slate-800 font-semibold leading-relaxed whitespace-pre-wrap">
                  {question.text}
                </p>
                {question.image && (
                  <img
                    src={question.image}
                    alt="Savol rasmi"
                    className="mt-5 max-w-full rounded-xl shadow-sm"
                  />
                )}
              </div>

              {/* Answer area */}
              {question.answer_type === 'multiple_choice' && question.choices ? (
                <div className="space-y-2.5">
                  {question.choices.map((choice, i) => {
                    const letter = String.fromCharCode(65 + i)
                    const isSelected = currentAnswer === choice
                    return (
                      <button
                        key={i}
                        onClick={() => saveAnswer(question.id, choice)}
                        disabled={submitted}
                        className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all active:scale-[0.98] text-left ${
                          isSelected
                            ? 'border-primary-700 bg-primary-800/[0.03]'
                            : 'border-slate-100 bg-white hover:border-slate-200'
                        }`}
                      >
                        <span className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 transition-colors ${
                          isSelected
                            ? 'bg-primary-800 text-white'
                            : 'bg-slate-50 text-slate-400'
                        }`}>
                          {letter}
                        </span>
                        <span className={`text-[15px] font-medium transition-colors ${
                          isSelected ? 'text-primary-800' : 'text-slate-600'
                        }`}>
                          {choice}
                        </span>
                        {isSelected && (
                          <CheckIcon className="w-5 h-5 text-primary-700 ml-auto shrink-0" strokeWidth={2.5} />
                        )}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div>
                  <input
                    ref={inputRef}
                    type="text"
                    value={currentAnswer}
                    onChange={e => question && saveAnswer(question.id, e.target.value)}
                    onFocus={() => setShowKeyboard(true)}
                    placeholder="Javobingizni kiriting..."
                    disabled={submitted}
                    className="w-full h-14 rounded-xl border-2 border-slate-100 bg-white px-4 text-[16px] font-mono font-medium text-slate-800 focus:border-primary-700 focus:outline-none transition-colors placeholder:text-slate-300"
                  />
                  {showKeyboard && (
                    <MathKeyboard
                      onSymbol={handleSymbol}
                      onBackspace={handleBackspace}
                      onCursorMove={handleCursorMove}
                      onEnter={handleEnter}
                    />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-slate-100 px-4 py-3 shrink-0 bg-white">
        <div className="max-w-2xl mx-auto">
          {/* Question pills */}
          <div className="flex flex-wrap gap-1.5 justify-center mb-3">
            {session.questions.map((q, i) => (
              <button
                key={q.id}
                onClick={() => setCurrentIdx(i)}
                className={`w-7 h-7 rounded-md text-[11px] font-bold transition-all ${questionPillClass(i === currentIdx, !!answers[q.id])}`}
              >
                {i + 1}
              </button>
            ))}
          </div>

          {/* Nav */}
          <div className="flex gap-2.5">
            <button
              onClick={() => setCurrentIdx(Math.max(0, currentIdx - 1))}
              disabled={currentIdx === 0}
              className="flex-1 h-11 rounded-xl bg-slate-50 text-slate-500 font-semibold text-sm disabled:opacity-20 transition-all active:scale-[0.97]"
            >
              Oldingi
            </button>
            {currentIdx < totalQuestions - 1 ? (
              <button
                onClick={() => setCurrentIdx(currentIdx + 1)}
                className="flex-1 h-11 rounded-xl bg-primary-800 text-white font-semibold text-sm transition-all active:scale-[0.97] hover:bg-primary-700"
              >
                Keyingi
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={submitted}
                className="flex-1 h-11 rounded-xl bg-primary-800 text-white font-semibold text-sm transition-all active:scale-[0.97] hover:bg-primary-700 disabled:opacity-50"
              >
                Topshirish
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
