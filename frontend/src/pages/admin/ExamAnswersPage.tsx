import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import adminApi from './adminApi'
import AdminLayout from '../../components/AdminLayout'

const MCQ_OPTIONS = ['A', 'B', 'C', 'D']
const MCQ_COUNT = 35
const FREE_START = 36
const FREE_END = 45
const FREE_COUNT = FREE_END - FREE_START + 1

export default function ExamAnswersPage() {
  const { examId } = useParams<{ examId: string }>()
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const setAnswer = (q: number, sub: string | null, value: string) => {
    const key = sub ? `${q}_${sub}` : `${q}`
    setAnswers((prev) => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  const handleSave = async () => {
    setSaving(true)
    const payload = Object.entries(answers).map(([key, value]) => {
      const parts = key.split('_')
      return {
        question_number: Number(parts[0]),
        sub_part: parts[1] || null,
        correct_answer: value,
      }
    })
    try {
      await adminApi.post(`/admin/exams/${examId}/answers/`, { answers: payload })
      setSaved(true)
      setError('')
    } catch {
      setError('Javoblarni saqlashda xatolik')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (!saved) return
    const t = setTimeout(() => setSaved(false), 3000)
    return () => clearTimeout(t)
  }, [saved])

  const mcqFilled = Object.keys(answers).filter((k) => !k.includes('_') && Number(k) <= MCQ_COUNT).length
  const freeFilled = Object.keys(answers).filter((k) => k.includes('_')).reduce((set, k) => {
    set.add(k.split('_')[0])
    return set
  }, new Set<string>()).size
  const totalFilled = mcqFilled + freeFilled
  const totalQuestions = MCQ_COUNT + FREE_COUNT

  return (
    <AdminLayout
      title="To'g'ri javoblarni belgilash"
      breadcrumbs={[
        { label: 'Boshqaruv paneli', to: '/admin/dashboard' },
        { label: 'Javoblar' },
      ]}
    >
      <div className="max-w-2xl">
        {/* Progress indicator */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-slate-700">Jarayon</span>
            <span className="text-sm text-slate-500">{totalFilled}/{totalQuestions} savol to'ldirilgan</span>
          </div>
          <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent-500 rounded-full transition-all duration-300"
              style={{ width: `${Math.round((totalFilled / totalQuestions) * 100)}%` }}
            />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          {/* MCQ section */}
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Test savollari (1-{MCQ_COUNT})
          </h3>
          <div className="space-y-2 mb-6">
            {Array.from({ length: MCQ_COUNT }, (_, i) => i + 1).map((q) => (
              <div key={q} className="flex items-center gap-2">
                <span className="w-7 text-xs font-medium text-slate-400 text-right tabular-nums">{q}</span>
                <div className="flex gap-1">
                  {MCQ_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setAnswer(q, null, opt)}
                      disabled={saving}
                      className={`w-10 h-10 rounded-md text-xs font-semibold border transition-all ${
                        answers[`${q}`] === opt
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

          {/* Free text section */}
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Ochiq savollar ({FREE_START}-{FREE_END})
          </h3>
          <div className="space-y-3">
            {Array.from({ length: FREE_COUNT }, (_, i) => i + FREE_START).map((q) => (
              <div key={q} className="bg-slate-50 rounded-lg p-3">
                <span className="text-sm font-semibold text-slate-700 mb-2 block">{q}.</span>
                <div className="space-y-2">
                  {['a', 'b'].map((sub) => (
                    <div key={sub} className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-400 w-4">{sub})</span>
                      <input
                        type="text"
                        value={answers[`${q}_${sub}`] || ''}
                        onChange={(e) => setAnswer(q, sub, e.target.value)}
                        disabled={saving}
                        className="flex-1 !py-1.5 !px-2.5 !text-sm"
                        placeholder="To'g'ri javob..."
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Save bar */}
        <div className="sticky bottom-0 bg-slate-50 pt-4 pb-6 mt-4">
          {error && (
            <div className="mb-3 flex items-start gap-3 p-3 bg-danger-50 border border-danger-100 rounded-lg">
              <svg className="w-5 h-5 text-danger-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
              <p className="text-sm text-danger-700">{error}</p>
            </div>
          )}

          {saved && (
            <div className="mb-3 flex items-center gap-2 p-3 bg-success-50 border border-success-100 rounded-lg animate-fade-in">
              <svg className="w-5 h-5 text-success-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              <p className="text-sm text-success-700 font-medium">Javoblar muvaffaqiyatli saqlandi!</p>
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 bg-success-600 text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-success-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saqlanmoqda...' : 'Barcha javoblarni saqlash'}
          </button>
        </div>
      </div>
    </AdminLayout>
  )
}
