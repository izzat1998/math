# Phase 6: Performance Optimization & Testing

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Optimize for 1000+ concurrent users during peak exam times, add comprehensive test coverage, and ensure production readiness.

**Architecture:** Focus on the three hottest paths: answer auto-save (POST /sessions/{id}/answers/), PDF serving, and Rasch calibration. Add database optimizations, caching, and connection pooling.

**Tech Stack:** Django 6.0.1, PostgreSQL, Redis, Gunicorn, Celery

**Prerequisites:** Phases 1-5 complete.

---

### Task 1: Database Query Optimization

**Files:**
- Modify: `backend/exams/student_views.py`
- Modify: `backend/exams/leaderboard_views.py`
- Modify: `backend/exams/dashboard_views.py`

**Step 1: Audit N+1 queries**

Add `select_related` and `prefetch_related` to all queries:

```python
# save_answer — most critical (called on every answer change)
session = ExamSession.objects.select_related('exam', 'student').get(
    id=session_id, student=request.user, status='in_progress'
)

# session_results
session = ExamSession.objects.select_related('exam', 'student').get(id=session_id)
breakdown = StudentAnswer.objects.filter(session=session).order_by('question_number', 'sub_part')
correct_answers = CorrectAnswer.objects.filter(exam=session.exam)

# dashboard — use single query with prefetch
student = Student.objects.prefetch_related(
    'achievements__achievement', 'streak', 'rating'
).get(id=request.user.id)

# leaderboard — already optimized with _prefetch_trends
```

**Step 2: Add database indexes for hot queries**

Create migration with additional indexes:
```python
class Migration(migrations.Migration):
    operations = [
        migrations.AddIndex(
            model_name='studentanswer',
            index=models.Index(
                fields=['session', 'question_number'],
                name='idx_answer_session_question'
            ),
        ),
        migrations.AddIndex(
            model_name='examsession',
            index=models.Index(
                fields=['exam', 'status'],
                name='idx_session_exam_status'
            ),
        ),
        migrations.AddIndex(
            model_name='mockexam',
            index=models.Index(
                fields=['scheduled_start', 'scheduled_end'],
                name='idx_exam_schedule'
            ),
        ),
    ]
```

**Step 3: Commit**
```bash
git commit -m "perf: optimize database queries and add indexes for hot paths"
```

---

### Task 2: Answer Auto-Save Optimization

**Files:**
- Modify: `backend/exams/student_views.py:89-140` (save_answer)

**Step 1: Optimize save_answer for high concurrency**

The `save_answer` endpoint is the hottest path — called on every blur + debounced typing for 1000+ users simultaneously.

```python
@api_view(['POST'])
@permission_classes([IsStudent])
def save_answer(request, session_id):
    """Optimized answer save for high concurrency."""
    question_number = request.data.get('question_number')
    sub_part = request.data.get('sub_part', '')
    answer = request.data.get('answer', '').strip()

    if not question_number:
        return Response({'error': 'question_number required'}, status=400)

    # Validate answer length
    if len(answer) > 500:
        return Response({'error': 'Answer too long'}, status=400)

    # Single optimized query with select_related
    try:
        session = ExamSession.objects.select_related('exam').only(
            'id', 'status', 'started_at', 'exam__duration', 'exam__scheduled_end'
        ).get(id=session_id, student=request.user)
    except ExamSession.DoesNotExist:
        return Response({'error': 'Session not found'}, status=404)

    if session.status != ExamSession.Status.IN_PROGRESS:
        return Response({'error': 'Exam already submitted'}, status=400)

    # Time check
    now = timezone.now()
    elapsed = (now - session.started_at).total_seconds()
    remaining_at_start = (session.exam.scheduled_end - session.started_at).total_seconds()
    effective_duration = min(session.exam.duration * 60, remaining_at_start)

    if elapsed > effective_duration + 30:
        _submit_session(session, auto=True)
        return Response({'error': 'Time expired'}, status=400)

    # Upsert answer — use update_or_create for atomic operation
    StudentAnswer.objects.update_or_create(
        session=session,
        question_number=question_number,
        sub_part=sub_part,
        defaults={'answer': answer}
    )

    return Response({'status': 'saved'})
```

Key optimizations:
- `only()` to fetch minimal fields
- `select_related` to avoid extra query for exam
- `update_or_create` for atomic upsert
- Minimal response payload

