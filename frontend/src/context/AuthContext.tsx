import { createContext, useCallback, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import api from '../api/client'
import type { AuthResponse } from '../api/types'

interface AuthContextType {
  studentId: string | null
  fullName: string | null
  isAuthenticated: boolean
  loginWithTelegram: (initData: string) => Promise<AuthResponse>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [studentId, setStudentId] = useState<string | null>(
    localStorage.getItem('student_id')
  )
  const [fullName, setFullName] = useState<string | null>(
    localStorage.getItem('full_name')
  )

  const setAuth = (data: AuthResponse) => {
    localStorage.setItem('access_token', data.access)
    localStorage.setItem('refresh_token', data.refresh)
    localStorage.setItem('student_id', data.student_id)
    localStorage.setItem('full_name', data.full_name)
    setStudentId(data.student_id)
    setFullName(data.full_name)
  }

  const loginWithTelegram = useCallback(async (initData: string) => {
    const { data } = await api.post<AuthResponse>('/auth/telegram/', { initData })
    setAuth(data)
    return data
  }, [])

  const logout = useCallback(() => {
    const refreshToken = localStorage.getItem('refresh_token')
    if (refreshToken) {
      api.post('/auth/logout/', { refresh: refreshToken }).catch(() => {})
    }
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('student_id')
    localStorage.removeItem('full_name')
    setStudentId(null)
    setFullName(null)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        studentId,
        fullName,
        isAuthenticated: !!studentId,
        loginWithTelegram,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
