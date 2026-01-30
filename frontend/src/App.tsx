import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { useTelegram } from './hooks/useTelegram'
import ErrorBoundary from './components/ErrorBoundary'
import LoadingSpinner from './components/LoadingSpinner'
import LoginPage from './pages/LoginPage'
import ExamPage from './pages/ExamPage'
import ResultsPage from './pages/ResultsPage'
import AdminLoginPage from './pages/admin/AdminLoginPage'
import AdminDashboard from './pages/admin/AdminDashboard'
import CreateExamPage from './pages/admin/CreateExamPage'
import ExamAnswersPage from './pages/admin/ExamAnswersPage'
import ExamResultsPage from './pages/admin/ExamResultsPage'
import InviteCodesPage from './pages/admin/InviteCodesPage'

function TelegramGate({ children }: { children: React.ReactNode }) {
  const { isTelegram, initData, ready, expand } = useTelegram()
  const { isAuthenticated, loginWithTelegram } = useAuth()
  const [loading, setLoading] = useState(isTelegram && !isAuthenticated)

  useEffect(() => {
    if (isTelegram) {
      ready()
      expand()
      if (!isAuthenticated && initData) {
        loginWithTelegram(initData).finally(() => setLoading(false))
      }
    }
  }, [isTelegram, isAuthenticated, initData, loginWithTelegram, ready, expand])

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
          <TelegramGate>
            <Routes>
              <Route path="/" element={<LoginPage />} />
              <Route path="/exam/:examId" element={<ExamPage />} />
              <Route path="/results/:sessionId" element={<ResultsPage />} />
              <Route path="/admin" element={<AdminLoginPage />} />
              <Route path="/admin/dashboard" element={<AdminDashboard />} />
              <Route path="/admin/exams/create" element={<CreateExamPage />} />
              <Route path="/admin/exams/:examId/answers" element={<ExamAnswersPage />} />
              <Route path="/admin/exams/:examId/results" element={<ExamResultsPage />} />
              <Route path="/admin/exams/:examId/codes" element={<InviteCodesPage />} />
            </Routes>
          </TelegramGate>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  )
}

export default App
