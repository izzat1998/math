# Phase 5: Frontend New Features

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement new UI features — dashboard redesign, exam history page, waiting page, progress indicator, 30-second timer warning, achievement toasts, connection lost banner, and admin analytics/item analysis pages.

**Architecture:** Component-based React development. New pages consume the Phase 3 API endpoints. Reuse existing component patterns (EloBadge style for Rasch badge, Timer component for warning, Toast context for achievements).

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, React Router 7

**Prerequisites:** Phase 3-4 complete (backend APIs ready, types updated).

---

### Task 1: Dashboard Redesign

**Files:**
- Modify: `frontend/src/pages/DashboardPage.tsx` (319 lines — major rewrite)

**Step 1: Implement new dashboard layout**

The dashboard should prominently display:
1. Rasch ability score (0-100) — large, centered
2. ELO rating — badge style
3. Current streak with fire icon
4. Upcoming exam card with countdown
5. Recent achievements (last 3)
6. Quick links: Practice, Leaderboard, History

```typescript
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import type { DashboardData } from '../api/types'
import { useAuth } from '../context/AuthContext'
import LoadingSpinner from '../components/LoadingSpinner'
import EloBadge from '../components/EloBadge'

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const { fullName } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    api.get<DashboardData>('/me/dashboard/')
      .then(res => setData(res.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingSpinner label="Loading dashboard..." />

  if (!data) return <EmptyState />

  return (
    <div className="min-h-screen bg-slate-50 p-4 pb-20">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">
          Welcome, {fullName}
        </h1>
      </div>

      {/* Rasch Score — Hero */}
      <div className="bg-white rounded-2xl p-6 mb-4 text-center shadow-sm">
        <div className="text-5xl font-bold text-primary-600">
          {data.rasch_scaled.toFixed(0)}
        </div>
        <div className="text-sm text-slate-500 mt-1">Rasch Ability Score</div>
        <div className="text-xs text-slate-400">out of 100</div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-white rounded-xl p-3 text-center shadow-sm">
          <EloBadge elo={data.elo} />
          <div className="text-xs text-slate-500 mt-1">ELO</div>
        </div>
        <div className="bg-white rounded-xl p-3 text-center shadow-sm">
          <div className="text-2xl font-bold text-orange-500">
            🔥 {data.current_streak}
          </div>
          <div className="text-xs text-slate-500 mt-1">Streak</div>
        </div>
        <div className="bg-white rounded-xl p-3 text-center shadow-sm">
          <div className="text-2xl font-bold text-slate-700">
            {data.exams_taken}
          </div>
          <div className="text-xs text-slate-500 mt-1">Exams</div>
        </div>
      </div>

      {/* Upcoming Exam */}
      {data.upcoming_exam && !data.upcoming_exam.already_taken && (
        <UpcomingExamCard exam={data.upcoming_exam} />
      )}

      {/* Recent Achievements */}
      {data.achievements.length > 0 && (
        <div className="bg-white rounded-xl p-4 mb-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">
            Recent Achievements
          </h3>
          {data.achievements.slice(0, 3).map((a, i) => (
            <div key={i} className="flex items-center gap-2 py-1">
              <span className="text-lg">{getAchievementEmoji(a.icon)}</span>
              <span className="text-sm text-slate-600">{a.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Quick Links */}
      <div className="grid grid-cols-3 gap-3">
        <button onClick={() => navigate('/leaderboard')}
          className="bg-white rounded-xl p-4 text-center shadow-sm">
          <span className="text-2xl">🏆</span>
          <div className="text-xs text-slate-600 mt-1">Leaderboard</div>
        </button>
        <button onClick={() => navigate('/history')}
          className="bg-white rounded-xl p-4 text-center shadow-sm">
          <span className="text-2xl">📋</span>
          <div className="text-xs text-slate-600 mt-1">History</div>
        </button>
        <button onClick={() => {/* practice mode selection */}}
          className="bg-white rounded-xl p-4 text-center shadow-sm">
          <span className="text-2xl">📝</span>
          <div className="text-xs text-slate-600 mt-1">Practice</div>
        </button>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="text-center">
        <div className="text-4xl mb-4">👋</div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">Welcome!</h2>
        <p className="text-slate-500 mb-6">
          No upcoming exams right now. Try practice mode while you wait!
        </p>
        {/* Practice mode buttons */}
      </div>
    </div>
  )
}

function UpcomingExamCard({ exam }: { exam: DashboardData['upcoming_exam'] }) {
  // ... countdown to exam.scheduled_start
}

function getAchievementEmoji(icon: string): string {
  const map: Record<string, string> = {
    'trophy': '🏆', 'fire': '🔥', 'star': '⭐', 'medal': '🥇',
    'crown': '👑', 'gem': '💎', 'diamond': '💠', 'rocket': '🚀',
    'seedling': '🌱', 'award': '🎖️', 'trending-up': '📈',
  }
  return map[icon] || '🏅'
}
```

