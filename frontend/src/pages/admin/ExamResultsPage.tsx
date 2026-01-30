import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import adminApi from './adminApi'
import AdminLayout from '../../components/AdminLayout'

interface StudentResult {
  student_id: string
  student_name: string
  exercises_correct: number
  exercises_total: number
  points: number
  points_total: number
  submitted_at: string
  is_auto_submitted: boolean
}

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-32" /></td>
      <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-16" /></td>
      <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-16" /></td>
      <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-28" /></td>
      <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-10" /></td>
    </tr>
  )
}

function average(items: StudentResult[], getter: (r: StudentResult) => number): string {
  if (items.length === 0) return '0'
  return (items.reduce((sum, r) => sum + getter(r), 0) / items.length).toFixed(1)
}

export default function ExamResultsPage() {
  const { examId } = useParams<{ examId: string }>()
  const [results, setResults] = useState<StudentResult[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    adminApi.get(`/admin/exams/${examId}/results/`).then(({ data }) => {
      setResults(data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [examId])

  const totalStudents = results.length
  const avgExercises = average(results, (r) => r.exercises_correct)
  const avgPoints = average(results, (r) => r.points)
  const autoSubmitted = results.filter((r) => r.is_auto_submitted).length

  return (
    <AdminLayout
      title="Imtihon natijalari"
      breadcrumbs={[
        { label: 'Boshqaruv paneli', to: '/admin/dashboard' },
        { label: 'Natijalar' },
      ]}
    >
      {!loading && results.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-2xl font-bold text-slate-900">{totalStudents}</div>
            <div className="text-xs font-medium text-slate-500 mt-1">Jami topshirilganlar</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-2xl font-bold text-accent-600">{avgExercises}</div>
            <div className="text-xs font-medium text-slate-500 mt-1">O'rtacha mashqlar</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-2xl font-bold text-success-600">{avgPoints}</div>
            <div className="text-xs font-medium text-slate-500 mt-1">O'rtacha ball</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-2xl font-bold text-warning-600">{autoSubmitted}</div>
            <div className="text-xs font-medium text-slate-500 mt-1">Avtomatik topshirilgan</div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading && (
          <table className="w-full">
            <tbody>
              {[1, 2, 3, 4, 5].map((i) => <SkeletonRow key={i} />)}
            </tbody>
          </table>
        )}

        {!loading && results.length === 0 && (
          <div className="text-center py-12">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
              </svg>
            </div>
            <p className="text-sm text-slate-500">Hali topshirilmagan.</p>
          </div>
        )}

        {!loading && results.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Talaba</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Mashqlar</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Ball</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Topshirilgan</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Avto</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, index) => (
                <tr key={r.student_id} className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                  <td className="px-4 py-3 font-medium text-slate-800">{r.student_name}</td>
                  <td className="px-4 py-3 text-slate-600">
                    <span className="font-semibold text-slate-800">{r.exercises_correct}</span>
                    <span className="text-slate-400">/{r.exercises_total}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <span className="font-semibold text-slate-800">{r.points}</span>
                    <span className="text-slate-400">/{r.points_total}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{new Date(r.submitted_at).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    {r.is_auto_submitted ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-warning-50 text-warning-700">
                        Ha
                      </span>
                    ) : (
                      <span className="text-slate-400">Yo'q</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AdminLayout>
  )
}
