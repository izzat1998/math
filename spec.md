# Math Mock Exam Platform — Full Specification

## Implementation Status

> Last synced: 2026-02-21

| Feature | Status | Notes |
|---------|--------|-------|
| **Core Exam Flow** | | |
| PDF-based timed exams (45q/150min) | Done | Full lifecycle working |
| Answer auto-save (debounced) | Done | 500ms debounce on typing + save on blur |
| Timer with 30-second warning | Done | Red flash at critical threshold |
| Auto-submit on expiry | Done | Celery beat (60s) + frontend timer |
| Late-start reduced time | Done | effective_duration = min(exam, remaining window) + 30s grace |
| One attempt per student per exam | Done | DB unique constraint (student, exam) |
| Post-submission waiting page | Done | Countdown to exam window close |
| Results after window closes | Done | Correct answers + breakdown shown |
| Progress indicator | Done | Answered count shown (no skipped/unanswered distinction) |
| Connection loss banner | Needs verification | ConnectionBanner component exists, retry logic unverified |
| **Scoring** | | |
| Raw score (points + exercises) | Done | 55 points max, 45 exercises max |
| Rasch scaled score (0-100) | Done | Linear map theta [-4,4] to [0,100] |
| Letter grades (percentile-based) | Done | A+ through D, computed after window closes |
| ELO rating system | Done | K=40 first 5 exams, K=20 after, floor=100 |
| Rasch fallback (<10 participants) | Not built | Constant MIN_RASCH_PARTICIPANTS=10 exists but unused |
| **Leaderboard** | | |
| Top Rated tab | Done | Cached 5 minutes, shows top 50 + own rank |
| Most Improved tab | Partial | Backend helper function exists, not wired to API |
| Most Active tab | Partial | Backend helper function exists, not wired to API |
| Privacy (mask names 51+) | Not built | All names visible regardless of rank |
| **Gamification** | | |
| Exam streaks | Done | Consecutive exam participation tracking |
| Achievement system | Done | Streak, milestone, improvement badges |
| Achievement notifications | Done | Toast in Mini App on badge earn |
| **Practice Mode** | | |
| Light mode (6q/30min) | Done | Balanced topic selection |
| Medium mode (10q/60min) | Done | Balanced topic selection |
| **Dashboard & History** | | |
| Student dashboard | Done | ELO, Rasch, streaks, achievements, upcoming exam |
| Exam history | Done | Past exams with scores and ELO delta |
| ELO history chart | Done | Rating progression visualization |
| **Admin** | | |
| Exam CRUD | Done | Create, edit, delete with PDF upload |
| Schedule edit protection | Done | Locked once students have started |
| Answer key management | Done | Bulk upload correct answers |
| Results per exam | Done | Student scores table |
| Item analysis (Rasch) | Done | Difficulty, infit/outfit, flagging |
| Analytics dashboard | Partial | Score distribution + user growth done, retention trends missing |
| **Telegram Integration** | | |
| Mini App auth (initData HMAC) | Done | Auto-register + JWT |
| Bot DM notifications | Done | On exam creation |
| Channel post notifications | Done | On exam creation |
| Name sync from Telegram | Needs verification | Spec says auto-update on every open, unverified |
| Haptic feedback | Done | Via useTelegram hook |
| **Infrastructure** | | |
| PostgreSQL connection pooling | Done | django-db-connection-pool |
| Redis caching | Done | Leaderboard + auth object caching |
| Celery beat scheduler | Done | Auto-submit every 60s |
| PDF serving optimization | Done | Nginx X-Accel-Redirect in production |

## Overview

A **Telegram Mini App** for administering timed math mock exams with auto-grading, psychometric evaluation (Rasch IRT model), and competitive ranking (ELO). Designed for students preparing for university entrance exams and teachers pursuing certification.

**Core Value:** Dead-simple, PDF-based mock exams with serious psychometric evaluation that motivates users to keep participating.

**Tech Stack:** Django + Django REST Framework (backend), React + TypeScript (frontend/Telegram Mini App), PostgreSQL (database), Celery + Redis (background tasks)

---

## Users & Access

### User Types
- **Students** — preparing for university entrance exams
- **Teachers** — pursuing teaching certification
- No system-level distinction between these types — everyone is a "user" with the same experience