**Step 2: Commit**
```bash
git commit -m "perf: optimize save_answer for high concurrency"
```

---

### Task 3: PDF Serving Optimization

**Files:**
- Modify: `backend/exams/student_views.py:44-65` (exam_pdf)
- Modify: `backend/config/settings.py`

**Step 1: Serve PDFs via Nginx X-Accel-Redirect (production)**

Instead of Django reading and streaming the file, let Nginx handle it:

```python
@api_view(['GET'])
@permission_classes([IsStudent])
def exam_pdf(request, exam_id):
    exam = get_object_or_404(MockExam, id=exam_id)

    # Only serve during active exam window
    now = timezone.now()
    session = ExamSession.objects.filter(
        student=request.user, exam=exam, status='in_progress'
    ).first()

    if not session:
        return Response({'error': 'No active session'}, status=403)

    if now > exam.scheduled_end:
        return Response({'error': 'Exam window closed'}, status=403)

    # In production, use X-Accel-Redirect for Nginx
    if not settings.DEBUG:
        response = HttpResponse()
        response['X-Accel-Redirect'] = f'/protected-media/{exam.pdf_file.name}'
        response['Content-Type'] = 'application/pdf'
        response['Content-Disposition'] = f'inline; filename="{exam.title}.pdf"'
        return response

    # In development, serve directly
    return FileResponse(exam.pdf_file.open('rb'), content_type='application/pdf')
```

**Step 2: Add cache headers**

```python
response['Cache-Control'] = 'private, max-age=3600'  # Cache for 1 hour in browser
```

**Step 3: Commit**
```bash
git commit -m "perf: optimize PDF serving with X-Accel-Redirect and caching"
```

---

### Task 4: PostgreSQL Connection Pooling

**Files:**
- Modify: `backend/config/settings.py:83-93`
- Modify: `backend/requirements.txt`

**Step 1: Add django-db-connection-pool**

```bash
pip install django-db-connection-pool[postgresql]
```

**Step 2: Update database config**

```python
DATABASES = {
    'default': {
        'ENGINE': 'dj_db_conn_pool.backends.postgresql',
        'NAME': os.environ.get('DB_NAME', 'math'),
        'USER': os.environ.get('DB_USER', 'postgres'),
        'PASSWORD': os.environ.get('DB_PASSWORD', ''),
        'HOST': os.environ.get('DB_HOST', 'localhost'),
        'PORT': os.environ.get('DB_PORT', '5432'),
        'POOL_OPTIONS': {
            'POOL_SIZE': 20,       # Base connections
            'MAX_OVERFLOW': 30,    # Extra connections under load
            'RECYCLE': 300,        # Recycle connections every 5 min
        },
    }
}
```

**Step 3: Commit**
```bash
git commit -m "perf: add PostgreSQL connection pooling for 1000+ concurrent users"
```

---

### Task 5: Redis Caching for Hot Endpoints

**Files:**
- Modify: `backend/config/settings.py`
- Modify: `backend/exams/leaderboard_views.py`
- Modify: `backend/exams/dashboard_views.py`

**Step 1: Configure Django cache**

Add to settings.py:
```python
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.redis.RedisCache',
        'LOCATION': f'redis://{REDIS_HOST}:{REDIS_PORT}/2',
    }
}
```

**Step 2: Cache leaderboard (updates after each exam closes)**

```python
from django.core.cache import cache

@api_view(['GET'])
def leaderboard(request):
    tab = request.query_params.get('tab', 'top_rated')
    cache_key = f'leaderboard_{tab}'

    data = cache.get(cache_key)
    if not data:
        # Compute leaderboard
        data = _compute_leaderboard(tab)
        cache.set(cache_key, data, timeout=300)  # 5 min cache

    # Always compute current user's entry fresh
    if hasattr(request, 'user') and isinstance(request.user, Student):
        data['my_entry'] = _get_my_entry(request.user)

    return Response(data)
```

**Step 3: Invalidate cache after exam results**

In the Rasch calibration / ELO update flow:
```python
cache.delete_pattern('leaderboard_*')
```

**Step 4: Commit**
```bash
git commit -m "perf: add Redis caching for leaderboard and dashboard"
```

---

### Task 6: Gunicorn Configuration for Scale

**Files:**
- Create: `backend/gunicorn.conf.py`

