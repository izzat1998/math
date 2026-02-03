# Platform Expansion: Dashboard, Practice Exams & Scheduled Lobby

**Date:** 2026-02-01
**Status:** Approved

## Overview

Expand the math mock exam platform from a single-exam experience into a dashboard-driven platform with three exam modes:

- **Light (30 min)** — 10 random questions, available anytime
- **Medium (60 min)** — 20 random questions, available anytime
- **Real (150 min)** — PDF-based, scheduled with lobby, everyone starts together

The existing PDF exam system remains untouched. New practice system runs alongside it with its own question bank and session model.

---

## 1. Student Dashboard

When a student logs in, they land on a dashboard with three cards:

| Card | Description | Action |
|------|-------------|--------|
| **Light** | 30-minute practice, 10 questions | **Start now** (always available) |
| **Medium** | 60-minute practice, 20 questions | **Start now** (always available) |
| **Real** | 150-minute mock exam | **Join lobby** (when scheduled) / "No exam scheduled" |

The Real card displays the next scheduled exam date and time (e.g. "Feb 5, 18:00").

---

## 2. Question Bank

A new `Question` model, separate from PDF-based exams:

| Field | Type | Purpose |
|-------|------|---------|
| `id` | UUID | Primary key |
| `text` | TextField | Question text (supports math notation) |
| `image` | ImageField (optional) | Diagram or figure |
| `topic` | CharField | Category — e.g. "algebra", "geometry", "probability" |
| `difficulty` | Integer (1-5) | For balanced assembly |
| `answer_type` | Choice | "multiple_choice" or "free_response" |
| `choices` | JSONField (optional) | For MC: list of choice labels |
| `correct_answer` | CharField | The correct answer |
| `explanation` | TextField (optional) | Shown after submission |
| `created_at` | DateTime | Auto-set |

**Admin entry:** Django admin form — create/edit individual questions. No bulk import needed initially.

**Assembly logic:** When starting Light or Medium, system picks questions randomly from the pool, balanced by topic and difficulty to produce a fair set.

---

## 3. Practice Exam Session

### Model: `PracticeSession`

| Field | Type | Purpose |
|-------|------|---------|
| `id` | UUID | Primary key |
| `student` | ForeignKey → Student | Who's taking it |
| `mode` | Choice ("light" / "medium") | Determines question count and duration |
| `questions` | M2M → Question | The assembled set (10 or 20) |
| `started_at` | DateTime | When timer started |
| `duration` | Integer | 30 or 60 minutes |
| `submitted_at` | DateTime (nullable) | When finished |
| `answers` | JSONField | `{question_id: student_answer}` |
| `score` | Integer (nullable) | Filled on submission |

### Student Flow

1. Click "Start now" on Light or Medium card
2. System assembles questions, creates session, returns question set
3. Questions shown one at a time with navigation between them
4. Timer counts down in the corner
5. Student types or selects answer for each question
6. Submit manually or auto-submit when timer hits zero
7. Results screen: score, per-question breakdown, correct answers, explanations

### Key Difference from Real Exams

No PDF viewer. Questions render directly as text/images in the UI. Reuses existing `Timer` component. `MathKeyboard` available for free-response answers.

---

## 4. Real Exam Lobby & Scheduling

### New Fields on `MockExam`

| Field | Purpose |
|-------|---------|
| `scheduled_start` | DateTime — when the exam begins |
| `scheduled_end` | DateTime — when it auto-submits |
| `is_scheduled` | Boolean — distinguishes scheduled Real exams |

### Lobby Flow

1. Student clicks "Join lobby" on the Real card
2. Waiting screen: exam title, start time, live countdown
3. No access to PDF or questions — just the countdown
4. Countdown hits zero → auto-transition to exam (`ExamPage` with PDF viewer)
5. Timer counts down to `scheduled_end`
6. At `scheduled_end` → auto-submit

### Edge Cases

- **Late arrival:** Student joins after start but before end → goes straight to exam with remaining time
- **No submission:** Server-side auto-submit at `scheduled_end`
- **No exam scheduled:** Real card shows "No upcoming exam", no button

---

## 5. API Endpoints

### Question Bank (Admin)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/questions/` | GET | List questions |
| `/api/questions/` | POST | Create question |
| `/api/questions/:id/` | PUT | Update question |
| `/api/questions/:id/` | DELETE | Delete question |

### Practice Sessions (Student)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/practice/start/` | POST | Start session (`{mode: "light"}`) — returns session + questions |
| `/api/practice/:id/` | GET | Session state: questions, answers so far, time remaining |
| `/api/practice/:id/answer/` | POST | Save answer (`{question_id, answer}`) |
| `/api/practice/:id/submit/` | POST | Submit session for scoring |
| `/api/practice/:id/results/` | GET | Scored results with explanations |

### Scheduling (Student)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/exams/upcoming/` | GET | Next scheduled Real exam info |
| `/api/exams/:id/lobby/` | GET | Lobby data: start time, countdown, exam status |

---

## 6. Frontend Routes

| Route | Page | Purpose |
|-------|------|---------|
| `/` | `DashboardPage` | Three cards — Light, Medium, Real |
| `/practice/:id` | `PracticeExamPage` | Question-by-question practice UI + timer |
| `/practice/:id/results` | `PracticeResultsPage` | Score + breakdown + explanations |
| `/exam/:id/lobby` | `LobbyPage` | Countdown waiting room |
| `/exam/:id` | `ExamPage` (existing) | PDF-based Real exam — unchanged |
| `/exam/:id/results` | `ResultsPage` (existing) | Real exam results — unchanged |

---

## 7. What Changes, What Stays

### Untouched

- `PdfViewer`, `ExamPage`, `ResultsPage`
- `AnswerBar`, `AnswerSidebar`
- `Timer`, `MathKeyboard`
- All existing backend models (`MockExam`, `ExamSession`, `Student`)
- Scoring, ELO, Rasch logic
- JWT auth flow

### Small Modifications

- `LoginPage` → redirect to Dashboard (`/`) instead of directly to exam
- `App.tsx` → add new routes
- `MockExam` model → add `scheduled_start`, `scheduled_end`, `is_scheduled`
- Django admin → register `Question` model, expose scheduling fields

### New Code

| Component | Description |
|-----------|-------------|
| `DashboardPage` | Three cards, upcoming exam info |
| `LobbyPage` | Countdown waiting room, auto-transition |
| `PracticeExamPage` | Question-by-question UI, timer, navigation |
| `PracticeResultsPage` | Score, breakdown, explanations |
| `Question` model | DB model + admin registration |
| `PracticeSession` model | DB model for practice attempts |
| `practice_views.py` | Practice session API endpoints |
| `question_views.py` | Question bank CRUD endpoints |
| Question assembly logic | Random selection balanced by topic/difficulty |