### Access Model
- **Users:** Telegram Mini App only — no web access for users
- **Admin:** Web-based admin panel (single admin manages everything)
- Users are auto-registered when they first open the Telegram Mini App
- Purely functional profiles — no editing, name comes from Telegram

### Authentication
| Access Method | Auth Mechanism | Details |
|---------------|---------------|---------|
| Telegram Mini App | Telegram initData (auto) | Auto-creates user on first open |
| Admin panel | Username + password | Django admin credentials |

- JWT-based tokens: 3-hour access, 7-day refresh with rotation
- Token blacklist for logout
- initData signature verified via HMAC-SHA256 using bot token

---

## Exam Structure

### Format (Fixed)
Every mock exam has the **same structure**:

| Questions | Type | Answer Format |
|-----------|------|---------------|
| 1–35 | Multiple choice | A, B, C, or D |
| 36–45 | Free text, two sub-parts | a) answer, b) answer |

- **45 exercises** total
- **150 minutes** (2 hours 30 minutes) time limit
- **One attempt per user per exam** — enforced at database level

### Scoring
Scoring is based on the **Rasch psychometric model**:

1. **Raw Score:** Displayed in two formats:
   - Exercise count: e.g. "38/45 exercises correct" (Q36–45 count as 1 exercise, correct only if both parts right)
   - Point count: e.g. "42/55 points" (Q1–35 = 1pt each, Q36–45 = 1pt per sub-part a/b)
2. **Rasch-Derived Scaled Score (0–100):** Computed from item difficulties and response patterns using the Rasch 1-PL model
   - Not a simple percentage — accounts for difficulty of questions answered correctly
   - A student who answers 30 hard questions correctly scores higher than one who answers 30 easy questions
   - Scale: 0 (lowest ability) to 100 (highest ability)

3. **Letter Grade:** Percentile-based grade derived from ranking among all participants
   - A+ (top 10%), A (top 20%), B+ (top 35%), B (top 50%), C+ (top 65%), C (top 80%), below = D
   - Shown on every exam alongside raw score and Rasch score

**All three scores (raw, Rasch scaled, letter grade) are displayed to users.**

### Grading Rules
- Questions 1–35: exact match (case-insensitive) against stored correct answer
- Questions 36–45 a/b: exact match (case-insensitive, normalized) against stored correct answer
- An exercise (36–45) counts as "correct" only if **both** sub-parts a) and b) are correct
- Answer normalization: case-insensitive, accent-insensitive, math symbol equivalence

---

## Exam Lifecycle

### 1. Admin Creates Exam
- Upload PDF file
- Set title
- Set scheduled start time and end time (open window)
- All exams are always scheduled — no "always available" option

### 2. Admin Enters Answers
- Input correct answers for all 45 questions (35 MCQ + 10×2 free-response)
- Can bulk upload or edit individual answers
- Admin can edit/delete exams at any time (full edit/delete capability)
- **Schedule lock:** Once any student has started an exam, the `scheduled_start`, `scheduled_end`, and `duration` fields cannot be edited

### 3. Notification Sent
- **Telegram bot DM** sent to all registered users when new exam is created
- **Telegram channel post** in the official channel
- Both mechanisms for maximum reach

### 4. Pre-Exam Lobby
- Users see upcoming exam with countdown to start time
- Lobby page shows exam title, start time, and live countdown
- Users can enter lobby and wait

### 5. Exam Opens (Scheduled Start)
- Users can start the exam within the open window
- Timer = min(150 minutes, time remaining until `scheduled_end`) — **late starters get less time**
- PDF viewer + answer input displayed
- **Only one exam can be open at a time** — no overlapping exam windows

### 6. Exam Taking
- PDF viewer with page navigation (current layout retained for mobile)
- Answer sidebar with MCQ buttons (1–35) and free text inputs (36–45)
- **Progress indicator:** essential visual display of answered/skipped/unanswered questions
- **Auto-save:** on blur (leaving field) AND debounced after typing stops
- Free navigation between questions (non-sequential)
- Once submitted, no further changes accepted

### 7. Timer & Auto-Submit
- Server records `started_at` when user starts
- Frontend displays countdown timer (2:30:00 → 0:00:00)
- **30-second warning:** timer turns red and flashes (visual only, no sound)
- Auto-submit when timer reaches 0:00
- Backend validates elapsed time on each answer save
- Celery beat task (every 60 seconds) auto-submits expired sessions as safety net

