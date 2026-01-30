import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import adminApi from './adminApi'
import AdminLayout from '../../components/AdminLayout'
import LoadingSpinner from '../../components/LoadingSpinner'

interface InviteCode {
  id: number
  code: string
  is_used: boolean
  used_by: string | null
}

export default function InviteCodesPage() {
  const { examId } = useParams<{ examId: string }>()
  const [codes, setCodes] = useState<InviteCode[]>([])
  const [count, setCount] = useState(10)
  const [generating, setGenerating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState<string | null>(null)

  const loadCodes = () => {
    adminApi.get<InviteCode[]>(`/admin/exams/${examId}/invite-codes/`).then(({ data }) => {
      setCodes(data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  const generateCodes = async () => {
    setGenerating(true)
    try {
      const { data } = await adminApi.post(`/admin/exams/${examId}/invite-codes/`, { count })
      setCodes((prev) => [...data, ...prev])
    } catch {
      // Handle error silently
    } finally {
      setGenerating(false)
    }
  }

  useEffect(() => {
    loadCodes()
  }, [examId]) // eslint-disable-line react-hooks/exhaustive-deps

  const copyToClipboard = async (code: string) => {
    await navigator.clipboard.writeText(code)
    setCopied(code)
    setTimeout(() => setCopied(null), 2000)
  }

  const availableCount = codes.filter((c) => !c.is_used).length
  const usedCount = codes.filter((c) => c.is_used).length

  return (
    <AdminLayout
      title="Taklif kodlari"
      breadcrumbs={[
        { label: 'Boshqaruv paneli', to: '/admin/dashboard' },
        { label: 'Taklif kodlari' },
      ]}
    >
      <div className="max-w-2xl">
        {/* Summary counters */}
        {!loading && codes.length > 0 && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="text-2xl font-bold text-slate-900">{codes.length}</div>
              <div className="text-xs font-medium text-slate-500 mt-1">Jami</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="text-2xl font-bold text-success-600">{availableCount}</div>
              <div className="text-xs font-medium text-slate-500 mt-1">Mavjud</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="text-2xl font-bold text-slate-400">{usedCount}</div>
              <div className="text-xs font-medium text-slate-500 mt-1">Ishlatilgan</div>
            </div>
          </div>
        )}

        {/* Generate controls */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Yangi kodlar yaratish</h3>
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              min={1}
              max={500}
              className="!w-24"
            />
            <button
              onClick={generateCodes}
              disabled={generating}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {generating ? (
                <>
                  <LoadingSpinner size="sm" />
                  Yaratilmoqda...
                </>
              ) : (
                'Kodlarni yaratish'
              )}
            </button>
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="bg-white rounded-xl border border-slate-200 p-8 flex items-center justify-center">
            <LoadingSpinner label="Kodlar yuklanmoqda..." />
          </div>
        )}

        {/* Codes list */}
        {!loading && codes.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="divide-y divide-slate-100">
              {codes.map((c) => (
                <div
                  key={c.id}
                  className={`flex items-center justify-between px-4 py-3 ${
                    c.is_used ? 'bg-slate-50' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`font-mono text-sm font-semibold tracking-wider ${
                      c.is_used ? 'text-slate-400' : 'text-slate-800'
                    }`}>
                      {c.code}
                    </span>
                    {c.is_used && c.used_by && (
                      <span className="text-xs text-slate-400">by {c.used_by}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {c.is_used ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
                        Ishlatilgan
                      </span>
                    ) : (
                      <>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-success-50 text-success-700 border border-success-200">
                          Mavjud
                        </span>
                        <button
                          onClick={() => copyToClipboard(c.code)}
                          className="p-1.5 rounded-md hover:bg-slate-100 transition-colors"
                          title="Kodni nusxalash"
                        >
                          {copied === c.code ? (
                            <svg className="w-4 h-4 text-success-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                            </svg>
                          )}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && codes.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z" />
              </svg>
            </div>
            <p className="text-sm text-slate-500">Kodlar hali yo'q. Yuqorida yarating.</p>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