**Step 2: Commit**
```bash
git commit -m "feat: redesign dashboard with Rasch score, streak, badges, upcoming exam"
```

---

### Task 2: Exam History Page

**Files:**
- Modify: `frontend/src/pages/HistoryPage.tsx` (replace placeholder)

**Step 1: Implement history page**

```typescript
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import type { ExamHistoryEntry } from '../api/types'
import LoadingSpinner from '../components/LoadingSpinner'
import BackButton from '../components/BackButton'

export default function HistoryPage() {
  const [history, setHistory] = useState<ExamHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    api.get<ExamHistoryEntry[]>('/me/history/')
      .then(res => setHistory(res.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingSpinner label="Loading history..." />

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="flex items-center gap-3 mb-6">
        <BackButton onClick={() => navigate('/')} />
        <h1 className="text-xl font-bold text-slate-900">Exam History</h1>
      </div>

      {history.length === 0 ? (
        <div className="text-center text-slate-500 py-12">
          No exams taken yet.
        </div>
      ) : (
        <div className="space-y-3">
          {history.map(entry => (
            <button
              key={entry.session_id}
              onClick={() => navigate(`/results/${entry.session_id}`)}
              className="w-full bg-white rounded-xl p-4 shadow-sm text-left"
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-semibold text-slate-800">
                    {entry.exam_title}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {entry.submitted_at
                      ? new Date(entry.submitted_at).toLocaleDateString()
                      : 'In progress'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-primary-600">
                    {entry.exercises_correct}/{entry.exercises_total}
                  </div>
                  {entry.rasch_scaled !== null && (
                    <div className="text-xs text-slate-500">
                      Rasch: {entry.rasch_scaled.toFixed(0)}
                    </div>
                  )}
                  {entry.elo_delta !== null && (
                    <div className={`text-xs ${
                      entry.elo_delta >= 0 ? 'text-green-600' : 'text-red-500'
                    }`}>
                      ELO: {entry.elo_delta >= 0 ? '+' : ''}{entry.elo_delta}
                    </div>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

**Step 2: Commit**
```bash
git commit -m "feat: implement exam history page"
```

---

### Task 3: Waiting for Results Page

**Files:**
- Modify: `frontend/src/pages/WaitingPage.tsx` (replace placeholder)

**Step 1: Implement waiting page**

```typescript
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api/client'
import type { Exam } from '../api/types'
import { formatCountdown } from '../utils/formatTime'

