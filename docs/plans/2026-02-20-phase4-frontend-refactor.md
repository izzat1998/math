# Phase 4: Frontend Cleanup & Refactoring

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove deprecated pages (LoginPage for web users, InviteCodesPage), update TypeScript types to match new API contracts, update routes, and clean AuthContext.

**Architecture:** Top-down cleanup — remove dead routes and pages first, then update types and context to match the new backend API.

**Tech Stack:** React 19, TypeScript, React Router 7, Vite

**Prerequisites:** Phase 2-3 complete (backend API contracts stable).

---

### Task 1: Update TypeScript Types

**Files:**
- Modify: `frontend/src/api/types.ts`

**Step 1: Update types to match new API**

Replace `frontend/src/api/types.ts` with:
```typescript
// Exam types
export interface Exam {
  id: string
  title: string
  pdf_file: string
  scheduled_start: string
  scheduled_end: string
  duration: number
  created_at: string
}

export interface SessionStart {
  session_id: string
  started_at: string
  duration: number  // May be less than 150 for late starters
}

export interface AnswerBreakdown {
  question_number: number
  sub_part: string | null
  is_correct: boolean
  student_answer: string
  correct_answer: string
}

export interface EloChange {
  elo_before: number
  elo_after: number
  elo_delta: number
}

export interface ExamResults {
  exercises_correct: number
  exercises_total: number
  points: number
  points_total: number
  rasch_scaled: number | null
  letter_grade: string
  is_auto_submitted: boolean
  exam_closed: boolean
  exam_title: string
  breakdown: AnswerBreakdown[]
  elo?: EloChange
}

// Dashboard types
export interface DashboardData {
  elo: number
  rasch_scaled: number
  exams_taken: number
  current_streak: number
  longest_streak: number
  achievements: AchievementEarned[]
  upcoming_exam: UpcomingExam | null
}

export interface AchievementEarned {
  name: string
  type: 'streak' | 'milestone' | 'improvement'
  icon: string
  earned_at: string
}

export interface AchievementFull {
  id: string
  name: string
  type: 'streak' | 'milestone' | 'improvement'
  description: string
  icon: string
  threshold: number
  earned: boolean
  earned_at: string | null
}

export interface ExamHistoryEntry {
  session_id: string
  exam_id: string
  exam_title: string
  submitted_at: string | null
  exercises_correct: number
  exercises_total: number
  rasch_scaled: number | null
  elo_delta: number | null
  is_auto_submitted: boolean
}

// Leaderboard types
export interface LeaderboardEntry {
  rank: number
  student_id: string
  full_name: string
  elo: number
  exams_taken: number
  trend: 'up' | 'down' | 'stable'
  last_elo_delta: number
  improvement?: number
  is_current_user: boolean
}

export interface LeaderboardResponse {
  tab: string
  entries: LeaderboardEntry[]
  my_entry?: LeaderboardEntry
}

export interface EloHistoryPoint {
  exam_title: string
  elo_before: number
  elo_after: number
  elo_delta: number
  score_percent: number
  date: string
}

export interface EloHistoryResponse {
  current_elo: number
  exams_taken: number
  history: EloHistoryPoint[]
}

// Auth types
export interface AuthResponse {
  access: string
  refresh: string
  student_id: string
  full_name: string
}

// Practice types
export interface Question {
  id: string
  text: string
  image?: string
  topic: string
  difficulty: number
  answer_type: 'mcq' | 'free_text'
  choices?: string[]
}

export interface QuestionResult extends Question {
  correct_answer: string
  explanation: string
}

export interface PracticeSession {
  id: string
  mode: 'light' | 'medium'
  questions: Question[]
  started_at: string
  duration: number
  answers: Record<string, string>
  status: 'in_progress' | 'submitted'
}

export interface PracticeBreakdown {
  question: QuestionResult
  student_answer: string
  is_correct: boolean
}

export interface PracticeResults {
  session_id: string
  mode: string
  score: number
  total: number
  duration: number
  started_at: string
  submitted_at?: string
  breakdown: PracticeBreakdown[]
}

// Upcoming & Lobby
export interface UpcomingExam {
  id: string
  title: string
  scheduled_start: string
  scheduled_end: string
  has_started: boolean
  already_taken?: boolean
}

export interface LobbyInfo {
  id: string
  title: string
  scheduled_start: string
  scheduled_end: string
  has_started: boolean
  has_ended: boolean
}
```

