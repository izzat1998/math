# Phase 2: Backend Core Refactoring

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor auth (Telegram-only), exam lifecycle (late-start timer, single-exam constraint, deletion blocking), and scoring (Rasch per-exam, letter grades, cold-start fallback).

**Architecture:** Update existing views and business logic to match the new spec. Remove invite code auth flow, add late-start timer calculation, update scoring pipeline with letter grades and Rasch fallback.

**Tech Stack:** Django 6.0.1, DRF, NumPy (Rasch), JWT

**Prerequisites:** Phase 1 complete (models updated).

---

### Task 1: Refactor Auth — Remove Invite Code, Add Name Sync

**Files:**
- Modify: `backend/exams/auth_views.py:74-198`
- Modify: `backend/exams/urls.py:20`

**Step 1: Write the failing test**

Create `backend/tests/test_auth.py`:
```python
from django.test import TestCase, RequestFactory
from exams.models import Student


class TestTelegramAuth(TestCase):
    def test_invite_code_endpoint_removed(self):
        """The invite code endpoint should return 404."""
        from django.test import Client
        client = Client()
        response = client.post('/api/auth/invite-code/', {})
        self.assertEqual(response.status_code, 404)

    def test_telegram_auth_updates_name(self):
        """Telegram auth should update student name if changed."""
        student = Student.objects.create(full_name="Old Name", telegram_id=12345)
        # After auth with new name, full_name should update
        student.full_name = "New Name"
        student.save()
        student.refresh_from_db()
        self.assertEqual(student.full_name, "New Name")
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/izzatbekkhamraev/XLOG/math/backend && python manage.py test tests.test_auth -v2`
Expected: FAIL — invite code endpoint still exists (returns 400, not 404)

**Step 3: Remove invite code URL**

In `backend/exams/urls.py`, delete line 20:
```python
path('auth/invite-code/', auth_views.join_exam_by_invite_code, name='join-exam-invite'),
```

**Step 4: Remove invite code function from auth_views.py**

Delete `join_exam_by_invite_code` function entirely (lines 118-180).

**Step 5: Add name sync to auth_telegram**

In `backend/exams/auth_views.py`, in the `auth_telegram` function, update the get_or_create logic to also update the name:

```python
# After validating telegram data, extract user info
telegram_user = data.get('user', {})
telegram_id = telegram_user.get('id')
first_name = telegram_user.get('first_name', '')
last_name = telegram_user.get('last_name', '')
full_name = f"{first_name} {last_name}".strip() or f"User {telegram_id}"

student, created = Student.objects.get_or_create(
    telegram_id=telegram_id,
    defaults={'full_name': full_name}
)

# Sync name on every login (not just creation)
if not created and student.full_name != full_name:
    student.full_name = full_name
    student.save(update_fields=['full_name'])
```

**Step 6: Run test to verify it passes**

Expected: PASS

**Step 7: Commit**
```bash
git add backend/exams/auth_views.py backend/exams/urls.py backend/tests/test_auth.py
git commit -m "refactor: remove invite code auth, add Telegram name sync"
```

---

### Task 2: Exam Lifecycle — Late-Start Timer Logic

**Files:**
- Modify: `backend/exams/student_views.py:68-86` (start_exam)
- Modify: `backend/exams/student_views.py:89-140` (save_answer)

**Step 1: Write the failing test**

Create `backend/tests/test_exam_lifecycle.py`:
```python
from django.test import TestCase
from django.utils import timezone
from datetime import timedelta
from exams.models import MockExam, Student, ExamSession
from django.contrib.auth.models import User


class TestLateStartTimer(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user('admin', password='test')
        self.student = Student.objects.create(full_name="Test", telegram_id=11111)
        now = timezone.now()
        self.exam = MockExam.objects.create(
            title="Test Exam",
            scheduled_start=now - timedelta(minutes=140),  # Started 140 min ago
            scheduled_end=now + timedelta(minutes=10),  # 10 min remaining
            duration=150,
            created_by=self.admin,
        )

    def test_late_start_gets_reduced_time(self):
        """If only 10 minutes remain in window, duration should be 10, not 150."""
        session = ExamSession.objects.create(
            student=self.student,
            exam=self.exam,
            status='in_progress',
        )
        remaining = (self.exam.scheduled_end - session.started_at).total_seconds() / 60
        effective_duration = min(self.exam.duration, max(0, remaining))
        self.assertLessEqual(effective_duration, 11)  # ~10 minutes, with some tolerance
        self.assertLess(effective_duration, 150)
```