### 8. Exam Window Closes
- Rasch calibration runs after exam window closes
- Item difficulties recalculated for all questions
- Student ability scores (theta) estimated and converted to 0–100 scale
- ELO ratings updated for all participants

### 9. Post-Submission Waiting
- After submitting (manually or auto), user sees a **"Waiting for Results"** page
- Shows: "Results will be available when the exam closes" with countdown to `scheduled_end`
- User can navigate away — results accessible from dashboard/history once available

### 10. Results Available
- Results visible **only after the exam window closes** (not immediately after submission)
- Users see:
  - Raw score (e.g. "38/45 exercises correct")
  - Rasch-derived scaled score (0–100)
  - **Full details:** which questions were right/wrong AND the correct answers
  - ELO change (before → after)
- PDF is **hidden** after exam closes — no viewing or downloading

---

## Rasch IRT Model (Core Feature)

### Overview
The **Rasch 1-Parameter Logistic Model** is the psychometric backbone of the platform. It measures student ability and question difficulty on the same scale.

**Formula:** P(correct) = exp(θ - β) / (1 + exp(θ - β))
- θ = student ability (logits)
- β = item difficulty (logits)

### Student-Facing
- Rasch ability score is **prominently displayed** — it's the main metric students track
- Converted from logits to a **0–100 scaled score** for user-friendliness
- Shown on: results page, dashboard, exam history, personal profile area

### Admin-Facing
- **Item analysis dashboard** showing per-question:
  - Rasch difficulty (β)
  - Infit MNSQ (fit statistic)
  - Outfit MNSQ (fit statistic)
  - Flagging for poorly-fitting items (infit/outfit outside 0.7–1.3 range)
- Helps admin identify bad questions that should be revised or excluded

### Calibration
- Runs **after each exam window closes**
- Uses JMLE (Joint Maximum Likelihood Estimation) for item difficulty
- Uses Newton-Raphson MLE for student ability estimation
- Handles missing responses (students who skip questions)
- **Per-exam scoring** — each exam produces an independent Rasch score (not cumulative)
- **Cold-start:** First calibration assumes equal difficulty (β=0) for all items, then calibrates from participant responses
- **Minimum participants fallback:** If too few participants for reliable calibration, fall back to raw percentage — Rasch score shown when statistically meaningful

---

## ELO Rating System

### Purpose
ELO provides **gamification and competitive ranking** — separate from the Rasch psychometric score.

### Parameters
| Parameter | Value |
|-----------|-------|
| Initial rating | 1200 |
| K-factor (first 5 exams) | 40 |
| K-factor (after 5 exams) | 20 |
| Minimum floor | 100 |

### Calculation
- Opponent rating = exam average performance converted to ELO equivalent
- Delta = K × (score_percent - expected_win_probability)
- Updated idempotently after each exam submission

### ELO History
- Track rating changes across all exams
- Show before/after for each exam
- Trend visualization

---

## Leaderboard (Key Feature)

### Structure
- **Global only** — one leaderboard for all users
- Ranked by **ELO rating** (Rasch score shown separately)
- **Always show rank** — every user sees their position (e.g. "#127 out of 500")

### Privacy
- **Top 50 names visible** — users ranked 51+ see their own rank but other names below 50 are hidden
- No opt-out — competition is the motivator

### Tabs/Views
- **Top Rated** — highest ELO
- **Most Improved** — biggest ELO gain in recent period
- **Most Active** — most exams taken

---

## Gamification System

### Exam Streaks
- Track consecutive weekly exam participation
- Display current streak count
- Streak breaks if user misses a weekly exam
- Visual indicator (e.g. fire icon with count)

### Score Milestones
- Badges for reaching ability score thresholds on the 0–100 scale
- Example thresholds: 25, 50, 60, 70, 80, 90, 95
- Milestone names (e.g. "Novice", "Intermediate", "Advanced", "Expert", "Master")

### Improvement Badges
- Rewards for score improvement between exams
- E.g. "+10% improvement", "+20% improvement"
- First exam completed badge
- "5 exams completed", "10 exams completed" milestones

---

