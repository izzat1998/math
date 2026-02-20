// Exam types
export interface Exam {
  id: string
  title: string
  pdf_file: string
  scheduled_start: string
  scheduled_end: string
  duration: number
  created_at: string
  is_open?: boolean
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
  message?: string
}

// Dashboard types
export interface DashboardData {
  elo: number
  rasch_scaled: number | null
  exams_taken: number
  current_streak: number
  longest_streak: number
  achievements: AchievementEarned[]
  upcoming_exam: UpcomingExamInfo | null
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
export interface UpcomingExamInfo {
  id: string
  title: string
  scheduled_start: string
  scheduled_end: string
  has_started: boolean
  already_taken?: boolean
}

export interface UpcomingExam {
  exam: UpcomingExamInfo | null
}

export interface LobbyInfo {
  id: string
  title: string
  scheduled_start: string
  scheduled_end: string
  has_started: boolean
  has_ended: boolean
}