**Step 2: Run test to verify behavior understanding**

Run: `cd /Users/izzatbekkhamraev/XLOG/math/backend && python manage.py test tests.test_exam_lifecycle -v2`

**Step 3: Update start_exam view**

In `backend/exams/student_views.py`, modify the `start_exam` function to return effective duration:

```python
@api_view(['POST'])
@permission_classes([IsStudent])
def start_exam(request, exam_id):
    exam = get_object_or_404(MockExam, id=exam_id)
    now = timezone.now()

    # Check exam is within scheduled window
    if now < exam.scheduled_start:
        return Response({'error': 'Exam has not started yet.'}, status=400)
    if now >= exam.scheduled_end:
        return Response({'error': 'Exam window has closed.'}, status=400)

    # Check one attempt only
    if ExamSession.objects.filter(student=request.user, exam=exam).exists():
        return Response({'error': 'You have already taken this exam.'}, status=400)

    session = ExamSession.objects.create(
        student=request.user,
        exam=exam,
        status=ExamSession.Status.IN_PROGRESS,
    )

    # Late-start: effective duration = min(exam.duration, time remaining)
    remaining_minutes = (exam.scheduled_end - now).total_seconds() / 60
    effective_duration = min(exam.duration, max(0, int(remaining_minutes)))

    return Response({
        'session_id': str(session.id),
        'started_at': session.started_at.isoformat(),
        'duration': effective_duration,  # This may be less than 150 for late starters
    })
```

**Step 4: Update save_answer to use effective duration**

In the `save_answer` function, update elapsed time check to also consider scheduled_end:

```python
# Check if time has expired (both personal timer and exam window)
now = timezone.now()
elapsed = (now - session.started_at).total_seconds()
remaining_at_start = (session.exam.scheduled_end - session.started_at).total_seconds()
effective_duration_seconds = min(session.exam.duration * 60, remaining_at_start)

if elapsed > effective_duration_seconds + 30:  # 30 seconds grace for network
    _submit_session(session, auto=True)
    return Response({'error': 'Time expired. Exam auto-submitted.'}, status=400)
```

**Step 5: Run test**

Expected: PASS

**Step 6: Commit**
```bash
git add backend/exams/student_views.py backend/tests/test_exam_lifecycle.py
git commit -m "feat: implement late-start timer logic (effective duration)"
```

---

### Task 3: Single-Exam Constraint — Block Overlapping Windows

**Files:**
- Modify: `backend/exams/views.py:23-34` (admin_exams)
- Modify: `backend/exams/serializers.py` (MockExamSerializer)

**Step 1: Write the failing test**

Add to `backend/tests/test_exam_lifecycle.py`:
```python
class TestSingleExamConstraint(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user('admin2', password='test')
        now = timezone.now()
        self.exam1 = MockExam.objects.create(
            title="Exam 1",
            scheduled_start=now + timedelta(hours=1),
            scheduled_end=now + timedelta(hours=4),
            duration=150,
            created_by=self.admin,
        )

    def test_cannot_create_overlapping_exam(self):
        """Creating an exam with overlapping time window should fail."""
        now = timezone.now()
        overlapping_start = now + timedelta(hours=2)  # Overlaps with exam1
        overlapping_end = now + timedelta(hours=5)

        overlaps = MockExam.objects.filter(
            scheduled_start__lt=overlapping_end,
            scheduled_end__gt=overlapping_start,
        ).exists()
        self.assertTrue(overlaps)
```

**Step 2: Add overlap validation to MockExamSerializer**

```python
def validate(self, data):
    start = data.get('scheduled_start')
    end = data.get('scheduled_end')
    if start and end:
        overlapping = MockExam.objects.filter(
            scheduled_start__lt=end,
            scheduled_end__gt=start,
        )
        if self.instance:
            overlapping = overlapping.exclude(pk=self.instance.pk)
        if overlapping.exists():
            raise serializers.ValidationError(
                "Another exam is already scheduled during this time window."
            )
    return data
```

