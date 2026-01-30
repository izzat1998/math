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

export default function AnswerSidebar({ answers, onAnswer, onSubmit, disabled }: AnswerSidebarProps) {
  const getKey = (q: number, sub: string | null) => sub ? `${q}_${sub}` : `${q}`

  // Count answered questions
  const mcqAnswered = Array.from({ length: MCQ_COUNT }, (_, i) => i + 1).filter(
    (q) => !!answers[getKey(q, null)]
  ).length
  const freeAnswered = Array.from({ length: FREE_END - FREE_START + 1 }, (_, i) => i + FREE_START).filter(
    (q) => !!answers[getKey(q, 'a')] || !!answers[getKey(q, 'b')]
  ).length
  const totalAnswered = mcqAnswered + freeAnswered
  const totalQuestions = MCQ_COUNT + (FREE_END - FREE_START + 1)
  const progressPercent = Math.round((totalAnswered / totalQuestions) * 100)

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
            {Array.from({ length: MCQ_COUNT }, (_, i) => i + 1).map((q) => (
              <div key={q} className="flex items-center gap-2">
                <span className="w-7 text-xs font-medium text-slate-400 text-right tabular-nums">{q}</span>
                <div className="flex gap-1">
                  {MCQ_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => onAnswer(q, null, opt)}
                      disabled={disabled}
                      className={`w-8 h-8 rounded-md text-xs font-semibold border transition-all ${
                        answers[getKey(q, null)] === opt
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
            {Array.from({ length: FREE_END - FREE_START + 1 }, (_, i) => i + FREE_START).map((q) => (
              <div key={q} className="bg-slate-50 rounded-lg p-3">
                <span className="text-sm font-semibold text-slate-700 mb-2 block">{q}.</span>
                <div className="space-y-2">
                  {['a', 'b'].map((sub) => (
                    <div key={sub} className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-400 w-4">{sub})</span>
                      <input
                        type="text"
                        value={answers[getKey(q, sub)] || ''}
                        onChange={(e) => onAnswer(q, sub, e.target.value)}
                        disabled={disabled}
                        className="flex-1 !py-1.5 !px-2.5 !text-sm"
                        placeholder="Javobingiz..."
                      />
                    </div>
                  ))}
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
