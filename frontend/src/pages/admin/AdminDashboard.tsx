import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import type { Exam } from '../../api/types'
import adminApi from './adminApi'
import AdminLayout from '../../components/AdminLayout'

function ExamStatusBadge({ exam }: { exam: Exam }) {
  const now = Date.now()
  const open = new Date(exam.open_at).getTime()
  const close = new Date(exam.close_at).getTime()

  let label: string
  let className: string
  if (now < open) {
    label = 'Kutilmoqda'
    className = 'bg-warning-50 text-warning-700 border-warning-200'
  } else if (now <= close) {
    label = 'Ochiq'
    className = 'bg-success-50 text-success-700 border-success-200'
  } else {
    label = 'Yopiq'
    className = 'bg-slate-100 text-slate-500 border-slate-200'
  }

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${className}`}>
      {label}
    </span>
  )
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 animate-pulse">
      <div className="h-5 bg-slate-200 rounded w-2/3 mb-3" />
      <div className="h-4 bg-slate-100 rounded w-full mb-2" />
      <div className="h-4 bg-slate-100 rounded w-1/2 mb-4" />
      <div className="flex gap-2">
        <div className="h-8 bg-slate-100 rounded w-20" />
        <div className="h-8 bg-slate-100 rounded w-20" />
        <div className="h-8 bg-slate-100 rounded w-20" />
      </div>
    </div>
  )
}

export default function AdminDashboard() {
  const [exams, setExams] = useState<Exam[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    adminApi.get('/admin/exams/').then(({ data }) => {
      setExams(data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  return (
    <AdminLayout title="Sinov imtihonlari" breadcrumbs={[{ label: 'Boshqaruv paneli' }]}>
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {!loading && exams.length === 0 && (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
          <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-slate-700 mb-1">Imtihonlar hali yo'q</h3>
          <p className="text-sm text-slate-500 mb-4">Boshlash uchun birinchi imtihonni yarating.</p>
          <Link
            to="/admin/exams/create"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Imtihon yaratish
          </Link>
        </div>
      )}

      {!loading && exams.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {exams.map((exam) => (
            <div
              key={exam.id}
              className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow group"
            >
              <div className="flex items-start justify-between mb-3">
                <h2 className="font-semibold text-slate-900 group-hover:text-primary-700 transition-colors">
                  {exam.title}
                </h2>
                <ExamStatusBadge exam={exam} />
              </div>
              <div className="text-sm text-slate-500 space-y-1 mb-4">
                <p className="flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                  </svg>
                  {new Date(exam.open_at).toLocaleDateString()} - {new Date(exam.close_at).toLocaleDateString()}
                </p>
                <p className="flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  {exam.duration} daqiqa
                </p>
              </div>
              <div className="flex gap-2 pt-3 border-t border-slate-100">
                <Link
                  to={`/admin/exams/${exam.id}/answers`}
                  className="flex-1 text-center text-xs font-medium py-2 rounded-lg bg-accent-50 text-accent-700 hover:bg-accent-100 transition-colors"
                >
                  Javoblar
                </Link>
                <Link
                  to={`/admin/exams/${exam.id}/results`}
                  className="flex-1 text-center text-xs font-medium py-2 rounded-lg bg-success-50 text-success-700 hover:bg-success-100 transition-colors"
                >
                  Natijalar
                </Link>
                <Link
                  to={`/admin/exams/${exam.id}/codes`}
                  className="flex-1 text-center text-xs font-medium py-2 rounded-lg bg-primary-50 text-primary-700 hover:bg-primary-100 transition-colors"
                >
                  Kodlar
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  )
}
