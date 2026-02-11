import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { useTelegram } from './hooks/useTelegram'
import ErrorBoundary from './components/ErrorBoundary'
import LoadingSpinner from './components/LoadingSpinner'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import ExamPage from './pages/ExamPage'
import ResultsPage from './pages/ResultsPage'
import PracticeExamPage from './pages/PracticeExamPage'
import PracticeResultsPage from './pages/PracticeResultsPage'
import LobbyPage from './pages/LobbyPage'
import AdminLoginPage from './pages/admin/AdminLoginPage'
import AdminDashboard from './pages/admin/AdminDashboard'
import CreateExamPage from './pages/admin/CreateExamPage'
import ExamAnswersPage from './pages/admin/ExamAnswersPage'
import ExamResultsPage from './pages/admin/ExamResultsPage'
import InviteCodesPage from './pages/admin/InviteCodesPage'
import LeaderboardPage from './pages/LeaderboardPage'

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
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
  const [loading, setLoading] = useState(isTelegram && !isAuthenticated)

  useEffect(() => {
    if (!isTelegram) return
    ready()
    expand()
    setHeaderColor('#1e3a5f')
    setBackgroundColor('#f8fafc')

    if (!isAuthenticated && initData) {
      loginWithTelegram(initData).finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [isTelegram, isAuthenticated, initData, loginWithTelegram, ready, expand, setHeaderColor, setBackgroundColor])

  if (loading) {
    return <LoadingSpinner fullScreen label="Ulanmoqda..." />
  }

  return <>{children}</>
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <ToastProvider>
            <TelegramGate>
              <Routes>
                <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/practice/:id" element={<ProtectedRoute><PracticeExamPage /></ProtectedRoute>} />
                <Route path="/practice/:id/results" element={<ProtectedRoute><PracticeResultsPage /></ProtectedRoute>} />
                <Route path="/exam/:examId/lobby" element={<ProtectedRoute><LobbyPage /></ProtectedRoute>} />
                <Route path="/exam/:examId" element={<ProtectedRoute><ExamPage /></ProtectedRoute>} />
                <Route path="/results/:sessionId" element={<ProtectedRoute><ResultsPage /></ProtectedRoute>} />
                <Route path="/leaderboard" element={<ProtectedRoute><LeaderboardPage /></ProtectedRoute>} />
                <Route path="/admin" element={<AdminLoginPage />} />
                <Route path="/admin/dashboard" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
                <Route path="/admin/exams/create" element={<AdminRoute><CreateExamPage /></AdminRoute>} />
                <Route path="/admin/exams/:examId/answers" element={<AdminRoute><ExamAnswersPage /></AdminRoute>} />
                <Route path="/admin/exams/:examId/results" element={<AdminRoute><ExamResultsPage /></AdminRoute>} />
                <Route path="/admin/exams/:examId/codes" element={<AdminRoute><InviteCodesPage /></AdminRoute>} />
              </Routes>
            </TelegramGate>
          </ToastProvider>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  )
}

export default App
