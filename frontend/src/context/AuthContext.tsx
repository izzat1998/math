import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import api from '../api/client'
import type { AuthResponse } from '../api/types'

interface AuthContextType {
  studentId: string | null
  fullName: string | null
  isAuthenticated: boolean
  loginWithInviteCode: (code: string, fullName: string) => Promise<AuthResponse>
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

  const loginWithInviteCode = async (code: string, fullName: string) => {
    const { data } = await api.post<AuthResponse>('/auth/invite-code/', { code, full_name: fullName })
    setAuth(data)
    return data
  }

  const loginWithTelegram = async (initData: string) => {
    const { data } = await api.post<AuthResponse>('/auth/telegram/', { initData })
    setAuth(data)
    return data
  }

  const logout = () => {
    localStorage.clear()
    setStudentId(null)
    setFullName(null)
  }

  return (
    <AuthContext.Provider
      value={{
        studentId,
        fullName,
        isAuthenticated: !!studentId,
        loginWithInviteCode,
        loginWithTelegram,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
