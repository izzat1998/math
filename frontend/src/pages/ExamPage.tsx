import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api/client'
import { enqueue, flush, onQueueChange, clearQueue, getPendingCount } from '../api/answerQueue'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useTelegram } from '../hooks/useTelegram'
import { useMobileDetect } from '../hooks/useMobileDetect'
import type { Exam, SessionStart } from '../api/types'
import PdfViewer from '../components/PdfViewer'
import type { PageInfo } from '../components/PdfViewer'
import AnswerSidebar from '../components/AnswerSidebar'
import AnswerBar from '../components/AnswerBar'
import Timer from '../components/Timer'
import EloBadge from '../components/EloBadge'
import LoadingSpinner from '../components/LoadingSpinner'
import ConnectionBanner from '../components/ConnectionBanner'

function ProgressIndicator({ answers, variant = 'dark' }: { answers: Record<string, string>; variant?: 'dark' | 'light' }) {
  let answered = 0
  for (let q = 1; q <= 35; q++) {
    if (answers[`${q}`]) answered++
  }
  for (let q = 36; q <= 45; q++) {
    if (answers[`${q}_a`]) answered++
    if (answers[`${q}_b`]) answered++
  }
  const totalFields = 55
  const percentage = Math.round((answered / totalFields) * 100)

  const isDark = variant === 'dark'

  return (
    <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-medium ${
      isDark
        ? 'bg-white/10 border-white/10 text-white/80'
        : 'bg-slate-100 border-slate-200 text-slate-500'
    }`}>
      <div className={`w-16 h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-white/15' : 'bg-slate-200'}`}>
        <div
          className={`h-full rounded-full transition-all duration-300 ${isDark ? 'bg-accent-400' : 'bg-primary-500'}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="tabular-nums whitespace-nowrap">
        {answered}/{totalFields}
      </span>
    </div>
  )
}

function getStorageKey(sessionId: string) {
  return `exam_answers_${sessionId}`
}

function loadSavedAnswers(sessionId: string): Record<string, string> {
  try {
    const saved = localStorage.getItem(getStorageKey(sessionId))
    return saved ? JSON.parse(saved) : {}
  } catch {
    return {}
  }
}

type ExamStatus = 'loading' | 'not_open' | 'closed' | 'active'

function getExamStatus(exam: Exam | null): ExamStatus {
  if (!exam) return 'loading'
  const now = Date.now()
  const open = new Date(exam.scheduled_start).getTime()
  const close = new Date(exam.scheduled_end).getTime()
  if (now < open) return 'not_open'
  if (now > close) return 'closed'
  return 'active'
}

const TOTAL_QUESTIONS = 45

const IS_DEV = import.meta.env.DEV

export default function ExamPage() {
  const { examId } = useParams<{ examId: string }>()
  const { fullName, isAuthenticated } = useAuth()
  const { toast } = useToast()
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

  const isMock = IS_DEV && !isAuthenticated

  const [exam, setExam] = useState<Exam | null>(null)
  const [session, setSession] = useState<SessionStart | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const [fetchError, setFetchError] = useState(false)
  const [currentQuestion, setCurrentQuestion] = useState(1)
  const [activeQuestion, setActiveQuestion] = useState<number | undefined>()
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null)
  const [myElo, setMyElo] = useState<number | null>(isMock ? 1200 : null)
  const isSubmitting = useRef(false)
  const [pendingCount, setPendingCount] = useState(getPendingCount)

  // Subscribe to answer queue changes
  useEffect(() => {
    const unsubscribe = onQueueChange(setPendingCount)
    return unsubscribe
  }, [])

  // Flush queued answers when coming back online
  useEffect(() => {
    const handleOnline = () => { flush() }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [])

  useEffect(() => {
    if (isTelegram) {
      setHeaderColor('#0a1628')
      setBackgroundColor('#f8fafc')
    }
  }, [isTelegram, setHeaderColor, setBackgroundColor])

  useEffect(() => {
    if (!isAuthenticated) return
    api.get<{ current_elo: number }>('/me/elo-history/').then(({ data }) => setMyElo(data.current_elo)).catch(() => {})
  }, [isAuthenticated])

  useEffect(() => {
    api.get<Exam>(`/exams/${examId}/`).then(({ data }) => setExam(data)).catch(() => {
      if (isMock) {
        // In dev mode without auth, use mock exam data
        const mockExam = {
          id: examId || 'dev-mock',
          title: 'Dev Mock Exam',
          duration: 120,
          scheduled_start: new Date(Date.now() - 3600000).toISOString(),
          scheduled_end: new Date(Date.now() + 3600000).toISOString(),
          is_open: true,
        } as Exam
        setExam(mockExam)
        setSession({
          session_id: 'dev-session',
          started_at: new Date().toISOString(),
          duration: mockExam.duration,
        })
      } else {
        setFetchError(true)
        toast('Imtihon yuklanmadi', 'error')
      }
    })
  }, [examId, toast, isMock])

  useEffect(() => {
    if (!exam || isMock) return

    const status = getExamStatus(exam)
    if (status !== 'active') return

    api.post<SessionStart>(`/exams/${examId}/start/`).then(({ data }) => {
      setSession(data)
      // Restore any locally saved answers
      const saved = loadSavedAnswers(data.session_id)
      if (Object.keys(saved).length > 0) {
        setAnswers(saved)
      }
    }).catch((err) => {
      if (err.response?.status === 403 && err.response?.data?.error) {
        toast('Imtihon allaqachon topshirilgan', 'error')
        navigate('/')
      } else {
        setFetchError(true)
        toast('Sessiyani boshlashda xatolik', 'error')
      }
    })
  }, [examId, exam, navigate, toast, isMock])

  useEffect(() => {
    if (!session || submitted) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [session, submitted])

  // Clean up localStorage backup and debounce timers on submit
  useEffect(() => {
    if (submitted && session) {
      localStorage.removeItem(getStorageKey(session.session_id))
      Object.values(debounceTimers.current).forEach(clearTimeout)
      debounceTimers.current = {}
    }
  }, [submitted, session])

  // Clean up debounce timers on unmount to prevent stale API calls
  useEffect(() => {
    return () => {
      Object.values(debounceTimers.current).forEach(clearTimeout)
    }
  }, [])


  const saveAnswer = useCallback(
    (questionNumber: number, subPart: string | null, answer: string) => {
      if (!session) return
      const key = subPart ? `${questionNumber}_${subPart}` : `${questionNumber}`

      // Update local state immediately
      setAnswers((prev) => {
        const next = { ...prev, [key]: answer }
        // Persist to localStorage as backup
        try { localStorage.setItem(getStorageKey(session.session_id), JSON.stringify(next)) } catch { /* storage full or unavailable */ }
        return next
      })
      hapticImpact('light')
      if (isMock) return

      const sendToServer = () => {
        api.post(`/sessions/${session.session_id}/answers/`, {
          question_number: questionNumber,
          sub_part: subPart,
          answer,
        }).catch(() => {
          enqueue({
            sessionId: session.session_id,
            questionNumber,
            subPart,
            answer,
            timestamp: Date.now(),
          })
        })
      }

      // MCQ answers (no sub_part, questions 1-35): save immediately
      // Free-response answers: debounce 600ms to avoid spamming on every keystroke
      if (!subPart) {
        sendToServer()
      } else {
        clearTimeout(debounceTimers.current[key])
        debounceTimers.current[key] = setTimeout(sendToServer, 600)
      }
    },
    [session, hapticImpact, isMock]
  )

  const handleSubmit = useCallback(async () => {
    if (!session || submitted || isSubmitting.current) return
    isSubmitting.current = true

    if (isTelegram) {
      const buttonId = await showPopup({
        title: 'Topshirishni tasdiqlang',
        message: "Topshirgandan keyin javoblarni o'zgartira olmaysiz.",
        buttons: [
          { id: 'cancel', type: 'cancel', text: 'Bekor qilish' },
          { id: 'submit', type: 'destructive', text: 'Topshirish' },
        ],
      })
      if (buttonId !== 'submit') { isSubmitting.current = false; return }
    } else {
      if (!confirm("Topshirishni xohlaysizmi? Topshirgandan keyin javoblarni o'zgartira olmaysiz.")) { isSubmitting.current = false; return }
    }

    // Flush the offline answer queue first
    await flush()

    // Flush all pending debounced answer saves before submitting
    const pendingKeys = Object.keys(debounceTimers.current)
    Object.values(debounceTimers.current).forEach(clearTimeout)
    debounceTimers.current = {}

    if (pendingKeys.length > 0) {
      const saved = loadSavedAnswers(session.session_id)
      const flushPromises: Promise<void>[] = []
      for (const key of pendingKeys) {
        const answer = saved[key]
        if (!answer) continue
        const parts = key.split('_')
        const questionNumber = parseInt(parts[0], 10)
        const subPart = parts[1] || null
        flushPromises.push(
          api.post(`/sessions/${session.session_id}/answers/`, {
            question_number: questionNumber,
            sub_part: subPart,
            answer,
          }).then(() => {}).catch(() => {})
        )
      }
      await Promise.all(flushPromises)
    }

    try {
      setMainButtonLoading(true)
      await api.post(`/sessions/${session.session_id}/submit/`)
      setSubmitted(true)
      clearQueue(session.session_id)
      hapticNotification('success')
      hideMainButton()
      navigate(`/exam/${examId}/waiting`, { state: { sessionId: session.session_id } })
    } catch {
      isSubmitting.current = false
      setMainButtonLoading(false)
      toast("Topshirishda xatolik yuz berdi. Qaytadan urinib ko'ring.", 'error')
    }
  }, [session, submitted, isTelegram, showPopup, setMainButtonLoading, hapticNotification, hideMainButton, navigate, toast, examId])

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

  const handleExpire = useCallback(async () => {
    if (isSubmitting.current || !session || submitted) return
    isSubmitting.current = true

    // Flush the offline answer queue first
    await flush()

    // Flush all pending debounced answer saves before submitting
    const pendingKeys = Object.keys(debounceTimers.current)
    Object.values(debounceTimers.current).forEach(clearTimeout)
    debounceTimers.current = {}

    // Send any pending free-response answers to the server
    const flushPromises: Promise<void>[] = []
    if (pendingKeys.length > 0) {
      // Read current answers from localStorage backup (most reliable source)
      const saved = loadSavedAnswers(session.session_id)
      for (const key of pendingKeys) {
        const answer = saved[key]
        if (!answer) continue
        const parts = key.split('_')
        const questionNumber = parseInt(parts[0], 10)
        const subPart = parts[1] || null
        flushPromises.push(
          api.post(`/sessions/${session.session_id}/answers/`, {
            question_number: questionNumber,
            sub_part: subPart,
            answer,
          }).then(() => {}).catch(() => {})
        )
      }
    }

    await Promise.all(flushPromises)

    api.post(`/sessions/${session.session_id}/submit/`).then(() => {
      clearQueue(session.session_id)
      setSubmitted(true)
      hapticNotification('warning')
      toast('Vaqt tugadi! Javoblar topshirildi.', 'success')
      navigate(`/exam/${examId}/waiting`, { state: { sessionId: session.session_id } })
    }).catch(() => {
      isSubmitting.current = false
      toast('Vaqt tugadi, lekin topshirishda xatolik. Sahifani yangilang.', 'error')
    })
  }, [session, submitted, navigate, hapticNotification, toast, examId])

  const handleNavigate = useCallback((q: number) => {
    setCurrentQuestion(q)
    hapticImpact('light')
  }, [hapticImpact])

  const totalQuestions = TOTAL_QUESTIONS

  const examStatus = getExamStatus(exam)

  if (fetchError && !exam) {
    return (
      <div className="flex items-center justify-center h-screen-dvh bg-slate-50 bg-noise">
        <div className="text-center max-w-sm mx-auto p-8 animate-slide-up">
          <div className="w-16 h-16 rounded-2xl bg-danger-50 border border-danger-100 flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7 text-danger-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-slate-800 mb-2 tracking-tight">Xatolik yuz berdi</h2>
          <p className="text-sm text-slate-400 font-medium mb-5">Imtihon yuklanmadi. Internetga ulanishni tekshiring.</p>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-500 text-white rounded-xl font-semibold text-sm hover:bg-primary-600 transition-colors active:scale-95"
          >
            Qayta yuklash
          </button>
        </div>
      </div>
    )
  }

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
            {new Date(exam.scheduled_start).toLocaleString()}
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
        <ConnectionBanner pendingAnswers={pendingCount} />
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
            <ProgressIndicator answers={answers} />
            <Timer
              startedAt={session.started_at}
              durationMinutes={session.duration}
              onExpire={handleExpire}
            />
          </div>
        ) : (
          <div className="flex items-center justify-center gap-3 px-3 py-2.5 bg-primary-900/50 z-30 shrink-0">
            <ProgressIndicator answers={answers} />
            <Timer
              startedAt={session.started_at}
              durationMinutes={session.duration}
              onExpire={handleExpire}
            />
          </div>
        )}

        {/* PDF viewer */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <PdfViewer url={`/exams/${examId}/pdf/?v=2`} currentQuestion={currentQuestion} />
        </div>

        {/* Answer bar */}
        <AnswerBar
          currentQuestion={currentQuestion}
          totalQuestions={totalQuestions}
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
      <ConnectionBanner pendingAnswers={pendingCount} />
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

        <ProgressIndicator answers={answers} variant="light" />

        <Timer
          startedAt={session.started_at}
          durationMinutes={session.duration}
          onExpire={handleExpire}
        />

        <div className="flex items-center gap-2.5">
          {myElo !== null && <EloBadge elo={myElo} />}
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
          <PdfViewer url={`/exams/${examId}/pdf/?v=2`} currentQuestion={activeQuestion} onPageInfo={setPageInfo} />
        </div>
        <div className="w-[35%] border-l border-slate-200/80 bg-white flex flex-col">
          <AnswerSidebar
            answers={answers}
            onAnswer={saveAnswer}
            onSubmit={handleSubmit}
            disabled={submitted}
            onQuestionFocus={setActiveQuestion}
            pageInfo={pageInfo}
          />
        </div>
      </div>
    </div>
  )
}
