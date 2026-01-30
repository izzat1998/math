# Math Mock Exam Platform — MVP Specification

## Overview

A web platform and Telegram Mini App for administering timed math mock exams with auto-grading. Admins upload PDF exam papers, enter correct answers, and control exam availability. Students view the PDF, answer questions within a time limit, and receive instant results.

**Tech Stack:** Django + Django REST Framework (backend), React (frontend), PostgreSQL (database)

---

## User Roles

### Admin
- Creates mock exams by uploading a PDF and entering correct answers
- Sets exam open/close time window
- Generates invite codes for web-based student access
- Views student results (list of students + scores)

### Student
- Accesses exams via Telegram Mini App (auto-identified) or web (invite code)
- Views PDF and answers questions within a 2:30 hour time limit
- Receives results after submission (total score + per-question breakdown)

---

## Exam Structure

Each mock exam contains **45 exercises**:

| Questions | Type | Answer Format |
|-----------|------|---------------|
| 1–35 | Multiple choice | A, B, C, or D |
| 36–45 | Free text, two sub-parts | a) answer, b) answer |

### Scoring

- Questions 1–35: 1 point each = **35 points**
- Questions 36–45: 1 point per sub-part (a + b) = **20 points**
- **Total: 55 points possible**

Results display both:
- Exercise count: e.g., "32/45 exercises correct"
- Point count: e.g., "42/55 points"

An exercise (36–45) counts as correct only if both sub-parts are correct.

### Grading
- Multiple choice (1–35): exact match against stored correct answer
- Free text (36–45 a/b): exact match against stored correct answer

---

## Data Models

### MockExam
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| title | string | Exam name (e.g., "Mock 1") |
| pdf_file | file | Uploaded PDF of questions |
| open_at | datetime | When the exam becomes available |
| close_at | datetime | When the exam stops accepting new sessions |
| duration | int | Time limit in minutes (default: 150) |
| created_by | FK(Admin) | Admin who created the exam |
| created_at | datetime | Auto-set |

### CorrectAnswer
| Field | Type | Description |
|-------|------|-------------|
| id | int | Primary key |
| exam | FK(MockExam) | Parent exam |
| question_number | int | 1–45 |
| sub_part | string/null | null for 1–35, "a" or "b" for 36–45 |
| correct_answer | string | "A"/"B"/"C"/"D" for MCQ, free text for 36–45 |

Unique constraint: (exam, question_number, sub_part)

### Student
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| full_name | string | Student's name |
| telegram_id | bigint/null | Unique, nullable. Set for Telegram users |
| created_at | datetime | Auto-set |

### InviteCode
| Field | Type | Description |
|-------|------|-------------|
| id | int | Primary key |
| exam | FK(MockExam) | Associated exam |
| code | string | Unique invite code |
| is_used | bool | Whether the code has been used |
| used_by | FK(Student)/null | Student who used the code |

### ExamSession
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| student | FK(Student) | Student taking the exam |
| exam | FK(MockExam) | The exam being taken |
| started_at | datetime | When the student started |
| submitted_at | datetime/null | When submitted (null if in progress) |
| is_auto_submitted | bool | True if timer expired |
| status | enum | "in_progress" or "submitted" |

Unique constraint: (student, exam) — enforces one attempt per student per exam.

### StudentAnswer
| Field | Type | Description |
|-------|------|-------------|
| id | int | Primary key |
| session | FK(ExamSession) | Parent session |
| question_number | int | 1–45 |
| sub_part | string/null | null for 1–35, "a" or "b" for 36–45 |
| answer | string | Student's answer |
| is_correct | bool | Set on submission by comparing to CorrectAnswer |

Unique constraint: (session, question_number, sub_part)

---

## API Endpoints

### Admin Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/exams/` | Create exam (upload PDF, set open/close times) |
| POST | `/api/admin/exams/{id}/answers/` | Bulk submit correct answers for an exam |
| POST | `/api/admin/exams/{id}/invite-codes/` | Generate a batch of invite codes |
| GET | `/api/admin/exams/{id}/results/` | List students with their scores |

### Auth Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/telegram/` | Authenticate via Telegram initData, returns token |
| POST | `/api/auth/invite-code/` | Validate invite code + student name, returns token |

