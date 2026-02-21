import { lazy, Suspense, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { useTelegram } from './hooks/useTelegram'
import ErrorBoundary from './components/ErrorBoundary'
import LoadingSpinner from './components/LoadingSpinner'

// Lazy-loaded pages for code splitting
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const ExamPage = lazy(() => import('./pages/ExamPage'))
const ResultsPage = lazy(() => import('./pages/ResultsPage'))
const PracticeExamPage = lazy(() => import('./pages/PracticeExamPage'))
const PracticeResultsPage = lazy(() => import('./pages/PracticeResultsPage'))
const LobbyPage = lazy(() => import('./pages/LobbyPage'))
const LeaderboardPage = lazy(() => import('./pages/LeaderboardPage'))
const AdminLoginPage = lazy(() => import('./pages/admin/AdminLoginPage'))
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'))
const CreateExamPage = lazy(() => import('./pages/admin/CreateExamPage'))
const ExamAnswersPage = lazy(() => import('./pages/admin/ExamAnswersPage'))
const ExamResultsPage = lazy(() => import('./pages/admin/ExamResultsPage'))
const HistoryPage = lazy(() => import('./pages/HistoryPage'))
const WaitingPage = lazy(() => import('./pages/WaitingPage'))
const EditExamPage = lazy(() => import('./pages/admin/EditExamPage'))
const ItemAnalysisPage = lazy(() => import('./pages/admin/ItemAnalysisPage'))
const AnalyticsPage = lazy(() => import('./pages/admin/AnalyticsPage'))

function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="text-center max-w-sm animate-slide-up">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center mx-auto mb-5">
          <span className="text-2xl font-extrabold text-slate-300">404</span>
        </div>
        <h2 className="text-lg font-bold text-slate-800 mb-2 tracking-tight">Sahifa topilmadi</h2>
        <p className="text-sm text-slate-400 font-medium mb-5">Bu sahifa mavjud emas yoki o'chirilgan.</p>
        <a
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-500 text-white rounded-xl font-semibold text-sm hover:bg-primary-600 transition-colors active:scale-95"
        >
          Bosh sahifaga qaytish
        </a>
      </div>
    </div>
  )
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) {
    // In Telegram Mini App, user should be auto-authenticated
    // If not, show loading or error state instead of redirect
    return <LoadingSpinner fullScreen label="Autentifikatsiya..." />
  }
  return <>{children}</>
}

function AdminRoute({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'ok' | 'denied'>('loading')

  useEffect(() => {
    const token = localStorage.getItem('admin_access_token')
    if (!token) {
      setStatus('denied')
      return
    }
    // Validate token by hitting a lightweight admin endpoint
    import('./pages/admin/adminApi').then(({ default: adminApi }) => {
      adminApi.get('/admin/exams/')
        .then(() => setStatus('ok'))
        .catch(() => setStatus('denied'))
    })
  }, [])

  if (status === 'loading') return <LoadingSpinner fullScreen label="" />
  if (status === 'denied') return <Navigate to="/admin" replace />
  return <>{children}</>
}

function TelegramGate({ children }: { children: ReactNode }) {
  const { isTelegram, initData, ready, expand, setHeaderColor, setBackgroundColor } = useTelegram()
  const { isAuthenticated, loginWithTelegram } = useAuth()
  const [loading, setLoading] = useState(() => isTelegram && !isAuthenticated && !!initData)
  const [telegramError, setTelegramError] = useState(false)

  useEffect(() => {
    if (!isTelegram) return
    ready()
    expand()
    setHeaderColor('#1e3a5f')
    setBackgroundColor('#f8fafc')

    if (!isAuthenticated && initData) {
      loginWithTelegram(initData)
        .catch(() => setTelegramError(true))
        .finally(() => setLoading(false))
    }
  }, [isTelegram, isAuthenticated, initData, loginWithTelegram, ready, expand, setHeaderColor, setBackgroundColor])

  if (loading) {
    return <LoadingSpinner fullScreen label="Ulanmoqda..." />
  }

  if (telegramError) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="text-center">
        <p className="text-lg font-semibold text-red-600 mb-2">Autentifikatsiya xatosi</p>
        <p className="text-sm text-slate-500 mb-4">Telegram orqali kirishda xatolik yuz berdi</p>
        <button onClick={() => window.location.reload()} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">Qayta urinish</button>
      </div>
    </div>
  )

  return <>{children}</>
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <ToastProvider>
            <TelegramGate>
              <Suspense fallback={<LoadingSpinner fullScreen />}>
                <Routes>
                  <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
                  <Route path="/practice/:id" element={<ProtectedRoute><PracticeExamPage /></ProtectedRoute>} />
                  <Route path="/practice/:id/results" element={<ProtectedRoute><PracticeResultsPage /></ProtectedRoute>} />
                  <Route path="/exam/:examId/lobby" element={<ProtectedRoute><LobbyPage /></ProtectedRoute>} />
                  <Route path="/exam/:examId" element={<ProtectedRoute><ExamPage /></ProtectedRoute>} />
                  <Route path="/results/:sessionId" element={<ProtectedRoute><ResultsPage /></ProtectedRoute>} />
                  <Route path="/leaderboard" element={<ProtectedRoute><LeaderboardPage /></ProtectedRoute>} />
                  <Route path="/history" element={<ProtectedRoute><HistoryPage /></ProtectedRoute>} />
                  <Route path="/exam/:examId/waiting" element={<ProtectedRoute><WaitingPage /></ProtectedRoute>} />
                  <Route path="/admin" element={<AdminLoginPage />} />
                  <Route path="/admin/dashboard" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
                  <Route path="/admin/exams/create" element={<AdminRoute><CreateExamPage /></AdminRoute>} />
                  <Route path="/admin/exams/:examId/answers" element={<AdminRoute><ExamAnswersPage /></AdminRoute>} />
                  <Route path="/admin/exams/:examId/results" element={<AdminRoute><ExamResultsPage /></AdminRoute>} />
                  <Route path="/admin/exams/:examId/edit" element={<AdminRoute><EditExamPage /></AdminRoute>} />
                  <Route path="/admin/exams/:examId/analysis" element={<AdminRoute><ItemAnalysisPage /></AdminRoute>} />
                  <Route path="/admin/analytics" element={<AdminRoute><AnalyticsPage /></AdminRoute>} />
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </Suspense>
            </TelegramGate>
          </ToastProvider>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  )
}

export default App
