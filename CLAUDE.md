# Math Mock Exam Platform

Telegram Mini App for timed math mock exams with Rasch IRT psychometric scoring and ELO ranking. Students take PDF-based exams (45 questions, 150 minutes), get graded automatically with raw scores, Rasch-scaled scores (0-100), and letter grades.

## Current State (2026-02-21)

**What works:** Full exam lifecycle (create → lobby → take → grade → results), Rasch + ELO scoring, gamification (streaks + achievements), practice mode (light/medium), dashboard, history, leaderboard (top rated only), admin CRUD with item analysis, Telegram bot notifications.

**Not yet built:** Leaderboard tabs (Most Improved, Most Active — backend helpers exist, API not wired), leaderboard privacy (name masking for rank 51+), Rasch fallback for <10 participants, retention analytics.

**Needs verification:** Telegram name sync on every open, connection loss retry logic.

## Tech Stack

- **Backend**: Django 6.0 + DRF, PostgreSQL (connection pooling), Celery + Redis
- **Frontend**: React 19 + TypeScript (strict), Vite 7, Tailwind CSS 4
- **Auth**: Telegram initData HMAC → JWT (180min access, 7-day refresh with rotation)
- **Scoring**: Rasch 1PL IRT model (JMLE estimation), ELO rating system
- **Deploy**: Gunicorn + systemd services (math-gunicorn, math-celery, math-celerybeat)

## Commands

```bash
# Backend
cd backend && python manage.py runserver 0.0.0.0:8000   # dev server
cd backend && python manage.py test                       # all tests
cd backend && python manage.py test tests.test_integration # specific module
cd backend && python manage.py migrate                    # run migrations
cd backend && python manage.py makemigrations             # create migrations

# Frontend
cd frontend && npm run dev      # Vite dev server (proxies /api to :8000)
cd frontend && npm run build    # tsc + vite build
cd frontend && npm run lint     # ESLint

# Celery
cd backend && celery -A config worker -l info   # task worker
cd backend && celery -A config beat -l info      # scheduler (auto-submit every 60s)

# Production
make deploy    # pull → db-backup → backend deps+migrate → frontend build → restart services
make status    # systemd service status
make logs      # tail all service logs
```

## Project Structure

```
backend/
  config/          # Django settings, urls, celery, wsgi
  exams/           # Single app: models, views, serializers, tasks, admin
    management/    # Commands: populate_questions, simulate_rasch
    rasch.py       # 1PL IRT: JMLE estimation, fit statistics
    elo.py         # ELO rating: K=40 (first 5 exams), K=20 after
    scoring.py     # Grading: normalize answers, compute points/exercises
    gamification.py # Streaks, achievements
    notifications.py # Telegram bot notifications
    permissions.py  # StudentJWTAuthentication, IsStudent
  tests/           # test_auth, test_exam_lifecycle, test_scoring, test_rasch, etc.

frontend/src/
  api/             # client.ts (Axios + token refresh), types.ts (all interfaces)
  components/      # PdfViewer, Timer, AnswerBar, AnswerSidebar, MathKeyboard, etc.
  context/         # AuthContext (Telegram JWT), ToastContext
  hooks/           # useTelegram, useMobileDetect, useCursorInsert
  pages/           # DashboardPage, ExamPage, LobbyPage, ResultsPage, LeaderboardPage, etc.
    admin/         # AdminLoginPage, CreateExamPage, ItemAnalysisPage, AnalyticsPage, etc.
```

## Key Architecture Decisions

- **Single Django app** (`exams`): all models and views in one app, no sub-apps
- **Function-based views** with DRF decorators (`@api_view`, `@permission_classes`)
- **UUID primary keys** on all models
- **Context-based state** (AuthContext, ToastContext) — no Redux/Zustand
- **Lazy-loaded pages** via React `lazy()` + `Suspense`
- **All UI text is in Uzbek** (Latin script). Error messages too: e.g. "Imtihon hozircha ochiq emas"

## Exam Structure (Fixed Format)

- Questions 1-35: multiple choice (A/B/C/D), 1 point each
- Questions 36-45: free text with sub-parts a) and b), 1 point per sub-part
- Total: 45 exercises, 55 points max, 150 minutes
- One attempt per student per exam (DB unique constraint)
- Paired questions (36-45) count as "correct exercise" only if BOTH a and b are right

## Scoring Pipeline

1. **Raw score**: points (out of 55) and exercises (out of 45)
2. **Rasch scaled score**: θ estimated via JMLE → linear map [-4,4] → [0,100]
3. **Letter grade**: percentile-based (A+ top 10%, A top 20%, ... D below 80%)
4. **ELO update**: K × (score% - expected) where expected = 1/(1+10^((opponent-elo)/400))
5. Rasch calibration runs async via Celery after exam window closes (requires ≥10 participants)

## API Patterns

- Admin endpoints: `/api/admin/exams/`, require `IsAdminUser`
- Student endpoints: `/api/exams/`, require `StudentJWTAuthentication` + `IsStudent`
- Auth: `POST /api/auth/telegram/` (validates initData HMAC, returns JWT)
- Token refresh: `POST /api/token/refresh/`
- Leaderboard cached 5 minutes, student auth object cached 60 seconds (Redis)

## Database Gotchas

- `select_for_update()` used on answer saves and session submissions (prevents race conditions)
- `ExamSession` has unique constraint on (student, exam) — one attempt enforced
- `StudentAnswer` unique on (session, question_number, sub_part)
- Answer normalization: lowercase, unicode symbol mapping (−→-, ×→*, ÷→/)
- Late-start: effective_duration = min(exam.duration, remaining_window_time) + 30s grace

## Frontend Patterns

- Axios interceptor handles 401 → token refresh with request queue (prevents stampede)
- Separate admin API client (`pages/admin/adminApi.ts`) with its own token pair
- Answer save debounced at 500ms
- PDF viewer: react-pdf with pinch-zoom and swipe navigation
- Timer corrects for tab-hidden drift via visibility change API
- `useTelegram` hook wraps all Telegram WebApp APIs (haptics, main button, back button, cloud storage)

## Environment Variables

Backend (`backend/.env`): `DEBUG`, `SECRET_KEY`, `ALLOWED_HOSTS`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHANNEL_ID`, `CORS_ALLOWED_ORIGINS`

Frontend (`frontend/.env`): `VITE_API_BASE_URL` (production API URL)

## Testing

Tests live in `backend/tests/`. Key test files:
- `test_exam_lifecycle.py` — full exam flow: start → save answers → submit → grading
- `test_scoring.py` — answer normalization, point/exercise counting
- `test_rasch.py` — theta estimation, item calibration, fit statistics
- `test_integration.py` — end-to-end with perfect/partial scores, letter grades, Rasch
- `test_gamification.py` — streak logic, achievement awarding
- `test_auth.py` — Telegram auth, JWT tokens
- `test_dashboard.py` — dashboard data assembly

## Documentation

- `spec.md` — full behavioral specification (source of truth for what the platform should do)
- `docs/plans/` — dated implementation plans for each phase
- `notebooks/rasch_validation.ipynb` — statistical proof that Rasch implementation is correct
