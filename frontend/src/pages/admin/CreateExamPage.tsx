import { useState, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import adminApi from './adminApi'
import AdminLayout from '../../components/AdminLayout'
import LoadingSpinner from '../../components/LoadingSpinner'

export default function CreateExamPage() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState('')
  const [openAt, setOpenAt] = useState('')
  const [closeAt, setCloseAt] = useState('')
  const [duration, setDuration] = useState(150)
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [dragActive, setDragActive] = useState(false)

  function dropZoneClass(): string {
    if (dragActive) return 'border-accent-400 bg-accent-50'
    if (pdfFile) return 'border-success-300 bg-success-50'
    return 'border-slate-300 bg-slate-50 hover:border-slate-400'
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    const file = e.dataTransfer.files?.[0]
    if (file && file.type === 'application/pdf') {
      setPdfFile(file)
    }
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(e.type === 'dragenter' || e.type === 'dragover')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pdfFile) {
      setError('Iltimos, PDF fayl yuklang')
      return
    }
    setSubmitting(true)
    const formData = new FormData()
    formData.append('title', title)
    formData.append('open_at', new Date(openAt).toISOString())
    formData.append('close_at', new Date(closeAt).toISOString())
    formData.append('duration', String(duration))
    formData.append('pdf_file', pdfFile)
    try {
      await adminApi.post('/admin/exams/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      navigate('/admin/dashboard')
    } catch {
      setError("Imtihon yaratib bo'lmadi. Ma'lumotlarni tekshiring.")
    } finally {
      setSubmitting(false)
    }
  }

  const hours = Math.floor(duration / 60)
  const minutes = duration % 60

  return (
    <AdminLayout
      title="Sinov imtihoni yaratish"
      breadcrumbs={[
        { label: 'Boshqaruv paneli', to: '/admin/dashboard' },
        { label: 'Imtihon yaratish' },
      ]}
    >
      <div className="max-w-xl">
        <form onSubmit={handleSubmit} className="space-y-6">
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

          {/* PDF Upload */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <label className="block text-sm font-semibold text-slate-700 mb-3">Imtihon PDF</label>
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${dropZoneClass()}`}
            >
              {pdfFile ? (
                <div className="flex flex-col items-center gap-2">
                  <svg className="w-10 h-10 text-success-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  <p className="text-sm font-medium text-success-700">{pdfFile.name}</p>
                  <p className="text-xs text-slate-500">{(pdfFile.size / 1024 / 1024).toFixed(1)} MB</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <svg className="w-10 h-10 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                  </svg>
                  <p className="text-sm font-medium text-slate-600">PDF faylni shu yerga tashlang yoki tanlang</p>
                  <p className="text-xs text-slate-400">Faqat PDF fayllar</p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                className="hidden"
              />
            </div>
          </div>

          {/* Schedule */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Jadval</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Ochilish vaqti</label>
                <input
                  type="datetime-local"
                  value={openAt}
                  onChange={(e) => setOpenAt(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Yopilish vaqti</label>
                <input
                  type="datetime-local"
                  value={closeAt}
                  onChange={(e) => setCloseAt(e.target.value)}
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
              disabled={submitting}
              className="flex items-center justify-center gap-2 px-6 py-2.5 bg-primary-600 text-white rounded-lg font-medium text-sm hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? (
                <>
                  <LoadingSpinner size="sm" />
                  Yaratilmoqda...
                </>
              ) : (
                'Imtihon yaratish'
              )}
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