**Step 3: Run test, verify, commit**
```bash
git commit -m "feat: block overlapping exam windows (single exam constraint)"
```

---

### Task 4: Block Exam Deletion if Sessions Exist

**Files:**
- Modify: `backend/exams/views.py` (add admin_exam_detail view with DELETE)
- Modify: `backend/exams/urls.py`

**Step 1: Write the failing test**

Add to `backend/tests/test_exam_lifecycle.py`:
```python
class TestExamDeletion(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user('admin3', password='test')
        now = timezone.now()
        self.exam = MockExam.objects.create(
            title="Exam to Delete",
            scheduled_start=now, scheduled_end=now + timedelta(hours=3),
            duration=150, created_by=self.admin,
        )
        self.student = Student.objects.create(full_name="Test", telegram_id=77777)

    def test_can_delete_exam_without_sessions(self):
        """Exam with no sessions can be deleted."""
        self.assertEqual(ExamSession.objects.filter(exam=self.exam).count(), 0)
        self.exam.delete()
        self.assertFalse(MockExam.objects.filter(id=self.exam.id).exists())

    def test_cannot_delete_exam_with_sessions(self):
        """Exam with sessions should be blocked from deletion."""
        ExamSession.objects.create(
            student=self.student, exam=self.exam, status='in_progress'
        )
        has_sessions = ExamSession.objects.filter(exam=self.exam).exists()
        self.assertTrue(has_sessions)
```

**Step 2: Add admin exam CRUD view**

Add to `backend/exams/views.py`:
```python
@api_view(['PUT', 'DELETE'])
@permission_classes([IsAdminUser])
def admin_exam_detail(request, exam_id):
    exam = get_object_or_404(MockExam, id=exam_id)

    if request.method == 'DELETE':
        if ExamSession.objects.filter(exam=exam).exists():
            return Response(
                {'error': 'Cannot delete an exam that has been taken by students.'},
                status=400
            )
        exam.delete()
        return Response(status=204)

    if request.method == 'PUT':
        serializer = MockExamSerializer(exam, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(MockExamSerializer(exam).data)
```

**Step 3: Add URL**

In `backend/exams/urls.py`:
```python
path('admin/exams/<uuid:exam_id>/', views.admin_exam_detail, name='admin-exam-detail'),
```

**Step 4: Commit**
```bash
git commit -m "feat: admin exam CRUD with deletion blocking for taken exams"
```

---

### Task 5: Update Scoring — Letter Grades (Percentile-Based)

**Files:**
- Modify: `backend/exams/scoring.py:1-113`

**Step 1: Write the failing test**

Create `backend/tests/test_scoring.py`:
```python
from django.test import TestCase
from exams.scoring import compute_letter_grade


class TestLetterGrades(TestCase):
    def test_top_10_percent_gets_a_plus(self):
        scores = [90, 85, 80, 75, 70, 65, 60, 55, 50, 45]
        # Score 90 is rank 1 out of 10 = top 10%
        grade = compute_letter_grade(score=90, all_scores=scores)
        self.assertEqual(grade, 'A+')

    def test_bottom_gets_d(self):
        scores = [90, 85, 80, 75, 70, 65, 60, 55, 50, 45]
        grade = compute_letter_grade(score=45, all_scores=scores)
        self.assertEqual(grade, 'D')

    def test_single_participant(self):
        scores = [70]
        grade = compute_letter_grade(score=70, all_scores=scores)
        self.assertEqual(grade, 'A+')  # Only participant = top 10%

    def test_grade_boundaries(self):
        # 20 students, evenly spaced
        scores = list(range(1, 21))
        # Top 10% = rank 1-2 = scores 20, 19
        self.assertEqual(compute_letter_grade(20, scores), 'A+')
        self.assertEqual(compute_letter_grade(19, scores), 'A+')
```

**Step 2: Run test to verify it fails**

Expected: FAIL — `compute_letter_grade` doesn't exist

**Step 3: Implement compute_letter_grade**

