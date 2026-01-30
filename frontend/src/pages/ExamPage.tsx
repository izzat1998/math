import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import type { Exam, SessionStart } from '../api/types'
import PdfViewer from '../components/PdfViewer'
import AnswerSidebar from '../components/AnswerSidebar'
import Timer from '../components/Timer'
import LoadingSpinner from '../components/LoadingSpinner'

type ExamStatus = 'loading' | 'not_open' | 'closed' | 'active'

function getExamStatus(exam: Exam | null): ExamStatus {
  if (!exam) return 'loading'
  const now = Date.now()
  const open = new Date(exam.open_at).getTime()
  const close = new Date(exam.close_at).getTime()
  if (now < open) return 'not_open'
  if (now > close) return 'closed'
  return 'active'
}

export default function ExamPage() {
  const { examId } = useParams<{ examId: string }>()
  const { fullName } = useAuth()
  const navigate = useNavigate()

  const [exam, setExam] = useState<Exam | null>(null)
  const [session, setSession] = useState<SessionStart | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [showSidebar, setShowSidebar] = useState(false)

  useEffect(() => {
    api.get<Exam>(`/exams/${examId}/`).then(({ data }) => setExam(data))
  }, [examId])

  useEffect(() => {
    if (!exam) return
    const status = getExamStatus(exam)
    if (status !== 'active') return

    api.post<SessionStart>(`/exams/${examId}/start/`).then(({ data }) => {
      setSession(data)
    }).catch((err) => {
      if (err.response?.data?.error === 'Already submitted') {
        navigate(`/results/${examId}`)
      }
    })
  }, [examId, exam, navigate])

  useEffect(() => {
    if (!session || submitted) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [session, submitted])

  const saveAnswer = useCallback(
    (questionNumber: number, subPart: string | null, answer: string) => {
      if (!session) return
      const key = subPart ? `${questionNumber}_${subPart}` : `${questionNumber}`
      setAnswers((prev) => ({ ...prev, [key]: answer }))
      api.post(`/sessions/${session.session_id}/answers/`, {
        question_number: questionNumber,
        sub_part: subPart,
        answer,
      })
    },
    [session]
  )

  const handleSubmit = async () => {
    if (!session || submitted) return
    if (!confirm('Topshirishni xohlaysizmi? Topshirgandan keyin javoblarni o\'zgartira olmaysiz.')) return
    await api.post(`/sessions/${session.session_id}/submit/`)
    setSubmitted(true)
    navigate(`/results/${session.session_id}`)
  }

  const handleExpire = useCallback(() => {
    if (!session || submitted) return
    api.post(`/sessions/${session.session_id}/submit/`).then(() => {
      setSubmitted(true)
      navigate(`/results/${session.session_id}`)
    })
  }, [session, submitted, navigate])

  const answeredCount = Object.keys(answers).length
  const examStatus = getExamStatus(exam)

  if (examStatus === 'loading' || !exam) {
    return <LoadingSpinner fullScreen label="Imtihon yuklanmoqda..." />
  }

  if (examStatus === 'not_open') {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="text-center max-w-sm mx-auto p-8 animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-warning-50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-warning-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">Imtihon hali ochilmagan</h2>
          <p className="text-sm text-slate-500 mb-1">
            <span className="font-medium text-slate-700">{exam.title}</span>
          </p>
          <p className="text-sm text-slate-500">
            Ochilish vaqti: {new Date(exam.open_at).toLocaleString()}
          </p>
        </div>
      </div>
    )
  }

  if (examStatus === 'closed') {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="text-center max-w-sm mx-auto p-8 animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">Imtihon yopilgan</h2>
          <p className="text-sm text-slate-500 mb-1">
            <span className="font-medium text-slate-700">{exam.title}</span>
          </p>
          <p className="text-sm text-slate-500">
            Bu imtihon yopilgan: {new Date(exam.close_at).toLocaleString()}
          </p>
        </div>
      </div>
    )
  }

  if (!session) {
    return <LoadingSpinner fullScreen label="Sessiya boshlanmoqda..." />
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-slate-200 shadow-sm z-30">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="p-1.5 rounded-md hover:bg-slate-100 transition-colors hidden md:flex"
            aria-label="Bosh sahifaga qaytish"
          >
            <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
          </button>
          <h1 className="font-semibold text-slate-800 text-sm sm:text-base truncate max-w-[150px] sm:max-w-none">
            {exam.title}
          </h1>
        </div>

        <Timer
          startedAt={session.started_at}
          durationMinutes={session.duration}
          onExpire={handleExpire}
        />

        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500 hidden sm:inline">{fullName}</span>
          <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
            <span className="text-xs font-semibold text-primary-700">
              {fullName?.charAt(0)?.toUpperCase() || '?'}
            </span>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* PDF viewer */}
        <div className={`${showSidebar ? 'hidden md:block md:w-[65%]' : 'w-full'} h-full`}>
          <PdfViewer url={`/exams/${examId}/pdf/`} />
        </div>

        {/* Sidebar - desktop */}
        <div className="w-[35%] border-l border-slate-200 bg-white hidden md:flex flex-col">
          <AnswerSidebar
            answers={answers}
            onAnswer={saveAnswer}
            onSubmit={handleSubmit}
            disabled={submitted}
          />
        </div>
      </div>

      {/* Mobile FAB */}
      <button
        onClick={() => setShowSidebar(!showSidebar)}
        className="md:hidden fixed bottom-6 right-6 w-14 h-14 bg-accent-500 text-white rounded-full shadow-lg flex items-center justify-center text-xl z-50 hover:bg-accent-600 transition-colors"
        aria-label="Javoblarni ko'rsatish"
      >
        {showSidebar ? (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        ) : (
          <>
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
            </svg>
            {answeredCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-danger-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {answeredCount}
              </span>
            )}
          </>
        )}
      </button>

      {/* Mobile bottom sheet (65vh) */}
      {showSidebar && (
        <div className="md:hidden fixed inset-x-0 bottom-0 h-[65vh] bg-white z-40 rounded-t-2xl shadow-[0_-4px_24px_rgba(0,0,0,0.12)] animate-slide-up flex flex-col">
          <div className="flex justify-center py-2">
            <div className="w-10 h-1 bg-slate-300 rounded-full" />
          </div>
          <div className="flex-1 overflow-hidden">
            <AnswerSidebar
              answers={answers}
              onAnswer={saveAnswer}
              onSubmit={handleSubmit}
              disabled={submitted}
            />
          </div>
        </div>
      )}
    </div>
  )
}
