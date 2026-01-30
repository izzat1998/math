import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import api from '../api/client'
import type { ExamResults } from '../api/types'
import LoadingSpinner from '../components/LoadingSpinner'

function ProgressRing({ value, total, color, size = 100 }: { value: number; total: number; color: string; size?: number }) {
  const radius = (size - 8) / 2
  const circumference = 2 * Math.PI * radius
  const progress = total > 0 ? value / total : 0
  const offset = circumference * (1 - progress)

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={6}
        className="text-slate-100"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={6}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-700 ease-out"
      />
    </svg>
  )
}

export default function ResultsPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const [results, setResults] = useState<ExamResults | null>(null)
  const [expandedQ, setExpandedQ] = useState<number | null>(null)

  useEffect(() => {
    api.get<ExamResults>(`/sessions/${sessionId}/results/`).then(({ data }) => setResults(data))
  }, [sessionId])

  if (!results) {
    return <LoadingSpinner fullScreen label="Natijalar yuklanmoqda..." />
  }

  const correctCount = results.breakdown.filter((b) => b.is_correct).length
  const wrongCount = results.breakdown.filter((b) => !b.is_correct).length
  const mcqTotal = 35
  const mcqAnswered = results.breakdown.filter((b) => b.question_number <= 35).length
  const unansweredMcq = mcqTotal - mcqAnswered

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-2xl mx-auto animate-fade-in">
        {/* Back link */}
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-accent-600 mb-6 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
          Bosh sahifa
        </Link>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-200">
            <h1 className="text-xl font-bold text-slate-900">Imtihon natijalari</h1>
            {results.exam_title && (
              <p className="text-sm text-slate-500 mt-1">{results.exam_title}</p>
            )}
          </div>

          {results.exam_closed && (
            <div className="mx-6 mt-4 flex items-start gap-3 p-3 bg-accent-50 border border-accent-100 rounded-lg">
              <svg className="w-5 h-5 text-accent-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
              </svg>
              <p className="text-sm text-accent-700">Imtihon yopilgan — to'g'ri javoblar quyida ko'rsatilgan.</p>
            </div>
          )}

          {results.is_auto_submitted && (
            <div className="mx-6 mt-4 flex items-start gap-3 p-3 bg-warning-50 border border-warning-100 rounded-lg">
              <svg className="w-5 h-5 text-warning-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <p className="text-sm text-warning-700">Vaqt tugadi — imtihon avtomatik topshirildi.</p>
            </div>
          )}

          {/* Score cards with progress rings */}
          <div className="grid grid-cols-2 gap-4 p-6">
            <div className="bg-accent-50 rounded-xl p-5 flex flex-col items-center">
              <div className="relative mb-3">
                <ProgressRing value={results.exercises_correct} total={results.exercises_total} color="#0ea5e9" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xl font-bold text-accent-700">
                    {results.exercises_correct}
                  </span>
                </div>
              </div>
              <div className="text-sm font-medium text-accent-700">
                {results.exercises_total} ta mashqdan
              </div>
            </div>
            <div className="bg-success-50 rounded-xl p-5 flex flex-col items-center">
              <div className="relative mb-3">
                <ProgressRing value={results.points} total={results.points_total} color="#22c55e" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xl font-bold text-success-700">
                    {results.points}
                  </span>
                </div>
              </div>
              <div className="text-sm font-medium text-success-700">
                {results.points_total} ta balldan
              </div>
            </div>
          </div>

          {/* Summary line */}
          <div className="mx-6 mb-4 flex items-center justify-center gap-4 text-sm">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-success-500" />
              <span className="text-slate-600">To'g'ri: {correctCount}</span>
            </span>
            <span className="text-slate-300">|</span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-danger-500" />
              <span className="text-slate-600">Noto'g'ri: {wrongCount}</span>
            </span>
            <span className="text-slate-300">|</span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
              <span className="text-slate-600">Javob berilmagan: {unansweredMcq}</span>
            </span>
          </div>

          {/* Question breakdown grid */}
          <div className="px-6 pb-6">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">Savollar 1-35</h2>
            <div className="grid grid-cols-7 sm:grid-cols-7 gap-2">
              {Array.from({ length: 35 }, (_, i) => i + 1).map((q) => {
                const entry = results.breakdown.find((b) => b.question_number === q && !b.sub_part)
                const answered = !!entry
                const correct = entry?.is_correct
                const isExpanded = results.exam_closed && expandedQ === q && answered
                return (
                  <div key={q} className="flex flex-col">
                    <div
                      onClick={() => results.exam_closed && answered && setExpandedQ(expandedQ === q ? null : q)}
                      className={`rounded-lg p-2 text-center text-sm font-semibold border transition-colors ${
                        !answered
                          ? 'bg-slate-50 text-slate-300 border-slate-100'
                          : correct
                          ? 'bg-success-50 text-success-700 border-success-200'
                          : 'bg-danger-50 text-danger-700 border-danger-200'
                      } ${results.exam_closed && answered ? 'cursor-pointer hover:ring-2 hover:ring-accent-300' : ''}`}
                    >
                      {q}
                    </div>
                    {isExpanded && entry && (
                      <div className="mt-1 rounded-md bg-slate-50 border border-slate-200 px-2 py-1.5 text-xs text-slate-600 space-y-0.5">
                        <div>Siz: <span className="font-medium">{entry.student_answer}</span></div>
                        {entry.correct_answer && (
                          <div>Javob: <span className="font-medium text-success-700">{entry.correct_answer}</span></div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Questions 36-45 */}
            <h2 className="text-sm font-semibold text-slate-700 mt-6 mb-3">Savollar 36-45</h2>
            <div className="space-y-2">
              {Array.from({ length: 10 }, (_, i) => i + 36).map((q) => {
                const partA = results.breakdown.find((b) => b.question_number === q && b.sub_part === 'a')
                const partB = results.breakdown.find((b) => b.question_number === q && b.sub_part === 'b')
                return (
                  <div key={q} className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <div className="flex items-center gap-3">
                      <span className="w-8 font-semibold text-slate-700 text-sm">{q}.</span>
                      <div className="flex gap-2">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            !partA
                              ? 'bg-slate-100 text-slate-400'
                              : partA.is_correct
                              ? 'bg-success-100 text-success-700'
                              : 'bg-danger-100 text-danger-700'
                          }`}
                        >
                          a) {partA ? (partA.is_correct ? 'To\'g\'ri' : 'Noto\'g\'ri') : 'Javob yo\'q'}
                        </span>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            !partB
                              ? 'bg-slate-100 text-slate-400'
                              : partB.is_correct
                              ? 'bg-success-100 text-success-700'
                              : 'bg-danger-100 text-danger-700'
                          }`}
                        >
                          b) {partB ? (partB.is_correct ? 'To\'g\'ri' : 'Noto\'g\'ri') : 'Javob yo\'q'}
                        </span>
                      </div>
                    </div>
                    {results.exam_closed && (
                      <div className="mt-2 ml-11 space-y-1.5 text-xs text-slate-600">
                        {partA && (
                          <div className="flex gap-4">
                            <span>a) Siz: <span className="font-medium">{partA.student_answer}</span></span>
                            {partA.correct_answer && (
                              <span>Javob: <span className="font-medium text-success-700">{partA.correct_answer}</span></span>
                            )}
                          </div>
                        )}
                        {partB && (
                          <div className="flex gap-4">
                            <span>b) Siz: <span className="font-medium">{partB.student_answer}</span></span>
                            {partB.correct_answer && (
                              <span>Javob: <span className="font-medium text-success-700">{partB.correct_answer}</span></span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
