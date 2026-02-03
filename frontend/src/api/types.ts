export interface Exam {
  id: string
  title: string
  pdf_file: string
  open_at: string
  close_at: string
  duration: number
  created_at: string
  is_open?: boolean
}

export interface SessionStart {
  session_id: string
  started_at: string
  duration: number
}

export interface AnswerBreakdown {
  question_number: number
  sub_part: string | null
  is_correct: boolean
  student_answer: string
  correct_answer: string | null
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
  is_auto_submitted: boolean
  exam_closed: boolean
  exam_title: string
  breakdown: AnswerBreakdown[]
  elo: EloChange | null
}

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
  my_entry: LeaderboardEntry | null
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

export interface AuthResponse {
  access: string
  refresh: string
  student_id: string
  full_name: string
  exam_id?: string
}

export interface Question {
  id: string
  text: string
  image: string | null
  topic: string
  difficulty: number
  answer_type: 'multiple_choice' | 'free_response'
  choices: string[] | null
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
  mode: 'light' | 'medium'
  score: number
  total: number
  duration: number
  started_at: string
  submitted_at: string | null
  breakdown: PracticeBreakdown[]
}

export interface UpcomingExam {
  exam: {
    id: string
    title: string
    scheduled_start: string
    scheduled_end: string
    has_started: boolean
  } | null
}

export interface LobbyInfo {
  id: string
  title: string
  scheduled_start: string
  scheduled_end: string
  has_started: boolean
  has_ended: boolean
}
