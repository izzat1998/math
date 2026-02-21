import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import MathKeyboard from './MathKeyboard'
import { useCursorInsert } from '../hooks/useCursorInsert'

interface AnswerBarProps {
  currentQuestion: number
  totalQuestions: number
  answers: Record<string, string>
  onAnswer: (questionNumber: number, subPart: string | null, answer: string) => void
  onNavigate: (questionNumber: number) => void
  disabled: boolean
}

const MCQ_COUNT = 35
const MCQ_OPTIONS_4 = ['A', 'B', 'C', 'D']
const MCQ_OPTIONS_6 = ['A', 'B', 'C', 'D', 'E', 'F']
const SIX_OPTION_QUESTIONS = new Set([33, 34, 35])

function answerKey(q: number, sub: string | null): string {
  return sub ? `${q}_${sub}` : `${q}`
}

export default function AnswerBar({
  currentQuestion,
  totalQuestions,
  answers,
  onAnswer,
  onNavigate,
  disabled,
}: AnswerBarProps) {
  const isMcq = currentQuestion <= MCQ_COUNT
  const [focusedInput, setFocusedInput] = useState<string | null>(null)
  const lastFocusedRef = useRef<string | null>(null)
  const [showGrid, setShowGrid] = useState(false)
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map())
  const insertSymbol = useCursorInsert(inputRefs, answers, onAnswer)
  const swipeRef = useRef<number>(0)
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cleanup blur timer on unmount
  useEffect(() => {
    return () => {
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current)
    }
  }, [])

  const selectedAnswer = answers[answerKey(currentQuestion, null)] || ''

  // Auto-focus first input when landing on free-response question
  // (onFocus handler on the input will set focusedInput state)
  useEffect(() => {
    if (!isMcq) {
      const key = answerKey(currentQuestion, 'a')
      const el = inputRefs.current.get(key)
      if (el) {
        el.focus()
      }
    }
  }, [currentQuestion, isMcq])

  const handleSwipeStart = useCallback((x: number) => {
    swipeRef.current = x
  }, [])

  const handleSwipeEnd = useCallback((x: number) => {
    const diff = x - swipeRef.current
    if (Math.abs(diff) < 40) return
    if (diff < 0 && currentQuestion < totalQuestions) onNavigate(currentQuestion + 1)
    else if (diff > 0 && currentQuestion > 1) onNavigate(currentQuestion - 1)
  }, [currentQuestion, totalQuestions, onNavigate])

  const handleSymbol = useCallback(
    (text: string) => {
      const target = focusedInput || lastFocusedRef.current
      if (target) {
        insertSymbol(target, text)
        // Re-focus the input in case blur happened
        const el = inputRefs.current.get(target)
        if (el) el.focus()
      }
    },
    [focusedInput, insertSymbol]
  )

  const handleBackspace = useCallback(() => {
    const target = focusedInput || lastFocusedRef.current
    if (!target) return
    const el = inputRefs.current.get(target)
    if (!el) return
    const start = el.selectionStart ?? el.value.length
    const end = el.selectionEnd ?? start
    const current = answers[target] || ''
    if (start === end && start > 0) {
      const next = current.slice(0, start - 1) + current.slice(end)
      const [qStr, sub] = target.split('_')
      onAnswer(Number(qStr), sub, next)
      const pos = start - 1
      requestAnimationFrame(() => el.setSelectionRange(pos, pos))
    } else if (start !== end) {
      const next = current.slice(0, start) + current.slice(end)
      const [qStr, sub] = target.split('_')
      onAnswer(Number(qStr), sub, next)
      requestAnimationFrame(() => el.setSelectionRange(start, start))
    }
  }, [focusedInput, answers, onAnswer])

  const handleCursorMove = useCallback((direction: 'left' | 'right') => {
    const target = focusedInput || lastFocusedRef.current
    if (!target) return
    const el = inputRefs.current.get(target)
    if (!el) return
    const pos = el.selectionStart ?? 0
    const next = direction === 'left' ? Math.max(0, pos - 1) : Math.min(el.value.length, pos + 1)
    el.setSelectionRange(next, next)
  }, [focusedInput])

  const handleEnter = useCallback(() => {
    const target = focusedInput || lastFocusedRef.current
    if (!target) return
    const [qStr, sub] = target.split('_')
    const q = Number(qStr)
    if (sub === 'a') {
      const nextKey = answerKey(q, 'b')
      const nextEl = inputRefs.current.get(nextKey)
      if (nextEl) nextEl.focus()
    } else if (q < totalQuestions) {
      onNavigate(q + 1)
    }
  }, [focusedInput, totalQuestions, onNavigate])

  const answeredCount = useMemo(
    () => new Set(Object.keys(answers).map(k => k.split('_')[0])).size,
    [answers]
  )
  const progress = Math.round((answeredCount / totalQuestions) * 100)

  return (
    <div
      className="bg-white/95 backdrop-blur-md border-t border-slate-200/80 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] z-20"
      onTouchStart={(e) => handleSwipeStart(e.touches[0].clientX)}
      onTouchEnd={(e) => handleSwipeEnd(e.changedTouches[0].clientX)}
    >
      {/* Progress bar — thin, always visible */}
      <div className="w-full h-0.5 bg-slate-100 rounded-full mb-3 overflow-hidden" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={`${answeredCount} / ${totalQuestions} javob berilgan`}>
        <div
          className="h-full bg-gradient-to-r from-accent-400 to-accent-600 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Question navigator */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => currentQuestion > 1 && onNavigate(currentQuestion - 1)}
          disabled={currentQuestion <= 1}
          className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-center text-slate-500 disabled:opacity-25 active:scale-90 transition-all"
          aria-label="Oldingi savol"
        >
          <svg width="7" height="12" viewBox="0 0 7 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 1L1 6l5 5" />
          </svg>
        </button>

        <button
          onClick={() => setShowGrid(!showGrid)}
          aria-expanded={showGrid}
          aria-label={`Savol ${currentQuestion} / ${totalQuestions} — savollar panelini ochish`}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-500/8 active:bg-primary-500/15 transition-colors"
        >
          <span className="text-[13px] font-bold text-primary-500 tracking-tight">
            {currentQuestion}
          </span>
          <span className="text-[11px] text-slate-400 font-medium">
            / {totalQuestions}
          </span>
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={`text-primary-400 transition-transform ${showGrid ? 'rotate-180' : ''}`}>
            <path d="M1 1l4 4 4-4" />
          </svg>
        </button>

        <button
          onClick={() => currentQuestion < totalQuestions && onNavigate(currentQuestion + 1)}
          disabled={currentQuestion >= totalQuestions}
          className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-center text-slate-500 disabled:opacity-25 active:scale-90 transition-all"
          aria-label="Keyingi savol"
        >
          <svg width="7" height="12" viewBox="0 0 7 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 1l5 5-5 5" />
          </svg>
        </button>
      </div>

      {/* Question grid overlay */}
      {showGrid && (
        <div className="mb-3 p-3 bg-slate-50/80 rounded-2xl border border-slate-200/60 animate-scale-in" role="navigation" aria-label="Savollar paneli">
          <div className="grid grid-cols-5 sm:grid-cols-9 gap-1.5">
            {Array.from({ length: totalQuestions }, (_, i) => i + 1).map((q) => {
              const isAnswered = !!answers[answerKey(q, null)] || !!answers[answerKey(q, 'a')]
              const isCurrent = q === currentQuestion
              return (
                <button
                  key={q}
                  onClick={() => { onNavigate(q); setShowGrid(false) }}
                  className={`w-full aspect-square rounded-lg text-[10px] font-bold transition-all active:scale-90 ${
                    isCurrent
                      ? 'bg-primary-500 text-white shadow-sm shadow-primary-500/25'
                      : isAnswered
                        ? 'bg-accent-500/10 text-accent-600 ring-1 ring-accent-500/20'
                        : 'bg-white text-slate-400 ring-1 ring-slate-200/80'
                  }`}
                >
                  {q}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* MCQ answer pills */}
      {isMcq && (() => {
        const options = SIX_OPTION_QUESTIONS.has(currentQuestion) ? MCQ_OPTIONS_6 : MCQ_OPTIONS_4
        const is6 = options.length === 6
        return (
          <div className={`grid gap-2 mb-3 ${is6 ? 'grid-cols-3' : 'grid-cols-4'}`}>
            {options.map((opt) => (
              <button
                key={opt}
                onClick={() => { if (!disabled) onAnswer(currentQuestion, null, opt) }}
                disabled={disabled}
                aria-pressed={selectedAnswer === opt}
                aria-label={`Savol ${currentQuestion}, variant ${opt}`}
                className={`h-[52px] rounded-2xl ${is6 ? 'text-[16px]' : 'text-[18px]'} font-bold transition-all select-none ${
                  selectedAnswer === opt
                    ? 'bg-accent-500 text-white shadow-lg shadow-accent-500/30 scale-[0.97]'
                    : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-accent-300 active:scale-[0.94] active:bg-slate-50'
                } disabled:opacity-40`}
                style={selectedAnswer === opt ? {
                  background: 'linear-gradient(135deg, #06b6d4, #0891b2)',
                } : undefined}
              >
                {opt}
              </button>
            ))}
          </div>
        )
      })()}

      {/* Free-text answer inputs */}
      {!isMcq && (
        <div className="mb-3 space-y-2">
          {['a', 'b'].map((sub) => {
            const key = answerKey(currentQuestion, sub)
            return (
              <div key={sub} className="flex items-center gap-2.5">
                <span className="text-xs font-bold text-slate-400 w-5 text-right">{sub})</span>
                <input
                  ref={(el) => {
                    if (el) inputRefs.current.set(key, el)
                    else inputRefs.current.delete(key)
                  }}
                  type="text"
                  inputMode="none"
                  value={answers[key] || ''}
                  onChange={(e) => onAnswer(currentQuestion, sub, e.target.value)}
                  onFocus={() => { setFocusedInput(key); lastFocusedRef.current = key }}
                  onBlur={() => {
                    if (blurTimerRef.current) clearTimeout(blurTimerRef.current)
                    blurTimerRef.current = setTimeout(() => setFocusedInput(null), 200)
                  }}
                  disabled={disabled}
                  placeholder="Javobni kiriting..."
                  aria-label={`Savol ${currentQuestion}, ${sub} qism javob`}
                  className="flex-1 !h-[52px] !px-4 !rounded-2xl !border-[1.5px] !border-slate-200 !bg-white !text-base !text-slate-800 placeholder:!text-slate-300 focus:!border-accent-500 focus:!ring-0 focus:!outline-none disabled:!opacity-40 transition-colors"
                />
              </div>
            )
          })}
          {!disabled && (
            <MathKeyboard
              onSymbol={handleSymbol}
              onBackspace={handleBackspace}
              onCursorMove={handleCursorMove}
              onEnter={handleEnter}
            />
          )}
        </div>
      )}

      {/* Progress dots */}
      <div className="flex items-center justify-center gap-[3px] flex-wrap max-h-4 overflow-hidden">
        {Array.from({ length: totalQuestions }, (_, i) => i + 1).map((q) => {
          const isAnswered = !!answers[answerKey(q, null)] || !!answers[answerKey(q, 'a')]
          const isCurrent = q === currentQuestion
          return (
            <button
              key={q}
              onClick={() => onNavigate(q)}
              className={`rounded-full transition-all flex-shrink-0 ${
                isCurrent
                  ? 'w-3 h-2 rounded-sm bg-primary-500'
                  : isAnswered
                    ? 'w-[6px] h-[6px] bg-accent-500'
                    : 'w-[6px] h-[6px] bg-slate-200'
              }`}
              aria-label={`Savol ${q}`}
            />
          )
        })}
      </div>
    </div>
  )
}