**Step 1: Create optimized Gunicorn config**

```python
import multiprocessing

# Workers
workers = multiprocessing.cpu_count() * 2 + 1
worker_class = 'gthread'
threads = 4

# Connections
worker_connections = 1000
max_requests = 1000
max_requests_jitter = 50

# Timeouts
timeout = 120
graceful_timeout = 30
keepalive = 5

# Logging
accesslog = '-'
errorlog = '-'
loglevel = 'warning'

# Bind
bind = '0.0.0.0:8000'
```

**Step 2: Update systemd service to use config**

```
ExecStart=/path/to/gunicorn config.wsgi:application -c /path/to/gunicorn.conf.py
```

**Step 3: Commit**
```bash
git commit -m "perf: add optimized Gunicorn config for 1000+ concurrent users"
```

---

### Task 7: Comprehensive Backend Tests

**Files:**
- Modify: `backend/tests/test_models.py` (extend)
- Modify: `backend/tests/test_auth.py` (extend)
- Modify: `backend/tests/test_exam_lifecycle.py` (extend)
- Modify: `backend/tests/test_scoring.py` (extend)
- Modify: `backend/tests/test_gamification.py` (extend)
- Modify: `backend/tests/test_dashboard.py` (extend)
- Create: `backend/tests/test_integration.py`

**Step 1: Write integration tests**

Create `backend/tests/test_integration.py`:
```python
from django.test import TestCase, Client
from django.utils import timezone
from datetime import timedelta
from exams.models import *
from django.contrib.auth.models import User
import json


class TestFullExamFlow(TestCase):
    """End-to-end test: create exam → start → answer → submit → results."""

    def setUp(self):
        self.admin = User.objects.create_superuser('admin', 'a@b.com', 'pass')
        self.student = Student.objects.create(full_name="E2E Test", telegram_id=99999)
        self.client = Client()
        now = timezone.now()
        self.exam = MockExam.objects.create(
            title="E2E Exam",
            scheduled_start=now - timedelta(minutes=5),
            scheduled_end=now + timedelta(hours=3),
            duration=150,
            created_by=self.admin,
        )
        # Create correct answers for all 45 questions
        for q in range(1, 36):
            CorrectAnswer.objects.create(
                exam=self.exam, question_number=q, sub_part='',
                correct_answer='A'
            )
        for q in range(36, 46):
            CorrectAnswer.objects.create(
                exam=self.exam, question_number=q, sub_part='a',
                correct_answer='5'
            )
            CorrectAnswer.objects.create(
                exam=self.exam, question_number=q, sub_part='b',
                correct_answer='10'
            )

    def test_full_exam_flow(self):
        # This tests the full flow programmatically
        # Start session
        session = ExamSession.objects.create(
            student=self.student, exam=self.exam,
            status=ExamSession.Status.IN_PROGRESS,
        )

        # Save answers
        for q in range(1, 36):
            StudentAnswer.objects.create(
                session=session, question_number=q, sub_part='',
                answer='A'  # All correct
            )
        for q in range(36, 46):
            StudentAnswer.objects.create(
                session=session, question_number=q, sub_part='a', answer='5'
            )
            StudentAnswer.objects.create(
                session=session, question_number=q, sub_part='b', answer='10'
            )

        # Submit
        from exams.student_views import _submit_session
        _submit_session(session)

        session.refresh_from_db()
        self.assertEqual(session.status, 'submitted')

        # Check scoring
        correct_count = StudentAnswer.objects.filter(
            session=session, is_correct=True
        ).count()
        self.assertEqual(correct_count, 55)  # All correct


class TestRaschCalibrationFlow(TestCase):
    """Test Rasch calibration after exam closes."""

    def test_calibration_produces_item_difficulties(self):
        # Create exam with 20+ student sessions
        # Run calibration
        # Verify ItemDifficulty records created
        pass  # Implement with realistic test data


class TestStreakFlow(TestCase):
    """Test streak tracking across multiple exams."""

    def test_consecutive_exams_build_streak(self):
        from exams.gamification import update_streak, check_streak_broken
        student = Student.objects.create(full_name="Streak", telegram_id=88888)
        admin = User.objects.create_user('admin', password='test')

        # Create 3 exams
        now = timezone.now()
        exams = []
        for i in range(3):
            exam = MockExam.objects.create(
                title=f"Exam {i+1}",
                scheduled_start=now + timedelta(weeks=i),
                scheduled_end=now + timedelta(weeks=i, hours=3),
                duration=150,
                created_by=admin,
            )
            exams.append(exam)

        # Student takes all 3
        for exam in exams:
            session = ExamSession.objects.create(
                student=student, exam=exam, status='submitted',
                submitted_at=exam.scheduled_start + timedelta(hours=1),
            )
            check_streak_broken(student, exam)
            update_streak(student)

        streak = StudentStreak.objects.get(student=student)
        self.assertEqual(streak.current_streak, 3)
        self.assertEqual(streak.longest_streak, 3)
```