export default function WaitingPage() {
  const { examId } = useParams<{ examId: string }>()
  const [exam, setExam] = useState<Exam | null>(null)
  const [remaining, setRemaining] = useState(0)
  const navigate = useNavigate()

  useEffect(() => {
    api.get<Exam>(`/exams/${examId}/`).then(res => setExam(res.data))
  }, [examId])

  useEffect(() => {
    if (!exam) return
    const interval = setInterval(() => {
      const end = new Date(exam.scheduled_end).getTime()
      const now = Date.now()
      const diff = end - now
      if (diff <= 0) {
        clearInterval(interval)
        // Results should be available now — check for session
        navigate('/')
      }
      setRemaining(diff)
    }, 1000)
    return () => clearInterval(interval)
  }, [exam, navigate])

  if (!exam) return null

  const countdown = formatCountdown(remaining)

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <div className="text-5xl mb-4">⏳</div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">
          Exam Submitted!
        </h2>
        <p className="text-slate-500 mb-6">
          Results will be available when the exam window closes for all participants.
        </p>
        <div className="bg-white rounded-2xl p-6 shadow-sm mb-6">
          <div className="text-sm text-slate-500 mb-2">Results available in</div>
          <div className="text-3xl font-mono font-bold text-primary-600">
            {countdown.h}:{countdown.m}:{countdown.s}
          </div>
        </div>
        <button
          onClick={() => navigate('/')}
          className="text-primary-600 text-sm font-medium"
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  )
}
```

**Step 2: Update submit flow in ExamPage**

After successful submit, redirect to waiting page instead of results:
```typescript
// In ExamPage.tsx, after submit:
navigate(`/exam/${examId}/waiting`)
```

**Step 3: Commit**
```bash
git commit -m "feat: implement waiting-for-results page with countdown"
```

---

### Task 4: Progress Indicator in Exam UI

**Files:**
- Modify: `frontend/src/pages/ExamPage.tsx`
- Modify: `frontend/src/components/AnswerBar.tsx` (or create new ProgressBar component)

**Step 1: Create progress indicator**

Add a progress bar/indicator showing answered/skipped/unanswered:

```typescript
function ProgressIndicator({ answers }: { answers: Record<string, string> }) {
  const totalQuestions = 45
  const totalFields = 55 // 35 MCQ + 20 sub-parts (10 × 2)

  // Count answered fields
  let answered = 0
  for (let q = 1; q <= 35; q++) {
    if (answers[`${q}`]) answered++
  }
  for (let q = 36; q <= 45; q++) {
    if (answers[`${q}_a`]) answered++
    if (answers[`${q}_b`]) answered++
  }

  const percentage = Math.round((answered / totalFields) * 100)

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-lg px-3 py-2">
      <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
        <span>{answered}/{totalFields} answered</span>
        <span>{percentage}%</span>
      </div>
      <div className="w-full bg-slate-200 rounded-full h-1.5">
        <div
          className="bg-primary-500 h-1.5 rounded-full transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}
```

**Step 2: Integrate into ExamPage header**

Add `<ProgressIndicator answers={answers} />` to the exam header bar.

**Step 3: Commit**
```bash
git commit -m "feat: add progress indicator to exam UI"
```

---

### Task 5: 30-Second Timer Warning

**Files:**
- Modify: `frontend/src/components/Timer.tsx` (94 lines)

**Step 1: Update Timer component**

Add 30-second warning visual state:
```typescript
export default function Timer({ remaining, onExpire }: TimerProps) {
  const isWarning = remaining <= 30000 && remaining > 0 // Last 30 seconds
  const isUrgent = remaining <= 300000 && remaining > 30000 // Last 5 minutes

  return (
    <div className={`
      font-mono text-lg font-bold transition-all duration-300
      ${isWarning
        ? 'text-red-600 animate-pulse scale-110'
        : isUrgent
          ? 'text-orange-500'
          : 'text-slate-700'
      }
    `}>
      {formatCountdownString(remaining)}
    </div>
  )
}
```

The `animate-pulse` Tailwind class makes the timer flash red in the last 30 seconds — visual only, no sound.

**Step 2: Commit**
```bash
git commit -m "feat: add 30-second visual warning to exam timer"
```

---

### Task 6: Connection Lost Banner

**Files:**
- Create: `frontend/src/components/ConnectionBanner.tsx`
- Modify: `frontend/src/pages/ExamPage.tsx`

**Step 1: Create ConnectionBanner component**

```typescript
import { useState, useEffect } from 'react'

export default function ConnectionBanner() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (isOnline) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-red-500 text-white text-center py-2 text-sm font-medium">
      Connection lost — your timer is still running. Answers will save when reconnected.
    </div>
  )
}
```

**Step 2: Add to ExamPage**

In `ExamPage.tsx`, add `<ConnectionBanner />` at the top of the component.

**Step 3: Commit**
```bash
git commit -m "feat: add connection lost banner for exam page"
```

---

### Task 7: Update Results Page — Rasch Score + Letter Grade

**Files:**
- Modify: `frontend/src/pages/ResultsPage.tsx`

**Step 1: Update results display**

Add Rasch scaled score and letter grade to the results page:
```typescript
// In the score display section, add:
{results.rasch_scaled !== null && (
  <div className="bg-white rounded-xl p-4 text-center shadow-sm">
    <div className="text-3xl font-bold text-primary-600">
      {results.rasch_scaled.toFixed(0)}
    </div>
    <div className="text-sm text-slate-500">Rasch Score</div>
  </div>
)}

