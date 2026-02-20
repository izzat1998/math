import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import adminApi from './adminApi'
import AdminLayout from '../../components/AdminLayout'
import LoadingSpinner from '../../components/LoadingSpinner'

export default function EditExamPage() {
  const { examId } = useParams<{ examId: string }>()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [scheduledStart, setScheduledStart] = useState('')
  const [scheduledEnd, setScheduledEnd] = useState('')
  const [duration, setDuration] = useState(150)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    adminApi
      .get(`/admin/exams/${examId}/`)
      .then(({ data }) => {
        setTitle(data.title)
        setScheduledStart(data.scheduled_start?.slice(0, 16) || '')
        setScheduledEnd(data.scheduled_end?.slice(0, 16) || '')
        setDuration(data.duration || 150)
      })
      .finally(() => setLoading(false))
  }, [examId])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await adminApi.put(`/admin/exams/${examId}/`, {
        title,
        scheduled_start: new Date(scheduledStart).toISOString(),
        scheduled_end: new Date(scheduledEnd).toISOString(),
        duration,
      })
      navigate('/admin/dashboard')
    } catch {
      setError("Saqlashda xatolik yuz berdi")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm("Bu imtihonni o'chirishni xohlaysizmi? Bu amalni qaytarib bo'lmaydi.")) return
    try {
      await adminApi.delete(`/admin/exams/${examId}/`)
      navigate('/admin/dashboard')
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } }
      const msg = axiosErr.response?.data?.error || "Imtihonni o'chirib bo'lmadi"
      alert(msg)
    }
  }

  const hours = Math.floor(duration / 60)
  const minutes = duration % 60

  if (loading) {
    return (
      <AdminLayout
        title="Imtihonni tahrirlash"
        breadcrumbs={[
          { label: 'Boshqaruv paneli', to: '/admin/dashboard' },
          { label: 'Tahrirlash' },
        ]}
      >
        <div className="flex justify-center py-16">
          <LoadingSpinner label="Yuklanmoqda..." />
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout
      title="Imtihonni tahrirlash"
      breadcrumbs={[
        { label: 'Boshqaruv paneli', to: '/admin/dashboard' },
        { label: 'Tahrirlash' },
      ]}
    >
      <div className="max-w-xl">
        <form onSubmit={handleSave} className="space-y-6">
          {/* Title */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Imtihon nomi</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="masalan, Sinov imtihoni #3"
              required
            />
          </div>

          {/* Schedule */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Jadval</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Ochilish vaqti</label>
                <input
                  type="datetime-local"
                  value={scheduledStart}
                  onChange={(e) => setScheduledStart(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Yopilish vaqti</label>
                <input
                  type="datetime-local"
                  value={scheduledEnd}
                  onChange={(e) => setScheduledEnd(e.target.value)}
                  required
                />
              </div>
            </div>
          </div>

          {/* Duration */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Davomiyligi</label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                min={1}
                className="!w-24"
                required
              />
              <span className="text-sm text-slate-500">daqiqa</span>
              <span className="text-xs text-slate-400">
                ({hours}h {minutes}m)
              </span>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-3 p-3 bg-danger-50 border border-danger-100 rounded-lg">
              <svg className="w-5 h-5 text-danger-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
              <p className="text-sm text-danger-700">{error}</p>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center justify-center gap-2 px-6 py-2.5 bg-primary-600 text-white rounded-lg font-medium text-sm hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {saving ? (
                <>
                  <LoadingSpinner size="sm" />
                  Saqlanmoqda...
                </>
              ) : (
                'Saqlash'
              )}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="flex items-center justify-center gap-2 px-6 py-2.5 bg-danger-600 text-white rounded-lg font-medium text-sm hover:bg-danger-700 transition-colors"
            >
              O'chirish
            </button>
            <Link
              to="/admin/dashboard"
              className="px-6 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
            >
              Bekor qilish
            </Link>
          </div>
        </form>
      </div>
    </AdminLayout>
  )
}