## Practice Mode (Secondary Feature)

### Overview
Practice mode is secondary to the main mock exams. Completely separate from ELO and Rasch scoring.

### Modes
| Mode | Questions | Duration |
|------|-----------|----------|
| Light | 6 questions | 30 minutes |
| Medium | 10 questions | 60 minutes |

### Question Source
- **Separate question bank** — independent from mock exam questions
- Questions tagged by topic: Algebra, Geometry, Probability, Calculus, Trigonometry, Number Theory
- Balanced topic selection per practice session

### Scoring
- Practice scores do **NOT** affect ELO or Rasch ratings
- Correct answers revealed after practice submission
- Topic breakdown shown in practice results (but not for mock exams)

---

## Dashboard & History

### Student Dashboard
- Current Rasch ability score (0–100) — prominently displayed
- Current ELO rating
- Current streak count
- Badges/achievements earned
- Upcoming exam (if scheduled) with countdown
- Next/current exam quick access
- **Exam history:** simple list of past exams with dates and scores

### Exam History
- List of all completed exams
- Each entry shows: exam title, date, raw score, Rasch scaled score, ELO change
- Tap to view full results (if exam window has closed)

---

## Admin Panel (Web Only)

### Exam Management
- Create exam: upload PDF, set title, set scheduled start/end times
- Edit exam: modify details at any time
- Delete exam: remove exam (with confirmation)
- Enter/edit correct answers: table of 45 questions with inputs

### Analytics Dashboard (Rich)
All sections equally important:

1. **Score Distributions** — histograms of score distributions per exam
2. **Item Analysis (Rasch)** — difficulty, fit stats (infit/outfit MNSQ), discrimination per question, flagging bad items
3. **User Growth** — total users, active users, retention trends

### Results
- Student results table per exam
- Export capabilities (future consideration)

---

## Telegram Integration

### Mini App
- Primary (only) interface for users
- Auto-login via Telegram initData
- Telegram theme colors supported
- Haptic feedback for interactions
- Back button integration

### Bot
- Sends DM notifications to all registered users when new exam is available
- Provides link to Mini App

### Channel
- Official channel for exam announcements
- Automatic post when new exam is created

---

## Data Models

### MockExam
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| title | string | Exam name (e.g., "Mock 1") |
| pdf_file | file | Uploaded PDF of questions |
| scheduled_start | datetime | When the exam opens |
| scheduled_end | datetime | When the exam closes |
| duration | int | Time limit in minutes (always 150) |
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
| full_name | string | From Telegram profile |
| telegram_id | bigint | Unique, required (Telegram-only access) |
| created_at | datetime | Auto-set |

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

Unique constraint: (student, exam) — one attempt per student per exam.

### StudentAnswer
| Field | Type | Description |
|-------|------|-------------|
| id | int | Primary key |
| session | FK(ExamSession) | Parent session |
| question_number | int | 1–45 |
| sub_part | string/null | null for 1–35, "a" or "b" for 36–45 |
| answer | string | Student's answer |
| is_correct | bool | Set on submission |

Unique constraint: (session, question_number, sub_part)

### StudentRating
| Field | Type | Description |
|-------|------|-------------|
| student | OneToOne(Student) | Linked student |
| elo | float | Current ELO rating (default 1200) |
| rasch_ability | float | Current Rasch theta (logits) |
| rasch_scaled | float | Rasch score on 0–100 scale |
| exams_taken | int | Number of exams completed |

### EloHistory
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| student | FK(Student) | Student |
| session | OneToOne(ExamSession) | Associated exam session |
| elo_before | float | ELO before this exam |
| elo_after | float | ELO after this exam |
| elo_delta | float | Change |
| rasch_before | float | Rasch scaled score before |
| rasch_after | float | Rasch scaled score after |
| score_percent | float | Raw score as percentage |

### ItemDifficulty
| Field | Type | Description |
|-------|------|-------------|
| exam | FK(MockExam) | Parent exam |
| question_number | int | 1–45 |
| sub_part | string/null | null for 1–35, "a" or "b" for 36–45 |
| beta | float | Rasch difficulty parameter |
| infit | float | Infit MNSQ |
| outfit | float | Outfit MNSQ |

Unique constraint: (exam, question_number, sub_part)

