import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import adminApi from './adminApi'
import AdminLayout from '../../components/AdminLayout'
import LoadingSpinner from '../../components/LoadingSpinner'

interface ItemData {
  question_number: number
  sub_part: string | null
  difficulty: number
  infit: number
  outfit: number
  percent_correct: number
  flagged: boolean
}

interface AnalysisData {
  exam_title: string
  total_participants: number
  items: ItemData[]
}

function difficultyColor(d: number): string {
  if (d < -1) return 'text-success-700 bg-success-50'
  if (d > 1) return 'text-danger-700 bg-danger-50'
  return 'text-slate-700 bg-slate-50'
}

function difficultyLabel(d: number): string {
  if (d < -1) return 'Oson'
  if (d > 1) return 'Qiyin'
  return "O'rtacha"
}

export default function ItemAnalysisPage() {
  const { examId } = useParams<{ examId: string }>()
  const [data, setData] = useState<AnalysisData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    adminApi
      .get(`/admin/exams/${examId}/item-analysis/`)
      .then(({ data }) => setData(data))
      .catch(() => setError("Ma'lumotlarni yuklashda xatolik yuz berdi"))
      .finally(() => setLoading(false))
  }, [examId])

  return (
    <AdminLayout
      title="Savol tahlili"
      breadcrumbs={[
        { label: 'Boshqaruv paneli', to: '/admin/dashboard' },
        { label: 'Savol tahlili' },
      ]}
    >
      {loading && (
        <div className="flex justify-center py-16">
          <LoadingSpinner label="Yuklanmoqda..." />
        </div>
      )}

      {error && (
        <div className="flex items-start gap-3 p-4 bg-danger-50 border border-danger-100 rounded-xl">
          <svg className="w-5 h-5 text-danger-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
          <p className="text-sm text-danger-700">{error}</p>
        </div>
      )}

      {!loading && !error && data && (
        <div className="space-y-6">
          {/* Header stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="text-xs font-medium text-slate-500 mb-1">Imtihon</p>
              <p className="text-lg font-semibold text-slate-900">{data.exam_title}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="text-xs font-medium text-slate-500 mb-1">Jami ishtirokchilar</p>
              <p className="text-lg font-semibold text-slate-900">{data.total_participants}</p>
            </div>
          </div>

          {/* Items table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="text-left px-4 py-3 font-semibold text-slate-600">#</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600">Qiyinlik (&#946;)</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600">Infit</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600">Outfit</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600">% To'g'ri</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600">Holat</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr
                      key={`${item.question_number}-${item.sub_part || ''}`}
                      className={`border-b border-slate-100 last:border-b-0 ${
                        item.flagged ? 'bg-warning-50' : ''
                      }`}
                    >
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {item.question_number}
                        {item.sub_part ? `.${item.sub_part}` : ''}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${difficultyColor(item.difficulty)}`}>
                          {item.difficulty.toFixed(2)} ({difficultyLabel(item.difficulty)})
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{item.infit.toFixed(2)}</td>
                      <td className="px-4 py-3 text-slate-700">{item.outfit.toFixed(2)}</td>
                      <td className="px-4 py-3 text-slate-700">{item.percent_correct.toFixed(1)}%</td>
                      <td className="px-4 py-3">
                        {item.flagged ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-warning-100 text-warning-700 border border-warning-200">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                            </svg>
                            Ogohlantirish
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-success-50 text-success-700">
                            Yaxshi
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {data.items.length === 0 && (
              <div className="text-center py-12 text-sm text-slate-500">
                Tahlil uchun ma'lumotlar topilmadi
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Izohlar</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded bg-success-200" />
                <span>Oson: &#946; &lt; -1</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded bg-slate-200" />
                <span>O'rtacha: -1 &#8804; &#946; &#8804; 1</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded bg-danger-200" />
                <span>Qiyin: &#946; &gt; 1</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded bg-warning-200" />
                <span>Ogohlantirish: infit/outfit 0.7–1.3 oralig'idan tashqarida</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