Key changes:
- Removed `open_at`/`close_at` from `Exam`, replaced with `scheduled_start`/`scheduled_end`
- Removed `exam_id` from `AuthResponse` (no invite codes)
- Added `rasch_scaled` and `letter_grade` to `ExamResults`
- Added `DashboardData`, `AchievementEarned`, `AchievementFull`, `ExamHistoryEntry`
- Added `already_taken` to `UpcomingExam`

**Step 2: Commit**
```bash
git add frontend/src/api/types.ts
git commit -m "refactor: update TypeScript types for new API contracts"
```

---

### Task 2: Clean AuthContext — Remove Invite Code Auth

**Files:**
- Modify: `frontend/src/context/AuthContext.tsx`

**Step 1: Update AuthContext**

Remove `loginWithInviteCode` and `exam_id` handling. The only auth method is `loginWithTelegram`:

```typescript
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
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

  const loginWithTelegram = async (initData: string) => {
    const res = await api.post<AuthResponse>('/auth/telegram/', { initData })
    setAuth(res.data)
    return res.data
  }

  const logout = async () => {
    const refresh = localStorage.getItem('refresh_token')
    if (refresh) {
      try {
        await api.post('/auth/logout/', { refresh })
      } catch { /* ignore */ }
    }
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('student_id')
    localStorage.removeItem('full_name')
    setStudentId(null)
    setFullName(null)
  }

  return (
    <AuthContext.Provider value={{
      studentId, fullName,
      isAuthenticated: !!studentId,
      loginWithTelegram, logout,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
```

**Step 2: Commit**
```bash
git add frontend/src/context/AuthContext.tsx
git commit -m "refactor: simplify AuthContext - Telegram-only auth"
```

---

### Task 3: Remove Deprecated Pages

**Files:**
- Delete: `frontend/src/pages/LoginPage.tsx` (web login — users only come via Telegram)
- Delete: `frontend/src/pages/admin/InviteCodesPage.tsx`
- Modify: `frontend/src/App.tsx` (update routes)

**Step 1: Delete LoginPage.tsx**

This page was for web-based invite code login. Users now only access via Telegram Mini App.

Run: `rm frontend/src/pages/LoginPage.tsx`

**Step 2: Delete InviteCodesPage.tsx**

Run: `rm frontend/src/pages/admin/InviteCodesPage.tsx`

**Step 3: Update App.tsx routes**

Remove:
```typescript
import LoginPage from './pages/LoginPage'
import InviteCodesPage from './pages/admin/InviteCodesPage'
```

Remove routes:
```typescript
// Remove: <Route path="/login" element={<LoginPage />} />
// Remove: <Route path="/admin/exams/:examId/codes" element={<AdminRoute><InviteCodesPage /></AdminRoute>} />
```

Update `ProtectedRoute` to redirect to `/` instead of `/login`:
```typescript
function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) {
    // In Telegram Mini App, user should be auto-authenticated
    // If not, show loading or error state instead of redirect
    return <LoadingSpinner label="Authenticating..." />
  }
  return <>{children}</>
}
```

**Step 4: Add new routes for History and Waiting pages**

```typescript
import HistoryPage from './pages/HistoryPage'
import WaitingPage from './pages/WaitingPage'

// In router:
<Route path="/history" element={<ProtectedRoute><HistoryPage /></ProtectedRoute>} />
<Route path="/exam/:examId/waiting" element={<ProtectedRoute><WaitingPage /></ProtectedRoute>} />
```

