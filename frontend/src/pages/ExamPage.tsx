import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useTelegram } from '../hooks/useTelegram'
import { useMobileDetect } from '../hooks/useMobileDetect'
import type { Exam, SessionStart } from '../api/types'
import PdfViewer from '../components/PdfViewer'
import AnswerSidebar from '../components/AnswerSidebar'
import AnswerBar from '../components/AnswerBar'
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

const TOTAL_QUESTIONS = 45

export default function ExamPage() {
  const { examId } = useParams<{ examId: string }>()
  const { fullName } = useAuth()
  const navigate = useNavigate()
  const { isMobile } = useMobileDetect()
  const {
    isTelegram,
    showMainButton,
    hideMainButton,
    setMainButtonLoading,
    showBackButton,
    hideBackButton,
    hapticImpact,
    hapticNotification,
    showPopup,
    setHeaderColor,
    setBackgroundColor,
  } = useTelegram()

  const [exam, setExam] = useState<Exam | null>(null)
  const [session, setSession] = useState<SessionStart | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [currentQuestion, setCurrentQuestion] = useState(1)

  useEffect(() => {
    if (isTelegram) {
      setHeaderColor('#0a1628')
      setBackgroundColor('#f8fafc')
    }
  }, [isTelegram, setHeaderColor, setBackgroundColor])

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
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [session, submitted])

  const saveAnswer = useCallback(
    (questionNumber: number, subPart: string | null, answer: string) => {
      if (!session) return
      const key = subPart ? `${questionNumber}_${subPart}` : `${questionNumber}`
      setAnswers((prev) => ({ ...prev, [key]: answer }))
      hapticImpact('light')
      api.post(`/sessions/${session.session_id}/answers/`, {
        question_number: questionNumber,
        sub_part: subPart,
        answer,
      })
    },
    [session, hapticImpact]
  )

  const handleSubmit = useCallback(async () => {
    if (!session || submitted) return

    if (isTelegram) {
      const buttonId = await showPopup({
        title: 'Topshirishni tasdiqlang',
        message: "Topshirgandan keyin javoblarni o'zgartira olmaysiz.",
        buttons: [
          { id: 'cancel', type: 'cancel', text: 'Bekor qilish' },
          { id: 'submit', type: 'destructive', text: 'Topshirish' },
        ],
      })
      if (buttonId !== 'submit') return
    } else {
      if (!confirm("Topshirishni xohlaysizmi? Topshirgandan keyin javoblarni o'zgartira olmaysiz.")) return
    }

    setMainButtonLoading(true)
    await api.post(`/sessions/${session.session_id}/submit/`)
    setSubmitted(true)
    hapticNotification('success')
    hideMainButton()
    navigate(`/results/${session.session_id}`)
  }, [session, submitted, isTelegram, showPopup, setMainButtonLoading, hapticNotification, hideMainButton, navigate])

  useEffect(() => {
    if (isTelegram && session && !submitted) {
      showMainButton('Topshirish', handleSubmit)
      return () => hideMainButton()
    }
  }, [isTelegram, session, submitted, showMainButton, hideMainButton, handleSubmit])

  useEffect(() => {
    if (isTelegram) {
      showBackButton(() => navigate('/'))
      return () => hideBackButton()
    }
  }, [isTelegram, showBackButton, hideBackButton, navigate])

  const handleExpire = useCallback(() => {
    if (!session || submitted) return
    api.post(`/sessions/${session.session_id}/submit/`).then(() => {
      setSubmitted(true)
      hapticNotification('warning')
      navigate(`/results/${session.session_id}`)
    })
  }, [session, submitted, navigate, hapticNotification])

  const handleNavigate = useCallback((q: number) => {
    setCurrentQuestion(q)
    hapticImpact('light')
  }, [hapticImpact])

  const examStatus = getExamStatus(exam)

  if (examStatus === 'loading' || !exam) {
    return <LoadingSpinner fullScreen label="Imtihon yuklanmoqda..." />
  }

  if (examStatus === 'not_open') {
    return (
      <div className="flex items-center justify-center h-screen-dvh bg-slate-50 bg-noise">
        <div className="text-center max-w-sm mx-auto p-8 animate-slide-up">
          <div className="w-16 h-16 rounded-2xl bg-warning-500/10 border border-warning-500/20 flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7 text-warning-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-slate-800 mb-2 tracking-tight">Imtihon hali ochilmagan</h2>
          <p className="text-sm text-slate-400 font-medium mb-1">{exam.title}</p>
          <p className="text-sm text-slate-400">
            {new Date(exam.open_at).toLocaleString()}
          </p>
        </div>
      </div>
    )
  }

  if (examStatus === 'closed') {
    return (
      <div className="flex items-center justify-center h-screen-dvh bg-slate-50 bg-noise">
        <div className="text-center max-w-sm mx-auto p-8 animate-slide-up">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-slate-800 mb-2 tracking-tight">Imtihon yopilgan</h2>
          <p className="text-sm text-slate-400 font-medium">{exam.title}</p>
        </div>
      </div>
    )
  }

  if (!session) {
    return <LoadingSpinner fullScreen label="Sessiya boshlanmoqda..." />
  }

  // ── Mobile layout ──
  if (isMobile) {
    return (
      <div className="h-screen-dvh flex flex-col bg-slate-50">
        {/* Header */}
        {!isTelegram ? (
          <div className="flex items-center justify-between px-3 py-2.5 bg-primary-800 z-30 shrink-0">
            <button
              onClick={() => navigate('/')}
              className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center active:scale-90 transition-transform"
              aria-label="Orqaga"
            >
              <svg className="w-4.5 h-4.5 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
              </svg>
            </button>
            <Timer
              startedAt={session.started_at}
              durationMinutes={session.duration}
              onExpire={handleExpire}
            />
          </div>
        ) : (
          <div className="flex items-center justify-center px-3 py-2.5 bg-primary-900/50 z-30 shrink-0">
            <Timer
              startedAt={session.started_at}
              durationMinutes={session.duration}
              onExpire={handleExpire}
            />
          </div>
        )}

        {/* PDF viewer */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <PdfViewer url={`/exams/${examId}/pdf/`} />
        </div>

        {/* Answer bar */}
        <AnswerBar
          currentQuestion={currentQuestion}
          totalQuestions={TOTAL_QUESTIONS}
          answers={answers}
          onAnswer={saveAnswer}
          onNavigate={handleNavigate}
          disabled={submitted}
        />
      </div>
    )
  }

  // ── Desktop layout ──
  return (
    <div className="h-screen-dvh flex flex-col bg-slate-50">
      <div className="flex items-center justify-between px-5 py-2.5 bg-white border-b border-slate-200/80 z-30 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="p-2 rounded-xl hover:bg-slate-100 transition-colors active:scale-95"
            aria-label="Bosh sahifaga qaytish"
          >
            <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
          </button>
          <h1 className="font-bold text-slate-800 text-base tracking-tight">
            {exam.title}
          </h1>
        </div>

        <Timer
          startedAt={session.started_at}
          durationMinutes={session.duration}
          onExpire={handleExpire}
        />

        <div className="flex items-center gap-2.5">
          <span className="text-sm text-slate-400 font-medium">{fullName}</span>
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
            <span className="text-xs font-bold text-white">
              {fullName?.charAt(0)?.toUpperCase() || '?'}
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-[65%] h-full">
          <PdfViewer url={`/exams/${examId}/pdf/`} />
        </div>
        <div className="w-[35%] border-l border-slate-200/80 bg-white flex flex-col">
          <AnswerSidebar
            answers={answers}
            onAnswer={saveAnswer}
            onSubmit={handleSubmit}
            disabled={submitted}
          />
        </div>
      </div>
    </div>
  )
}