{results.letter_grade && (
  <div className="bg-white rounded-xl p-4 text-center shadow-sm">
    <div className={`text-3xl font-bold ${getGradeColor(results.letter_grade)}`}>
      {results.letter_grade}
    </div>
    <div className="text-sm text-slate-500">Grade</div>
  </div>
)}
```

Helper:
```typescript
function getGradeColor(grade: string): string {
  if (grade.startsWith('A')) return 'text-green-600'
  if (grade.startsWith('B')) return 'text-blue-600'
  if (grade.startsWith('C')) return 'text-orange-500'
  return 'text-red-500'
}
```

**Step 2: Commit**
```bash
git commit -m "feat: display Rasch score and letter grade on results page"
```

---

### Task 8: Admin — Edit Exam Page

**Files:**
- Modify: `frontend/src/pages/admin/EditExamPage.tsx` (replace placeholder)

**Step 1: Implement edit page**

Similar to CreateExamPage but pre-populated with existing exam data:
```typescript
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import adminApi from './adminApi'
import AdminLayout from '../../components/AdminLayout'

export default function EditExamPage() {
  const { examId } = useParams<{ examId: string }>()
  const [title, setTitle] = useState('')
  const [scheduledStart, setScheduledStart] = useState('')
  const [scheduledEnd, setScheduledEnd] = useState('')
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    adminApi.get(`/admin/exams/${examId}/`)
      .then(res => {
        setTitle(res.data.title)
        setScheduledStart(res.data.scheduled_start?.slice(0, 16) || '')
        setScheduledEnd(res.data.scheduled_end?.slice(0, 16) || '')
      })
      .finally(() => setLoading(false))
  }, [examId])

  const handleSave = async () => {
    await adminApi.put(`/admin/exams/${examId}/`, {
      title,
      scheduled_start: scheduledStart,
      scheduled_end: scheduledEnd,
    })
    navigate('/admin/dashboard')
  }

  const handleDelete = async () => {
    if (!confirm('Delete this exam? This cannot be undone.')) return
    try {
      await adminApi.delete(`/admin/exams/${examId}/`)
      navigate('/admin/dashboard')
    } catch (err: any) {
      alert(err.response?.data?.error || 'Cannot delete exam')
    }
  }

  if (loading) return <AdminLayout title="Edit Exam"><div>Loading...</div></AdminLayout>

  return (
    <AdminLayout title="Edit Exam">
      {/* Form fields for title, scheduled_start, scheduled_end */}
      {/* Save and Delete buttons */}
    </AdminLayout>
  )
}
```

**Step 2: Commit**
```bash
git commit -m "feat: implement admin edit exam page with delete"
```

---

### Task 9: Admin — Item Analysis Page

**Files:**
- Create: `frontend/src/pages/admin/ItemAnalysisPage.tsx`
- Modify: `frontend/src/App.tsx` (add route)

**Step 1: Implement item analysis page**

Displays Rasch difficulty, fit stats, and flags per question:
```typescript
// Table showing:
// Question | Difficulty (β) | Infit | Outfit | % Correct | Flag
// Color-code flagged items (infit/outfit outside 0.7-1.3)
```

**Step 2: Add route**
```typescript
<Route path="/admin/exams/:examId/analysis" element={<AdminRoute><ItemAnalysisPage /></AdminRoute>} />
```

**Step 3: Commit**
```bash
git commit -m "feat: implement admin item analysis page"
```

---

### Task 10: Admin — Analytics Dashboard

**Files:**
- Create: `frontend/src/pages/admin/AnalyticsPage.tsx`
- Modify: `frontend/src/App.tsx` (add route)

**Step 1: Implement analytics page**

Three sections:
1. **Score Distributions** — bar chart / histogram of scores for latest exam
2. **User Growth** — line chart of registrations per month
3. **Overview Stats** — total students, active, exams, sessions

Note: Charts can be built with simple SVG (like the existing EloChart component) or we can add a lightweight chart library later.

**Step 2: Add route**
```typescript
<Route path="/admin/analytics" element={<AdminRoute><AnalyticsPage /></AdminRoute>} />
```

**Step 3: Commit**
```bash
git commit -m "feat: implement admin analytics dashboard"
```

---

## Phase 5 Summary

| Task | What's Built | Page/Component |
|------|-------------|----------------|
| 1 | Dashboard redesign | DashboardPage.tsx |
| 2 | Exam history page | HistoryPage.tsx |
| 3 | Waiting for results page | WaitingPage.tsx |
| 4 | Progress indicator | ExamPage.tsx + ProgressIndicator |
| 5 | 30-second timer warning | Timer.tsx |
| 6 | Connection lost banner | ConnectionBanner.tsx |
| 7 | Rasch + letter grade on results | ResultsPage.tsx |
| 8 | Admin edit exam page | EditExamPage.tsx |
| 9 | Admin item analysis page | ItemAnalysisPage.tsx |
| 10 | Admin analytics dashboard | AnalyticsPage.tsx |