### Achievement
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| type | enum | "streak", "milestone", "improvement" |
| name | string | Badge name (e.g., "5-Exam Streak") |
| description | string | How to earn it |
| threshold | float | Numeric threshold for earning |
| icon | string | Icon identifier |

### StudentAchievement
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| student | FK(Student) | Student who earned it |
| achievement | FK(Achievement) | Achievement earned |
| earned_at | datetime | When earned |
| session | FK(ExamSession)/null | Associated exam session (if applicable) |

Unique constraint: (student, achievement)

### StudentStreak
| Field | Type | Description |
|-------|------|-------------|
| student | OneToOne(Student) | Linked student |
| current_streak | int | Current consecutive weeks |
| longest_streak | int | All-time longest streak |
| last_exam_week | date | ISO week of last exam taken |

### Question (Practice Bank)
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| text | string | Question text |
| image | file/null | Optional image |
| topic | enum | Algebra, Geometry, Probability, Calculus, Trigonometry, Number Theory |
| difficulty | int | 1–5 |
| answer_type | enum | MCQ or free text |
| choices | JSON/null | MCQ options |
| correct_answer | string | Correct answer |
| explanation | text/null | Optional explanation |

### PracticeSession
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| student | FK(Student) | Student |
| mode | enum | "light" or "medium" |
| questions | M2M(Question) | Selected questions |
| started_at | datetime | When started |
| duration | int | Time limit in minutes |
| answers | JSON | Student's answers |
| score | int/null | Set on submission |
| status | enum | "in_progress" or "submitted" |

---

## API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/telegram/` | Authenticate via Telegram initData |
| POST | `/api/auth/logout/` | Logout (blacklist token) |
| POST | `/api/token/refresh/` | Refresh JWT token |

### Student — Exams
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/exams/upcoming/` | Get next scheduled exam |
| GET | `/api/exams/{id}/` | Exam details (title, times, status) |
| GET | `/api/exams/{id}/pdf/` | Serve PDF (only during exam) |
| POST | `/api/exams/{id}/start/` | Start exam session |
| POST | `/api/exams/{id}/lobby/` | Enter pre-exam lobby |
| POST | `/api/sessions/{id}/answers/` | Save/update answer (auto-save) |
| POST | `/api/sessions/{id}/submit/` | Manual submit |
| GET | `/api/sessions/{id}/results/` | Get results (after window closes) |

### Student — Dashboard & History
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/me/dashboard/` | Dashboard data (scores, streak, badges) |
| GET | `/api/me/history/` | List of past exams with scores |
| GET | `/api/me/elo-history/` | ELO rating progression |
| GET | `/api/me/achievements/` | Earned achievements |

### Leaderboard
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/leaderboard/` | Global leaderboard (top 50 + own rank) |

### Practice
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/practice/start/` | Start practice session |
| GET | `/api/practice/{id}/` | Practice session details |
| POST | `/api/practice/{id}/answer/` | Save practice answer |
| POST | `/api/practice/{id}/submit/` | Submit practice |
| GET | `/api/practice/{id}/results/` | Practice results with breakdown |

### Admin (Web Only)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/exams/` | List all exams |
| POST | `/api/admin/exams/` | Create exam |
| PUT | `/api/admin/exams/{id}/` | Edit exam |
| DELETE | `/api/admin/exams/{id}/` | Delete exam |
| POST | `/api/admin/exams/{id}/answers/` | Bulk upload correct answers |
| PUT | `/api/admin/exams/{id}/answers/` | Edit answers |
| GET | `/api/admin/exams/{id}/results/` | Student results |
| GET | `/api/admin/exams/{id}/item-analysis/` | Rasch item analysis |
| GET | `/api/admin/analytics/` | Platform-wide analytics |
| POST | `/api/admin/notify/` | Trigger notifications |

---

## Frontend Pages

### User Pages (Telegram Mini App)
| Page | Route | Description |
|------|-------|-------------|
| Dashboard | `/` | Main hub: scores, streak, badges, upcoming exam |
| Exam | `/exam/:examId` | PDF viewer + answers + timer + progress indicator |
| Lobby | `/exam/:examId/lobby` | Pre-exam countdown |
| Waiting | `/exam/:examId/waiting` | Post-submission, countdown to results |
| Results | `/results/:sessionId` | Score + breakdown (after window closes) |
| History | `/history` | List of past exams with scores |
| Leaderboard | `/leaderboard` | Global rankings with tabs |
| Practice | `/practice/:id` | Practice mode interface |
| Practice Results | `/practice/:id/results` | Practice score breakdown by topic |

