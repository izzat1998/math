import { useState, useEffect } from 'react'
import adminApi from './adminApi'
import AdminLayout from '../../components/AdminLayout'
import LoadingSpinner from '../../components/LoadingSpinner'

interface ScoreBucket {
  bucket: string
  count: number
}

interface AnalyticsData {
  total_students: number
  active_students_30d: number
  total_exams: number
  total_sessions: number
  avg_score_percent: number
  score_distribution: ScoreBucket[]
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <p className="text-xs font-medium text-slate-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
    </div>
  )
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    adminApi
      .get('/admin/analytics/')
      .then(({ data }) => setData(data))
      .catch(() => setError("Statistikani yuklashda xatolik yuz berdi"))
      .finally(() => setLoading(false))
  }, [])

  const maxCount = data?.score_distribution
    ? Math.max(...data.score_distribution.map((b) => b.count), 1)
    : 1

  return (
    <AdminLayout
      title="Statistika"
      breadcrumbs={[
        { label: 'Boshqaruv paneli', to: '/admin/dashboard' },
        { label: 'Statistika' },
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
          {/* Overview stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Jami o'quvchilar" value={data.total_students} />
            <StatCard label="Faol (30 kun)" value={data.active_students_30d} />
            <StatCard label="Jami imtihonlar" value={data.total_exams} />
            <StatCard label="Jami sessiyalar" value={data.total_sessions} />
          </div>

          {/* Average score */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-xs font-medium text-slate-500 mb-2">O'rtacha ball</p>
            <div className="flex items-end gap-3">
              <p className="text-3xl font-bold text-primary-700">{data.avg_score_percent.toFixed(1)}%</p>
            </div>
            <div className="mt-3 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-500 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(data.avg_score_percent, 100)}%` }}
              />
            </div>
          </div>

          {/* Score distribution */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Ball taqsimoti</h3>
            <div className="space-y-3">
              {data.score_distribution.map((bucket) => (
                <div key={bucket.bucket} className="flex items-center gap-3">
                  <span className="text-xs font-medium text-slate-600 w-16 flex-shrink-0 text-right">
                    {bucket.bucket}
                  </span>
                  <div className="flex-1 h-7 bg-slate-100 rounded-lg overflow-hidden">
                    <div
                      className="h-full bg-accent-500 rounded-lg flex items-center justify-end pr-2 transition-all duration-500"
                      style={{ width: `${Math.max((bucket.count / maxCount) * 100, 2)}%` }}
                    >
                      {bucket.count > 0 && (
                        <span className="text-xs font-medium text-white">{bucket.count}</span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-slate-500 w-10 flex-shrink-0">{bucket.count}</span>
                </div>
              ))}
            </div>
            {data.score_distribution.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-6">Ma'lumotlar hali mavjud emas</p>
            )}
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
