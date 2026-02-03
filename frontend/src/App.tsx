import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { useTelegram } from './hooks/useTelegram'
import { GoogleOAuthProvider } from '@react-oauth/google'
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
      <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID || ''}>
      <AuthProvider>
        <BrowserRouter>
          <ToastProvider>
            <TelegramGate>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/practice/:id" element={<PracticeExamPage />} />
                <Route path="/practice/:id/results" element={<PracticeResultsPage />} />
                <Route path="/exam/:examId/lobby" element={<LobbyPage />} />
                <Route path="/exam/:examId" element={<ExamPage />} />
                <Route path="/results/:sessionId" element={<ResultsPage />} />
                <Route path="/leaderboard" element={<LeaderboardPage />} />
                <Route path="/admin" element={<AdminLoginPage />} />
                <Route path="/admin/dashboard" element={<AdminDashboard />} />
                <Route path="/admin/exams/create" element={<CreateExamPage />} />
                <Route path="/admin/exams/:examId/answers" element={<ExamAnswersPage />} />
                <Route path="/admin/exams/:examId/results" element={<ExamResultsPage />} />
                <Route path="/admin/exams/:examId/codes" element={<InviteCodesPage />} />
              </Routes>
            </TelegramGate>
          </ToastProvider>
        </BrowserRouter>
      </AuthProvider>
      </GoogleOAuthProvider>
    </ErrorBoundary>
  )
}

export default App