### Admin Pages (Web)
| Page | Route | Description |
|------|-------|-------------|
| Login | `/admin` | Username + password |
| Dashboard | `/admin/dashboard` | Exam list + quick analytics |
| Create Exam | `/admin/exams/create` | PDF upload + scheduling |
| Edit Exam | `/admin/exams/:id/edit` | Modify exam details |
| Answers | `/admin/exams/:id/answers` | Enter/edit correct answers |
| Results | `/admin/exams/:id/results` | Student scores table |
| Item Analysis | `/admin/exams/:id/analysis` | Rasch item stats + flagging |
| Analytics | `/admin/analytics` | Score distributions, user growth, retention |

---

## Performance Requirements

- **1000+ concurrent users** during peak (scheduled exam start)
- Current stack (Gunicorn + Celery + PostgreSQL + Redis) needs optimization for this scale
- Key bottlenecks to address:
  - Answer auto-save endpoint under high concurrency
  - PDF serving under load
  - Database connection pooling
  - Celery task queue sizing

---

## Notifications

### Telegram Bot DM
- Sent to all registered users when new exam is created
- Content: exam title, scheduled start time, Mini App link

### Telegram Channel Post
- Automatic post to official channel on exam creation
- Content: exam announcement with details and Mini App link

---

## Edge Cases & Error Handling

### Connectivity
- If user loses internet during exam: show **"Connection lost"** banner, keep timer running, retry auto-save when reconnected
- Answers already saved on server are safe — only unsaved changes at risk

### Exam Deletion
- **Cannot delete an exam that has been taken** by any student — admin must be warned
- Exams with zero sessions can be freely deleted

### Name Sync
- Student name **auto-updates** from Telegram on every Mini App open
- Ensures leaderboard always shows current Telegram names

### Streaks
- Streak = consecutive **exams** participated in (not calendar weeks)
- If no exam is published in a given week, streak is preserved
- Streak breaks only when a user **misses an exam that was published**

### Empty States
- **New user, no exams:** Welcome message + encourage to try practice mode while waiting
- **No upcoming exam:** "No upcoming exams. Check back soon!" with practice mode link
- **First exam ever:** Rasch calibrates from participants, letter grades from percentiles — both work from exam 1

### Achievement Notifications
- **Toast notification** inside the Mini App when a badge is earned
- Newly earned badges also highlighted on the results page

### Waiting for Results
- After submission, user sees **"Waiting for Results"** page with countdown to `scheduled_end`
- Route: `/exam/:examId/waiting`
- User can navigate away — results accessible from dashboard/history once available

---

## Key Constraints

1. **Telegram-only for users** — no web signup or web exam access
2. **One attempt per user per exam** — enforced at database level
3. **150-minute time limit** — fixed for all exams
4. **All exams are scheduled** — specific open/close window
5. **Results after window closes** — not immediately after submission
6. **Full result details** — right/wrong AND correct answers shown
7. **PDF hidden after exam** — no post-exam access
8. **Auto-save on blur + debounced** — double safety for answer persistence
9. **Schedule lock** — exam schedule fields locked once students have started
9. **30-second visual warning** — timer flashes red, no sound
10. **Weekly exam cadence** — new exam published every week
11. **Practice is separate** — no impact on ELO or Rasch

---

## Remaining Work

Features that are planned but not yet fully implemented:

- **Leaderboard tabs** — wire existing backend helpers (`_most_improved`, `_most_active`) to API with `?tab=` parameter, add tab switching in frontend
- **Leaderboard privacy** — mask names for users ranked 51+; users outside top 50 see only their own rank
- **Rasch fallback** — use `MIN_RASCH_PARTICIPANTS` constant to fall back to raw percentage when <10 participants
- **Analytics retention trends** — add retention/churn metrics to admin analytics dashboard
- **Verify: name sync** — confirm Telegram name auto-updates on every Mini App open
- **Verify: connection retry** — confirm ConnectionBanner triggers answer re-save on reconnection