Add to `backend/exams/scoring.py`:
```python
def compute_letter_grade(score, all_scores):
    """
    Compute percentile-based letter grade.
    A+ (top 10%), A (top 20%), B+ (top 35%), B (top 50%),
    C+ (top 65%), C (top 80%), below = D
    """
    if not all_scores:
        return 'D'

    sorted_scores = sorted(all_scores, reverse=True)
    total = len(sorted_scores)
    # Rank = number of scores strictly greater than this score + 1
    rank = sum(1 for s in sorted_scores if s > score) + 1
    percentile_rank = rank / total  # 0.0 = best, 1.0 = worst

    if percentile_rank <= 0.10:
        return 'A+'
    elif percentile_rank <= 0.20:
        return 'A'
    elif percentile_rank <= 0.35:
        return 'B+'
    elif percentile_rank <= 0.50:
        return 'B'
    elif percentile_rank <= 0.65:
        return 'C+'
    elif percentile_rank <= 0.80:
        return 'C'
    else:
        return 'D'
```

**Step 4: Run test**

Expected: PASS

**Step 5: Commit**
```bash
git commit -m "feat: add percentile-based letter grade computation"
```

---

### Task 6: Update Scoring — Rasch Per-Exam with Cold-Start Fallback

**Files:**
- Modify: `backend/exams/scoring.py`
- Modify: `backend/exams/rasch.py`

**Step 1: Write the failing test**

Add to `backend/tests/test_scoring.py`:
```python
import numpy as np
from exams.scoring import compute_rasch_scaled_score


class TestRaschScaledScore(TestCase):
    def test_rasch_to_0_100_scale(self):
        """Theta of 0 should map to roughly 50 on 0-100 scale."""
        scaled = compute_rasch_scaled_score(theta=0.0)
        self.assertAlmostEqual(scaled, 50.0, delta=5)

    def test_high_theta_maps_high(self):
        scaled = compute_rasch_scaled_score(theta=3.0)
        self.assertGreater(scaled, 80)
        self.assertLessEqual(scaled, 100)

    def test_low_theta_maps_low(self):
        scaled = compute_rasch_scaled_score(theta=-3.0)
        self.assertLess(scaled, 20)
        self.assertGreaterEqual(scaled, 0)

    def test_clamps_to_0_100(self):
        self.assertEqual(compute_rasch_scaled_score(theta=10.0), 100.0)
        self.assertEqual(compute_rasch_scaled_score(theta=-10.0), 0.0)
```

**Step 2: Implement compute_rasch_scaled_score**

Add to `backend/exams/scoring.py`:
```python
def compute_rasch_scaled_score(theta, min_theta=-4.0, max_theta=4.0):
    """
    Convert Rasch theta (logits) to 0-100 scaled score.
    Uses sigmoid-like mapping centered at theta=0 → 50.
    Clamps to [0, 100].
    """
    # Linear mapping from [min_theta, max_theta] to [0, 100]
    scaled = ((theta - min_theta) / (max_theta - min_theta)) * 100
    return max(0.0, min(100.0, round(scaled, 1)))
```

**Step 3: Add Rasch fallback logic**

Add to `backend/exams/scoring.py`:
```python
MIN_RASCH_PARTICIPANTS = 10


def compute_exam_rasch_scores(exam):
    """
    Compute Rasch scores for all participants of an exam.
    Returns dict of {session_id: scaled_score} or None if fallback to raw %.
    Falls back to raw percentage if fewer than MIN_RASCH_PARTICIPANTS.
    """
    from exams.models import ExamSession, StudentAnswer, ItemDifficulty
    from exams.rasch import estimate_item_difficulties, estimate_theta

    sessions = ExamSession.objects.filter(
        exam=exam, status='submitted'
    ).select_related('student')

    if sessions.count() < MIN_RASCH_PARTICIPANTS:
        return None  # Caller should use raw percentage fallback

    # Build response matrix (students × items)
    # ... (use existing rasch.py functions)
    # Return {session_id: compute_rasch_scaled_score(theta)} for each student
```

**Step 4: Run tests, commit**
```bash
git commit -m "feat: Rasch 0-100 scaling with cold-start fallback"
```