### Student Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/exams/{id}/` | Get exam details (title, duration, open/close times) |
| GET | `/api/exams/{id}/pdf/` | Serve the PDF file |
| POST | `/api/exams/{id}/start/` | Start exam session, returns session ID + start time |
| POST | `/api/sessions/{id}/answers/` | Save/update a single answer (auto-save as student progresses) |
| POST | `/api/sessions/{id}/submit/` | Manual submit |
| GET | `/api/sessions/{id}/results/` | Get score + per-question breakdown (only after submission) |

---

## Timer & Auto-Submit Logic

- Server records `started_at` when student starts the exam
- Frontend displays a countdown timer (2:30:00 → 0:00:00)
- On each answer save, backend checks if elapsed time >= duration. If so, auto-submit.
- A periodic background task (Celery or Django management command via cron) checks for expired sessions and auto-submits them as a safety net.
- Once submitted (manually or auto), no further answer changes are accepted.

---

## Frontend Layout

### Exam Page — Desktop

```
+--------------------------------------------------+
|  Exam Title          Timer: 01:45:23    Student   |
+----------------------------------+---------------+
|                                  |  1. (A)(B)(C)(D)  |
|                                  |  2. (A)(B)(C)(D)  |
|         PDF Viewer               |  ...              |
|      (zoom, scroll,             |  35. (A)(B)(C)(D) |
|       page navigation)          |  36. a) [____]    |
|                                  |      b) [____]    |
|         ~70% width              |  ...              |
|                                  |  45. a) [____]    |
|                                  |      b) [____]    |
|                                  |                   |
|                                  |  [Submit Exam]    |
+----------------------------------+---------------+
           ~70%                        ~30%
```

- PDF viewer: full embedded reader with zoom, scroll, page navigation
- Answer sidebar: scrollable list with visual indicators for answered questions
- Top bar: exam title, countdown timer, student name

### Exam Page — Mobile / Telegram Mini App

- PDF viewer takes full screen
- Floating button (bottom-right) toggles answer panel as a slide-up bottom sheet
- Timer stays fixed at the top
- Works on both mobile phones and Telegram Desktop

### Results Page

```
+--------------------------------------------------+
|  Results: Mock 1                                  |
|                                                   |
|  32/45 exercises    42/55 points                  |
|                                                   |
|  1.  [check]       26. [check]                    |
|  2.  [x]           27. [check]                    |
|  3.  [check]       ...                            |
|  ...               36. a) [check] b) [x]  [x]    |
|                    37. a) [x]     b) [check] [x]  |
|                    ...                            |
+--------------------------------------------------+
```

- Total score displayed prominently (both exercise count and points)
- Per-question/sub-part correct or incorrect indicators
- Correct answers are NOT revealed — only right/wrong status
- Exercise 36–45 marked correct only if both a) and b) are correct

### Admin Pages

Minimal admin interface (Django admin or simple React views):
- Create exam form (upload PDF, set title, open/close datetime)
- Correct answer entry form (table of 45 questions with inputs)
- Invite code generator (specify count, generates batch)
- Results table (student name, exercise score, point score)

---

## Telegram Mini App Integration

### Setup
- Register a Telegram Bot via BotFather
- Configure Mini App URL pointing to the React frontend

### Authentication Flow
1. Student opens Mini App — Telegram passes `initData` automatically
2. Frontend sends `initData` to `POST /api/auth/telegram/`
3. Backend validates `initData` signature using bot token (per Telegram docs)
4. Auto-creates student record if new (using Telegram name + telegram_id)
5. Returns JWT token for subsequent API calls

### Exam Access
- Student opens bot, sees currently open exams
- Taps an exam to launch Mini App with that exam loaded
- No invite code needed — identity verified by Telegram
- Same UI as web, responsive for both mobile and desktop Telegram clients

---

## Authentication Summary

| Access Method | Auth Mechanism | Invite Code Required |
|---------------|---------------|---------------------|
| Telegram Mini App | Telegram initData (auto) | No |
| Web | Invite code + student name | Yes |

---

## Key Constraints

- **One attempt per student per exam** — enforced at database level
- **2:30 hour time limit** — configurable per exam, default 150 minutes
- **Admin controls availability** — exam only accessible between open_at and close_at
- **Auto-submit on timeout** — no grace period
- **Auto-save answers** — student answers are saved as they go, not lost on connection issues
- **No correct answers revealed** — students only see right/wrong status

---

## Out of Scope (MVP)

- Analytics per question
- CSV/Excel export of results
- Multiple retakes
- Question-level difficulty tracking
- Rich text / image-based answer inputs
- Payment / subscription system