Note: We'll create these pages in Phase 5. For now, create placeholder files:

Create `frontend/src/pages/HistoryPage.tsx`:
```typescript
export default function HistoryPage() {
  return <div>History — coming soon</div>
}
```

Create `frontend/src/pages/WaitingPage.tsx`:
```typescript
export default function WaitingPage() {
  return <div>Waiting for results — coming soon</div>
}
```

**Step 5: Add admin edit route**

```typescript
import EditExamPage from './pages/admin/EditExamPage'

// In router:
<Route path="/admin/exams/:examId/edit" element={<AdminRoute><EditExamPage /></AdminRoute>} />
```

Create placeholder `frontend/src/pages/admin/EditExamPage.tsx`:
```typescript
export default function EditExamPage() {
  return <div>Edit exam — coming soon</div>
}
```

**Step 6: Commit**
```bash
git add -A
git commit -m "refactor: remove LoginPage and InviteCodesPage, add new route placeholders"
```

---

### Task 4: Update API Client — Remove Invite Code Redirect

**Files:**
- Modify: `frontend/src/api/client.ts`

**Step 1: Update 401 handling**

In the response interceptor (lines 77-85), instead of redirecting to `/login`, just clear tokens:
```typescript
// On refresh failure:
localStorage.removeItem('access_token')
localStorage.removeItem('refresh_token')
localStorage.removeItem('student_id')
localStorage.removeItem('full_name')
// Don't redirect — TelegramGate will handle re-authentication
```

**Step 2: Update base URL**

Ensure the production URL uses `scheduled_start`/`scheduled_end` field names.

**Step 3: Commit**
```bash
git add frontend/src/api/client.ts
git commit -m "refactor: update API client for Telegram-only auth flow"
```

---

### Task 5: Update Existing Pages — Replace Field Names

**Files:**
- Modify: `frontend/src/pages/ExamPage.tsx` (open_at → scheduled_start)
- Modify: `frontend/src/pages/ResultsPage.tsx` (add rasch_scaled, letter_grade)
- Modify: `frontend/src/pages/LobbyPage.tsx` (open_at → scheduled_start)
- Modify: `frontend/src/pages/DashboardPage.tsx` (use new dashboard API)
- Modify: `frontend/src/pages/LeaderboardPage.tsx`

**Step 1: Search for old field names**

Run: `grep -rn "open_at\|close_at\|is_scheduled\|invite" frontend/src/ --include="*.tsx" --include="*.ts"`

Replace all occurrences:
- `open_at` → `scheduled_start`
- `close_at` → `scheduled_end`
- Remove any invite code references

**Step 2: Commit after each file**
```bash
git commit -m "refactor: update frontend field names to match new API"
```

---

### Task 6: Update Admin Pages — Remove Invite Code References

**Files:**
- Modify: `frontend/src/pages/admin/AdminDashboard.tsx` (remove invite code links)
- Modify: `frontend/src/pages/admin/CreateExamPage.tsx` (use scheduled_start/scheduled_end)

**Step 1: Remove invite code navigation from AdminDashboard**

Remove any links/buttons pointing to `/admin/exams/:id/codes`.

**Step 2: Update CreateExamPage**

Replace `open_at`/`close_at` form fields with `scheduled_start`/`scheduled_end`.

**Step 3: Commit**
```bash
git commit -m "refactor: clean admin pages - remove invite codes, update field names"
```

---

## Phase 4 Summary

| Task | What Changes | Files |
|------|-------------|-------|
| 1 | Update all TypeScript types | types.ts |
| 2 | Simplify AuthContext (Telegram-only) | AuthContext.tsx |
| 3 | Remove LoginPage, InviteCodesPage, add new routes | App.tsx, pages/ |
| 4 | Update API client (no redirect to /login) | client.ts |
| 5 | Replace open_at/close_at everywhere | ExamPage, ResultsPage, LobbyPage, etc. |
| 6 | Clean admin pages | AdminDashboard, CreateExamPage |
