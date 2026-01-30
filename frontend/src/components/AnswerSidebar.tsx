import { useState, useRef, useCallback } from 'react'
import MathKeyboard from './MathKeyboard'
import { useCursorInsert } from '../hooks/useCursorInsert'

interface AnswerSidebarProps {
  answers: Record<string, string>
  onAnswer: (questionNumber: number, subPart: string | null, answer: string) => void
  onSubmit: () => void
  disabled: boolean
}

const MCQ_OPTIONS = ['A', 'B', 'C', 'D']
const MCQ_COUNT = 35
const FREE_START = 36
const FREE_END = 45

function range(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, i) => i + start)
}

function answerKey(q: number, sub: string | null): string {
  return sub ? `${q}_${sub}` : `${q}`
}

const mcqQuestions = range(1, MCQ_COUNT)
const freeQuestions = range(FREE_START, FREE_END)
const totalQuestions = MCQ_COUNT + freeQuestions.length

export default function AnswerSidebar({ answers, onAnswer, onSubmit, disabled }: AnswerSidebarProps) {
  const [focusedInput, setFocusedInput] = useState<string | null>(null)
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map())
  const insertSymbol = useCursorInsert(inputRefs, answers, onAnswer)

  const mcqAnswered = mcqQuestions.filter((q) => answers[answerKey(q, null)]).length
  const freeAnswered = freeQuestions.filter(
    (q) => answers[answerKey(q, 'a')] || answers[answerKey(q, 'b')]
  ).length
  const totalAnswered = mcqAnswered + freeAnswered
  const progressPercent = Math.round((totalAnswered / totalQuestions) * 100)

  const handleFocus = useCallback((key: string, el: HTMLInputElement) => {
    setFocusedInput(key)
    // Scroll into view for mobile
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }, [])

  const handleBlur = useCallback(() => {
    // Delay to check if focus moved to another input vs. outside entirely
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

  return (
    <div className="flex flex-col h-full">
      {/* Progress header */}
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-slate-700">Jarayon</span>
          <span className="text-sm font-medium text-slate-500">
            {totalAnswered}/{totalQuestions} javob berilgan
          </span>
        </div>
        <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-accent-500 rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* MCQ section */}
        <div>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Test savollari (1-{MCQ_COUNT})
          </h3>
          <div className="space-y-2">
            {mcqQuestions.map((q) => (
              <div key={q} className="flex items-center gap-2">
                <span className="w-7 text-xs font-medium text-slate-400 text-right tabular-nums">{q}</span>
                <div className="flex gap-1">
                  {MCQ_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => onAnswer(q, null, opt)}
                      disabled={disabled}
                      className={`w-8 h-8 rounded-md text-xs font-semibold border transition-all ${
                        answers[answerKey(q, null)] === opt
                          ? 'bg-accent-500 text-white border-accent-500 shadow-sm'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-accent-300 hover:bg-accent-50'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Free response section */}
        <div>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Ochiq savollar ({FREE_START}-{FREE_END})
          </h3>
          <div className="space-y-3">
            {freeQuestions.map((q) => (
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
                            value={answers[key] || ''}
                            onChange={(e) => onAnswer(q, sub, e.target.value)}
                            onFocus={(e) => handleFocus(key, e.currentTarget)}
                            onBlur={handleBlur}
                            disabled={disabled}
                            className="flex-1 !py-1.5 !px-2.5 !text-sm"
                            placeholder="Javobingiz..."
                          />
                        </div>
                        {focusedInput === key && !disabled && (
                          <div className="ml-6">
                            <MathKeyboard onSymbol={handleSymbol} />
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