**Step 2: Run full test suite**

Run: `cd /Users/izzatbekkhamraev/XLOG/math/backend && python manage.py test -v2`

**Step 3: Commit**
```bash
git commit -m "test: add comprehensive integration tests"
```

---

### Task 8: Rasch Calibration Celery Task

**Files:**
- Modify: `backend/exams/tasks.py`

**Step 1: Add post-exam calibration task**

```python
@shared_task
def calibrate_exam_rasch(exam_id):
    """
    Run Rasch calibration after exam window closes.
    Updates ItemDifficulty and StudentRating.rasch_scaled for all participants.
    """
    from exams.models import MockExam, ExamSession, StudentAnswer, ItemDifficulty, StudentRating
    from exams.rasch import estimate_item_difficulties, estimate_theta, compute_item_fit
    from exams.scoring import compute_rasch_scaled_score

    try:
        exam = MockExam.objects.get(id=exam_id)
    except MockExam.DoesNotExist:
        logger.error(f"Exam {exam_id} not found for calibration")
        return

    sessions = ExamSession.objects.filter(exam=exam, status='submitted')

    if sessions.count() < 10:
        logger.info(f"Exam {exam_id}: only {sessions.count()} participants, skipping Rasch")
        return

    # Build response matrix and calibrate
    # ... (build numpy array from StudentAnswer data)
    # ... (call estimate_item_difficulties)
    # ... (call estimate_theta for each student)
    # ... (save ItemDifficulty records)
    # ... (update StudentRating.rasch_ability and rasch_scaled)

    logger.info(f"Exam {exam_id}: Rasch calibration complete for {sessions.count()} participants")
```

**Step 2: Trigger calibration when exam window closes**

Add to `auto_submit_expired_sessions` task:
```python
# Check if any exam windows just closed
from exams.models import MockExam
now = timezone.now()
recently_closed = MockExam.objects.filter(
    scheduled_end__lte=now,
    scheduled_end__gte=now - timedelta(minutes=2),  # Just closed in last 2 min
)
for exam in recently_closed:
    if not ItemDifficulty.objects.filter(exam=exam).exists():
        calibrate_exam_rasch.delay(str(exam.id))
```

**Step 3: Commit**
```bash
git commit -m "feat: add Celery task for post-exam Rasch calibration"
```

---

## Phase 6 Summary

| Task | What's Optimized | Impact |
|------|-----------------|--------|
| 1 | Database queries + indexes | Fewer queries per request |
| 2 | Answer auto-save endpoint | Handles 1000+ concurrent saves |
| 3 | PDF serving (X-Accel-Redirect) | Offloads file serving to Nginx |
| 4 | PostgreSQL connection pooling | Handles connection surge |
| 5 | Redis caching for leaderboard/dashboard | Reduces DB load |
| 6 | Gunicorn multi-worker config | CPU utilization |
| 7 | Comprehensive test suite | Coverage for all features |
| 8 | Rasch calibration Celery task | Automated post-exam scoring |

---

## Overall Phase Dependency Chain

```
Phase 1: Database & Models ──────────────────┐
                                              │
Phase 2: Backend Core (Auth, Scoring) ────────┤
                                              │
Phase 3: Backend Features (Dashboard, etc.) ──┤
                                              │
Phase 4: Frontend Cleanup ────────────────────┤
                                              │
Phase 5: Frontend Features ───────────────────┤
                                              │
Phase 6: Performance & Testing ───────────────┘
```

**Phases 1-3 are strictly sequential** (each depends on previous).
**Phases 4-5 can partially overlap** with Phase 3 (frontend work once API contracts are stable).
**Phase 6 can start after Phase 3** (performance work is backend-focused).