---

### Task 7: Update Session Results — Include All Score Types

**Files:**
- Modify: `backend/exams/student_views.py:160-214` (session_results)

**Step 1: Write the failing test**

Add to `backend/tests/test_scoring.py`:
```python
class TestResultsFormat(TestCase):
    def test_results_include_all_score_types(self):
        """Results should include raw score, rasch scaled, and letter grade."""
        expected_keys = [
            'exercises_correct', 'exercises_total',
            'points', 'points_total',
            'rasch_scaled', 'letter_grade',
            'elo', 'breakdown',
        ]
        # This will be tested via API integration test
        for key in expected_keys:
            self.assertIn(key, expected_keys)  # Placeholder
```

**Step 2: Update session_results view**

Modify the `session_results` function to return:
```python
return Response({
    'exercises_correct': exercises_correct,
    'exercises_total': 45,
    'points': points,
    'points_total': 55,
    'rasch_scaled': rasch_scaled,  # 0-100 or null if fallback
    'letter_grade': letter_grade,  # A+, A, B+, B, C+, C, D
    'is_auto_submitted': session.is_auto_submitted,
    'exam_closed': now >= session.exam.scheduled_end,
    'exam_title': session.exam.title,
    'breakdown': breakdown,
    'elo': elo_data,
})
```

**Step 3: Commit**
```bash
git commit -m "feat: include rasch_scaled and letter_grade in session results"
```

---

### Task 8: Update Views — Use scheduled_start/scheduled_end Everywhere

**Files:**
- Modify: `backend/exams/student_views.py` (all references to open_at/close_at)
- Modify: `backend/exams/views.py` (admin views)
- Modify: `backend/exams/tasks.py`

**Step 1: Search and replace all old field references**

Run: `grep -rn "open_at\|close_at\|is_scheduled" backend/exams/ --include="*.py"`

Replace all occurrences:
- `exam.open_at` → `exam.scheduled_start`
- `exam.close_at` → `exam.scheduled_end`
- Remove any `is_scheduled` checks

**Step 2: Update upcoming_exam view**

In `student_views.py`, update the query to use `scheduled_start`/`scheduled_end`:
```python
exam = MockExam.objects.filter(
    scheduled_end__gt=now
).order_by('scheduled_start').first()
```

**Step 3: Update exam_detail, exam_pdf, session_results**

Replace all `open_at`/`close_at` references with `scheduled_start`/`scheduled_end`.

**Step 4: Verify no old references remain**

Run: `grep -rn "open_at\|close_at\|is_scheduled" backend/exams/ --include="*.py" | grep -v migrations`
Expected: No results

**Step 5: Commit**
```bash
git commit -m "refactor: replace open_at/close_at with scheduled_start/scheduled_end everywhere"
```

---

### Task 9: Remove latest_exam Endpoint

**Files:**
- Modify: `backend/exams/student_views.py:22-29` (remove latest_exam)
- Modify: `backend/exams/urls.py:28` (remove URL)

**Step 1: Remove function and URL**

Delete `latest_exam` function from `student_views.py`.
Delete `path('exams/latest/', ...)` from `urls.py`.

**Step 2: Verify**

Run: `grep -rn "latest_exam\|latest-exam" backend/ --include="*.py" | grep -v migrations`
Expected: No results

**Step 3: Commit**
```bash
git commit -m "refactor: remove deprecated latest_exam endpoint"
```

---

## Phase 2 Summary

| Task | What Changes | Files Affected |
|------|-------------|----------------|
| 1 | Remove invite code auth, add name sync | auth_views.py, urls.py |
| 2 | Late-start timer logic | student_views.py |
| 3 | Block overlapping exam windows | views.py, serializers.py |
| 4 | Block exam deletion if sessions exist | views.py, urls.py |
| 5 | Percentile-based letter grades | scoring.py |
| 6 | Rasch 0-100 scaling with fallback | scoring.py, rasch.py |
| 7 | Results include all score types | student_views.py |
| 8 | Replace open_at/close_at everywhere | student_views.py, views.py, tasks.py |
| 9 | Remove latest_exam endpoint | student_views.py, urls.py |
