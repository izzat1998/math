import { useState, useRef, useCallback } from 'react'
import MathKeyboard from './MathKeyboard'
import { useCursorInsert } from '../hooks/useCursorInsert'
import type { PageInfo } from './PdfViewer'

interface AnswerSidebarProps {
  answers: Record<string, string>
  onAnswer: (questionNumber: number, subPart: string | null, answer: string) => void
  onSubmit: () => void
  disabled: boolean
  onQuestionFocus?: (questionNumber: number) => void
  pageInfo?: PageInfo | null
}

const MCQ_OPTIONS_4 = ['A', 'B', 'C', 'D']
const MCQ_OPTIONS_6 = ['A', 'B', 'C', 'D', 'E', 'F']
const SIX_OPTION_QUESTIONS = new Set([33, 34, 35])
const MCQ_COUNT = 35
const FREE_START = 36
const FREE_END = 45

const ALL_QUESTIONS = Array.from({ length: FREE_END }, (_, i) => i + 1)

function answerKey(q: number, sub: string | null): string {
  return sub ? `${q}_${sub}` : `${q}`
}

export default function AnswerSidebar({ answers, onAnswer, onSubmit, disabled, onQuestionFocus, pageInfo }: AnswerSidebarProps) {
  const [focusedInput, setFocusedInput] = useState<string | null>(null)
  const [recentlySaved, setRecentlySaved] = useState<Set<string>>(new Set())
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map())
  const insertSymbol = useCursorInsert(inputRefs, answers, onAnswer)

  const handleAnswer = useCallback((q: number, sub: string | null, value: string) => {
    onAnswer(q, sub, value)
    const key = answerKey(q, sub)
    setRecentlySaved((prev) => new Set(prev).add(key))
    setTimeout(() => {
      setRecentlySaved((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }, 1500)
  }, [onAnswer])

  // Determine which questions to show
  const visibleQuestions = pageInfo?.questions?.length ? pageInfo.questions : ALL_QUESTIONS
  const mcqVisible = visibleQuestions.filter((q) => q <= MCQ_COUNT)
  const freeVisible = visibleQuestions.filter((q) => q >= FREE_START && q <= FREE_END)

  // Progress: count across ALL questions, not just visible
  const totalQuestions = FREE_END
  const totalAnswered = ALL_QUESTIONS.filter((q) => {
    if (q <= MCQ_COUNT) return !!answers[answerKey(q, null)]
    return !!answers[answerKey(q, 'a')] || !!answers[answerKey(q, 'b')]
  }).length
  const progressPercent = Math.round((totalAnswered / totalQuestions) * 100)

  // Page navigation: jump to first question on prev/next page
  const handlePageNav = useCallback((direction: 'prev' | 'next') => {
    if (!pageInfo || !onQuestionFocus) return
    const targetPage = direction === 'prev' ? pageInfo.page - 1 : pageInfo.page + 1
    if (targetPage < 1 || targetPage > pageInfo.totalPages) return
    // Navigate to the first question that maps to the target page.
    // Since we don't have the full mapping here, just nudge by picking
    // a question slightly outside current range.
    if (direction === 'next') {
      const maxQ = Math.max(...pageInfo.questions, 0)
      onQuestionFocus(Math.min(maxQ + 1, FREE_END))
    } else {
      const minQ = Math.min(...pageInfo.questions, FREE_END)
      onQuestionFocus(Math.max(minQ - 1, 1))
    }
  }, [pageInfo, onQuestionFocus])

  const handleFocus = useCallback((key: string, el: HTMLInputElement) => {
    setFocusedInput(key)
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }, [])

  const handleBlur = useCallback(() => {
    setTimeout(() => {
      const active = document.activeElement
      if (!(active instanceof HTMLInputElement) || !inputRefs.current?.has(
        Array.from(inputRefs.current.entries()).find(([, el]) => el === active)?.[0] ?? ''
      )) {
        setFocusedInput(null)
      }
    }, 0)
  }, [])

  const handleSymbol = useCallback(
    (text: string) => {
      if (focusedInput) insertSymbol(focusedInput, text)
    },
    [focusedInput, insertSymbol]
  )

  const handleBackspace = useCallback(() => {
    if (!focusedInput) return
    const el = inputRefs.current?.get(focusedInput)
    if (!el) return
    const start = el.selectionStart ?? el.value.length
    const end = el.selectionEnd ?? start
    const current = answers[focusedInput] || ''
    if (start === end && start > 0) {
      const next = current.slice(0, start - 1) + current.slice(end)
      const [qStr, sub] = focusedInput.split('_')
      handleAnswer(Number(qStr), sub, next)
      const pos = start - 1
      requestAnimationFrame(() => el.setSelectionRange(pos, pos))
    } else if (start !== end) {
      const next = current.slice(0, start) + current.slice(end)
      const [qStr, sub] = focusedInput.split('_')
      handleAnswer(Number(qStr), sub, next)
      requestAnimationFrame(() => el.setSelectionRange(start, start))
    }
  }, [focusedInput, answers, handleAnswer])

  const handleCursorMove = useCallback((direction: 'left' | 'right') => {
    if (!focusedInput) return
    const el = inputRefs.current?.get(focusedInput)
    if (!el) return
    const pos = el.selectionStart ?? 0
    const next = direction === 'left' ? Math.max(0, pos - 1) : Math.min(el.value.length, pos + 1)
    el.setSelectionRange(next, next)
  }, [focusedInput])

  const handleEnter = useCallback(() => {
    if (!focusedInput) return
    const [qStr, sub] = focusedInput.split('_')
    const q = Number(qStr)
    if (sub === 'a') {
      const nextKey = answerKey(q, 'b')
      const nextEl = inputRefs.current?.get(nextKey)
      if (nextEl) nextEl.focus()
    } else if (q < FREE_END) {
      const nextKey = answerKey(q + 1, 'a')
      const nextEl = inputRefs.current?.get(nextKey)
      if (nextEl) nextEl.focus()
    }
  }, [focusedInput])

  return (
    <div className="flex flex-col h-full">
      {/* Header: progress + page nav */}
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-slate-700">Jarayon</span>
          <span className="text-sm font-medium text-slate-500">
            {totalAnswered}/{totalQuestions} javob berilgan
          </span>
        </div>
        <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden mb-3" role="progressbar" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100} aria-label={`${totalAnswered} / ${totalQuestions} javob berilgan`}>
          <div
            className="h-full bg-accent-500 rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Page navigation */}
        {pageInfo && pageInfo.totalPages > 0 && (
          <div className="flex items-center justify-between">
            <button
              onClick={() => handlePageNav('prev')}
              disabled={pageInfo.page <= 1}
              className="p-1.5 rounded-lg hover:bg-slate-200 disabled:opacity-25 transition-colors"
              aria-label="Oldingi sahifa"
            >
              <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
            </button>
            <span className="text-xs font-semibold text-slate-500 tabular-nums">
              Sahifa {pageInfo.page} / {pageInfo.totalPages}
              {visibleQuestions.length > 0 && (
                <span className="text-slate-400 font-medium ml-1.5">
                  (savollar {Math.min(...visibleQuestions)}-{Math.max(...visibleQuestions)})
                </span>
              )}
            </span>
            <button
              onClick={() => handlePageNav('next')}
              disabled={pageInfo.page >= pageInfo.totalPages}
              className="p-1.5 rounded-lg hover:bg-slate-200 disabled:opacity-25 transition-colors"
              aria-label="Keyingi sahifa"
            >
              <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* MCQ questions for this page */}
        {mcqVisible.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Test savollari
            </h3>
            <div className="space-y-1.5">
              {mcqVisible.map((q) => {
                const options = SIX_OPTION_QUESTIONS.has(q) ? MCQ_OPTIONS_6 : MCQ_OPTIONS_4
                return (
                  <div key={q} className="flex items-center gap-2">
                    <span className="w-7 text-xs font-medium text-slate-400 text-right tabular-nums shrink-0">{q}</span>
                    <div className="flex gap-1.5 flex-1">
                      {options.map((opt) => (
                        <button
                          key={opt}
                          onClick={() => { handleAnswer(q, null, opt); onQuestionFocus?.(q) }}
                          disabled={disabled}
                          aria-pressed={answers[answerKey(q, null)] === opt}
                          aria-label={`Savol ${q}, variant ${opt}`}
                          className={`flex-1 h-9 rounded-lg ${options.length === 6 ? 'text-xs' : 'text-sm'} font-semibold border transition-all ${
                            answers[answerKey(q, null)] === opt
                              ? 'bg-accent-500 text-white border-accent-500 shadow-sm'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-accent-300 hover:bg-accent-50'
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                    {recentlySaved.has(answerKey(q, null)) && (
                      <svg className="w-4 h-4 text-success-500 shrink-0 animate-fade-in" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Free response questions for this page */}
        {freeVisible.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Ochiq savollar
            </h3>
            <div className="space-y-3">
              {freeVisible.map((q) => (
                <div key={q} className="bg-slate-50 rounded-lg p-3">
                  <span className="text-sm font-semibold text-slate-700 mb-2 block">{q}.</span>
                  <div className="space-y-2">
                    {['a', 'b'].map((sub) => {
                      const key = answerKey(q, sub)
                      return (
                        <div key={sub}>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-slate-400 w-4">{sub})</span>
                            <input
                              ref={(el) => {
                                if (el) inputRefs.current.set(key, el)
                                else inputRefs.current.delete(key)
                              }}
                              type="text"
                              inputMode="none"
                              value={answers[key] || ''}
                              onChange={(e) => handleAnswer(q, sub, e.target.value)}
                              onFocus={(e) => { handleFocus(key, e.currentTarget); onQuestionFocus?.(q) }}
                              onBlur={handleBlur}
                              disabled={disabled}
                              aria-label={`Savol ${q}, ${sub} qism javob`}
                              className="flex-1 !py-1.5 !px-2.5 !text-sm"
                              placeholder="Javobingiz..."
                            />
                            {recentlySaved.has(key) && (
                              <svg className="w-4 h-4 text-success-500 shrink-0 animate-fade-in" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                              </svg>
                            )}
                          </div>
                          {focusedInput === key && !disabled && (
                            <div className="ml-6">
                              <MathKeyboard
                                onSymbol={handleSymbol}
                                onBackspace={handleBackspace}
                                onCursorMove={handleCursorMove}
                                onEnter={handleEnter}
                              />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state when no questions mapped to this page */}
        {mcqVisible.length === 0 && freeVisible.length === 0 && pageInfo && (
          <div className="flex items-center justify-center py-12 text-center">
            <p className="text-sm text-slate-400 font-medium">
              Bu sahifada savollar topilmadi
            </p>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-slate-200 bg-white">
        <button
          onClick={onSubmit}
          disabled={disabled}
          className="w-full bg-success-600 text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-success-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Imtihonni topshirish
        </button>
      </div>
    </div>
  )
}
