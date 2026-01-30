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

export interface ExamResults {
  exercises_correct: number
  exercises_total: number
  points: number
  points_total: number
  is_auto_submitted: boolean
  exam_closed: boolean
  exam_title: string
  breakdown: AnswerBreakdown[]
}

export interface AuthResponse {
  access: string
  refresh: string
  student_id: string
  full_name: string
  exam_id?: string
}
