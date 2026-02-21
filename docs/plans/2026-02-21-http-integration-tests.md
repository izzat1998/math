# HTTP Integration Tests — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add HTTP-level integration tests that prove the app works end-to-end through actual API endpoints — not just internal function calls.

**Architecture:** Each test class uses Django's `APIClient` to make real HTTP requests, authenticating via helper methods that mirror Telegram initData flow. Tests are organized by user flow (auth, exam lifecycle, admin, etc.) rather than by module.

**Tech Stack:** Django REST Framework's `APIClient`, `unittest.mock.patch` for Telegram signature bypass, `override_settings` for test config.

---

## Test Infrastructure

All HTTP tests will live in `backend/tests/` alongside existing unit tests. A shared `helpers.py` provides auth and factory utilities so each test file stays focused.

### Key Design Decisions

1. **Real HTTP requests via `APIClient`** — not function calls. Every test hits a URL and asserts status codes + response JSON.
2. **Auth helper** — creates a Student and returns a pre-authenticated client with valid JWT tokens, bypassing Telegram HMAC (which is tested separately).
3. **Exam factory** — creates a MockExam with correct answers pre-loaded, since almost every test needs one.
4. **No external dependencies** — Telegram bot notifications are mocked. No Redis/Celery required (tasks called synchronously via `.apply()`).

---

## Task 1: Test Helpers (Foundation)

**Files:**
- Create: `backend/tests/helpers.py`
- Reference: `backend/exams/auth_views.py:_get_tokens_for_student()`

**Step 1: Create helpers.py with auth + factory utilities**

```python
# backend/tests/helpers.py
from datetime import timedelta

from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APIClient

from exams.auth_views import _get_tokens_for_student
from exams.models import MockExam, CorrectAnswer, Student


def make_student(telegram_id=100001, full_name="Test Student"):
    """Create a Student and return it."""
    return Student.objects.create(telegram_id=telegram_id, full_name=full_name)


def authenticated_client(student=None):
    """Return an APIClient with valid JWT for the given student."""
    if student is None:
        student = make_student()
    tokens = _get_tokens_for_student(student)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")
    return client, student


def admin_client():
    """Return an APIClient authenticated as a Django admin user."""
    user = User.objects.create_superuser('testadmin', 'admin@test.com', 'testpass123')
    client = APIClient()
    client.force_authenticate(user=user)
    return client, user


def make_exam(admin_user, start_offset=-5, end_offset=175, duration=150, title="Test Exam"):
    """Create a MockExam with full correct answers.

    start_offset/end_offset are minutes from now.
    Returns (exam, correct_answers_dict).
    """
    now = timezone.now()
    exam = MockExam.objects.create(
        title=title,
        scheduled_start=now + timedelta(minutes=start_offset),
        scheduled_end=now + timedelta(minutes=end_offset),
        duration=duration,
        created_by=admin_user,
    )
    # Q1-35: MCQ, answer is 'A'
    for q in range(1, 36):
        CorrectAnswer.objects.create(
            exam=exam, question_number=q, sub_part=None, correct_answer='A'
        )
    # Q36-45: paired, a='5', b='10'
    for q in range(36, 46):
        CorrectAnswer.objects.create(
            exam=exam, question_number=q, sub_part='a', correct_answer='5'
        )
        CorrectAnswer.objects.create(
            exam=exam, question_number=q, sub_part='b', correct_answer='10'
        )
    return exam
```

**Step 2: Verify helpers import correctly**

Run: `cd /Users/izzatbekkhamraev/XLOG/math/backend && python -c "from tests.helpers import make_student, authenticated_client, admin_client, make_exam; print('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add backend/tests/helpers.py
git commit -m "test: add HTTP test helpers (auth client, exam factory)"
```

---

## Task 2: Telegram Auth Flow (Security-Critical)

**Files:**
- Create: `backend/tests/test_http_auth.py`
- Reference: `backend/exams/auth_views.py` (auth_telegram, auth_logout)
- Reference: `backend/exams/permissions.py` (StudentJWTAuthentication)

**Step 1: Write test file**

```python
# backend/tests/test_http_auth.py
import hashlib
import hmac
import json
import time
from urllib.parse import urlencode

from django.conf import settings
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from exams.models import Student
from tests.helpers import authenticated_client, make_student

BOT_TOKEN = 'test-bot-token-for-testing'


def _build_init_data(user_data, bot_token=BOT_TOKEN):
    """Build valid Telegram initData with HMAC signature."""
    auth_date = str(int(time.time()))
    params = {
        'user': json.dumps(user_data),
        'auth_date': auth_date,
    }
    data_check_string = '\n'.join(
        f"{k}={v}" for k, v in sorted(params.items())
    )
    secret = hmac.new(b'WebAppData', bot_token.encode(), hashlib.sha256).digest()
    hash_value = hmac.new(secret, data_check_string.encode(), hashlib.sha256).hexdigest()
    params['hash'] = hash_value
    return urlencode(params, doseq=True)


@override_settings(TELEGRAM_BOT_TOKEN=BOT_TOKEN)
class TestTelegramAuthHTTP(TestCase):
    """Test POST /api/auth/telegram/ through actual HTTP."""

    def setUp(self):
        self.client = APIClient()
        self.url = '/api/auth/telegram/'

    def test_valid_initdata_creates_student_and_returns_tokens(self):
        user_data = {'id': 12345, 'first_name': 'Izzat', 'last_name': 'Khamraev'}
        init_data = _build_init_data(user_data)

        response = self.client.post(self.url, {'initData': init_data}, format='json')

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn('access', data)
        self.assertIn('refresh', data)
        self.assertIn('student_id', data)
        self.assertEqual(data['full_name'], 'Izzat Khamraev')

        # Student was actually created in DB
        self.assertTrue(Student.objects.filter(telegram_id=12345).exists())

    def test_second_login_syncs_name(self):
        """Name updates on subsequent logins."""
        user_data = {'id': 99999, 'first_name': 'Old', 'last_name': 'Name'}
        init_data = _build_init_data(user_data)
        self.client.post(self.url, {'initData': init_data}, format='json')

        # Login again with new name
        user_data['first_name'] = 'New'
        init_data = _build_init_data(user_data)
        response = self.client.post(self.url, {'initData': init_data}, format='json')

        self.assertEqual(response.status_code, 200)
        student = Student.objects.get(telegram_id=99999)
        self.assertEqual(student.full_name, 'New Name')

    def test_missing_initdata_returns_400(self):
        response = self.client.post(self.url, {}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_invalid_signature_returns_401(self):
        user_data = {'id': 12345, 'first_name': 'Hacker'}
        init_data = _build_init_data(user_data, bot_token='wrong-token')
        response = self.client.post(self.url, {'initData': init_data}, format='json')
        self.assertEqual(response.status_code, 401)

    def test_expired_auth_date_returns_401(self):
        """initData older than 5 minutes should be rejected."""
        auth_date = str(int(time.time()) - 600)  # 10 minutes ago
        params = {
            'user': json.dumps({'id': 12345, 'first_name': 'Test'}),
            'auth_date': auth_date,
        }
        data_check_string = '\n'.join(f"{k}={v}" for k, v in sorted(params.items()))
        secret = hmac.new(b'WebAppData', BOT_TOKEN.encode(), hashlib.sha256).digest()
        params['hash'] = hmac.new(secret, data_check_string.encode(), hashlib.sha256).hexdigest()
        init_data = urlencode(params, doseq=True)

        response = self.client.post(self.url, {'initData': init_data}, format='json')
        self.assertEqual(response.status_code, 401)


class TestAuthProtection(TestCase):
    """Verify endpoints reject unauthenticated requests."""

    def setUp(self):
        self.client = APIClient()

    def test_dashboard_requires_auth(self):
        response = self.client.get('/api/me/dashboard/')
        self.assertIn(response.status_code, [401, 403])

    def test_exam_start_requires_auth(self):
        response = self.client.post('/api/exams/00000000-0000-0000-0000-000000000001/start/')
        self.assertIn(response.status_code, [401, 403])

    def test_leaderboard_allows_anonymous(self):
        """Leaderboard is AllowAny."""
        response = self.client.get('/api/leaderboard/')
        self.assertEqual(response.status_code, 200)

    def test_upcoming_exam_allows_anonymous(self):
        response = self.client.get('/api/exams/upcoming/')
        self.assertEqual(response.status_code, 200)


class TestTokenRefresh(TestCase):
    """Test JWT token refresh flow."""

    def test_refresh_returns_new_access_token(self):
        client, student = authenticated_client()
        from exams.auth_views import _get_tokens_for_student
        tokens = _get_tokens_for_student(student)

        refresh_client = APIClient()
        response = refresh_client.post('/api/token/refresh/', {'refresh': tokens['refresh']}, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertIn('access', response.json())

    def test_invalid_refresh_token_rejected(self):
        client = APIClient()
        response = client.post('/api/token/refresh/', {'refresh': 'invalid-token'}, format='json')
        self.assertEqual(response.status_code, 401)


class TestLogout(TestCase):
    """Test POST /api/auth/logout/ blacklists token."""

    def test_logout_blacklists_refresh_token(self):
        client, student = authenticated_client()
        from exams.auth_views import _get_tokens_for_student
        tokens = _get_tokens_for_student(student)

        response = client.post('/api/auth/logout/', {'refresh': tokens['refresh']}, format='json')
        self.assertEqual(response.status_code, 200)

        # Refresh with blacklisted token should fail
        anon = APIClient()
        refresh_response = anon.post('/api/token/refresh/', {'refresh': tokens['refresh']}, format='json')
        self.assertEqual(refresh_response.status_code, 401)
```

**Step 2: Run tests to verify they pass**

Run: `cd /Users/izzatbekkhamraev/XLOG/math/backend && python manage.py test tests.test_http_auth -v2`
Expected: All tests pass

**Step 3: Commit**

```bash
git add backend/tests/test_http_auth.py
git commit -m "test: add HTTP auth tests (Telegram HMAC, token refresh, logout, protection)"
```

---

## Task 3: Full Exam Lifecycle via HTTP

**Files:**
- Create: `backend/tests/test_http_exam.py`
- Reference: `backend/exams/student_views.py` (start_exam, save_answer, submit_exam, session_results)

**Step 1: Write test file**

```python
# backend/tests/test_http_exam.py
from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone

from exams.models import ExamSession, StudentAnswer, StudentRating, EloHistory
from tests.helpers import authenticated_client, admin_client, make_exam


class TestExamLifecycleHTTP(TestCase):
    """Full exam flow through HTTP: start -> save answers -> submit -> results."""

    def setUp(self):
        self.client, self.student = authenticated_client()
        _, self.admin = admin_client()
        self.exam = make_exam(self.admin)

    @patch('exams.notifications.notify_new_exam')
    def test_full_exam_flow(self, mock_notify):
        """Complete happy path: start -> answer all -> submit -> get results."""
        # 1. Start exam
        response = self.client.post(f'/api/exams/{self.exam.id}/start/')
        self.assertEqual(response.status_code, 201)
        data = response.json()
        session_id = data['session_id']
        self.assertIn('started_at', data)
        self.assertIn('duration', data)

        # 2. Save answers for all questions
        for q in range(1, 36):
            r = self.client.post(f'/api/sessions/{session_id}/answers/', {
                'question_number': q, 'answer': 'A',
            }, format='json')
            self.assertEqual(r.status_code, 200, f"Q{q} save failed: {r.json()}")

        for q in range(36, 46):
            for sub in ('a', 'b'):
                answer = '5' if sub == 'a' else '10'
                r = self.client.post(f'/api/sessions/{session_id}/answers/', {
                    'question_number': q, 'sub_part': sub, 'answer': answer,
                }, format='json')
                self.assertEqual(r.status_code, 200, f"Q{q}{sub} save failed: {r.json()}")

        # 3. Submit
        response = self.client.post(f'/api/sessions/{session_id}/submit/')
        self.assertEqual(response.status_code, 200)

        # 4. Verify DB state
        session = ExamSession.objects.get(id=session_id)
        self.assertEqual(session.status, 'submitted')
        self.assertEqual(StudentAnswer.objects.filter(session=session, is_correct=True).count(), 55)

        # 5. Verify ELO was updated
        rating = StudentRating.objects.get(student=self.student)
        self.assertGreater(rating.elo, 1200)
        self.assertTrue(EloHistory.objects.filter(session=session).exists())

        # 6. Get results (exam is still open, should be held back)
        response = self.client.get(f'/api/sessions/{session_id}/results/')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertFalse(data['exam_closed'])

        # 7. Force exam to close, then get results
        self.exam.scheduled_end = timezone.now() - timedelta(minutes=1)
        self.exam.save()

        response = self.client.get(f'/api/sessions/{session_id}/results/')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data['exam_closed'])
        self.assertEqual(data['exercises_correct'], 45)
        self.assertEqual(data['points'], 55)
        self.assertIn('breakdown', data)
        self.assertIn('elo', data)
        self.assertIn('letter_grade', data)

    def test_start_exam_returns_existing_session(self):
        """Starting twice returns same session, not error."""
        r1 = self.client.post(f'/api/exams/{self.exam.id}/start/')
        r2 = self.client.post(f'/api/exams/{self.exam.id}/start/')
        self.assertEqual(r1.json()['session_id'], r2.json()['session_id'])
        self.assertEqual(r2.status_code, 200)  # 200, not 201

    def test_cannot_start_closed_exam(self):
        """Can't start exam outside its window."""
        self.exam.scheduled_start = timezone.now() + timedelta(hours=5)
        self.exam.scheduled_end = timezone.now() + timedelta(hours=8)
        self.exam.save()

        response = self.client.post(f'/api/exams/{self.exam.id}/start/')
        self.assertEqual(response.status_code, 403)

    def test_cannot_save_answer_after_submit(self):
        """After submission, saving answers is forbidden."""
        r = self.client.post(f'/api/exams/{self.exam.id}/start/')
        session_id = r.json()['session_id']

        self.client.post(f'/api/sessions/{session_id}/submit/')

        response = self.client.post(f'/api/sessions/{session_id}/answers/', {
            'question_number': 1, 'answer': 'B',
        }, format='json')
        self.assertEqual(response.status_code, 403)

    def test_double_submit_is_forbidden(self):
        """Submitting twice returns 403."""
        r = self.client.post(f'/api/exams/{self.exam.id}/start/')
        session_id = r.json()['session_id']

        self.client.post(f'/api/sessions/{session_id}/submit/')
        response = self.client.post(f'/api/sessions/{session_id}/submit/')
        self.assertEqual(response.status_code, 403)


class TestAnswerValidation(TestCase):
    """Test answer save validation rules via HTTP."""

    def setUp(self):
        self.client, self.student = authenticated_client()
        _, self.admin = admin_client()
        self.exam = make_exam(self.admin)
        r = self.client.post(f'/api/exams/{self.exam.id}/start/')
        self.session_id = r.json()['session_id']

    def test_question_number_out_of_range(self):
        r = self.client.post(f'/api/sessions/{self.session_id}/answers/', {
            'question_number': 46, 'answer': 'X',
        }, format='json')
        self.assertEqual(r.status_code, 400)

    def test_mcq_with_sub_part_rejected(self):
        """Questions 1-35 should not have sub_part."""
        r = self.client.post(f'/api/sessions/{self.session_id}/answers/', {
            'question_number': 5, 'sub_part': 'a', 'answer': 'A',
        }, format='json')
        self.assertEqual(r.status_code, 400)

    def test_paired_without_sub_part_rejected(self):
        """Questions 36-45 require sub_part."""
        r = self.client.post(f'/api/sessions/{self.session_id}/answers/', {
            'question_number': 40, 'answer': '5',
        }, format='json')
        self.assertEqual(r.status_code, 400)

    def test_invalid_sub_part_rejected(self):
        r = self.client.post(f'/api/sessions/{self.session_id}/answers/', {
            'question_number': 40, 'sub_part': 'c', 'answer': '5',
        }, format='json')
        self.assertEqual(r.status_code, 400)

    def test_answer_too_long_rejected(self):
        r = self.client.post(f'/api/sessions/{self.session_id}/answers/', {
            'question_number': 1, 'answer': 'A' * 501,
        }, format='json')
        self.assertEqual(r.status_code, 400)

    def test_empty_answer_rejected(self):
        r = self.client.post(f'/api/sessions/{self.session_id}/answers/', {
            'question_number': 1, 'answer': '',
        }, format='json')
        self.assertEqual(r.status_code, 400)

    def test_answer_overwrite_works(self):
        """Saving same question twice overwrites the answer."""
        url = f'/api/sessions/{self.session_id}/answers/'
        self.client.post(url, {'question_number': 1, 'answer': 'A'}, format='json')
        self.client.post(url, {'question_number': 1, 'answer': 'B'}, format='json')

        from exams.models import StudentAnswer
        answer = StudentAnswer.objects.get(
            session_id=self.session_id, question_number=1
        )
        self.assertEqual(answer.answer, 'B')


class TestLateStart(TestCase):
    """Test exam with reduced time for late starters."""

    def setUp(self):
        self.client, self.student = authenticated_client()
        _, self.admin = admin_client()

    def test_late_start_gets_reduced_duration(self):
        """Starting exam 140 minutes into window gives ~10 minutes."""
        exam = make_exam(self.admin, start_offset=-140, end_offset=10, duration=150)
        response = self.client.post(f'/api/exams/{exam.id}/start/')
        self.assertEqual(response.status_code, 201)
        duration = response.json()['duration']
        self.assertLessEqual(duration, 11)
        self.assertGreater(duration, 0)

    def test_on_time_start_gets_full_duration(self):
        exam = make_exam(self.admin, start_offset=-1, end_offset=180, duration=150)
        response = self.client.post(f'/api/exams/{exam.id}/start/')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['duration'], 150)


class TestOtherStudentIsolation(TestCase):
    """Verify students can't access each other's sessions."""

    def setUp(self):
        _, self.admin = admin_client()
        self.exam = make_exam(self.admin)
        self.client_a, self.student_a = authenticated_client(
            make_student(telegram_id=200001, full_name="Student A")
        )
        self.client_b, self.student_b = authenticated_client(
            make_student(telegram_id=200002, full_name="Student B")
        )

    def test_cannot_save_answer_to_other_students_session(self):
        r = self.client_a.post(f'/api/exams/{self.exam.id}/start/')
        session_id = r.json()['session_id']

        # Student B tries to save to Student A's session
        response = self.client_b.post(f'/api/sessions/{session_id}/answers/', {
            'question_number': 1, 'answer': 'A',
        }, format='json')
        self.assertEqual(response.status_code, 404)

    def test_cannot_submit_other_students_session(self):
        r = self.client_a.post(f'/api/exams/{self.exam.id}/start/')
        session_id = r.json()['session_id']

        response = self.client_b.post(f'/api/sessions/{session_id}/submit/')
        self.assertEqual(response.status_code, 404)

    def test_cannot_view_other_students_results(self):
        r = self.client_a.post(f'/api/exams/{self.exam.id}/start/')
        session_id = r.json()['session_id']
        self.client_a.post(f'/api/sessions/{session_id}/submit/')

        response = self.client_b.get(f'/api/sessions/{session_id}/results/')
        self.assertEqual(response.status_code, 404)
```

**Step 2: Run tests**

Run: `cd /Users/izzatbekkhamraev/XLOG/math/backend && python manage.py test tests.test_http_exam -v2`
Expected: All tests pass

**Step 3: Commit**

```bash
git add backend/tests/test_http_exam.py
git commit -m "test: add HTTP exam lifecycle tests (full flow, validation, isolation)"
```

---

## Task 4: Admin Endpoints via HTTP

**Files:**
- Create: `backend/tests/test_http_admin.py`
- Reference: `backend/exams/views.py` (all admin_ views)

**Step 1: Write test file**

```python
# backend/tests/test_http_admin.py
import io
from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone

from exams.models import MockExam, CorrectAnswer, ExamSession
from tests.helpers import admin_client, authenticated_client, make_student, make_exam


class TestAdminExamCRUD(TestCase):
    """Test admin exam create/update/delete via HTTP."""

    def setUp(self):
        self.client, self.admin = admin_client()

    @patch('exams.tasks.send_exam_notification.delay')
    def test_create_exam(self, mock_notify):
        now = timezone.now()
        pdf = io.BytesIO(b'%PDF-1.4 fake pdf content')
        pdf.name = 'test.pdf'

        response = self.client.post('/api/admin/exams/', {
            'title': 'Test Exam',
            'pdf_file': pdf,
            'scheduled_start': (now + timedelta(hours=1)).isoformat(),
            'scheduled_end': (now + timedelta(hours=4)).isoformat(),
            'duration': 150,
        }, format='multipart')

        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data['title'], 'Test Exam')
        self.assertIn('id', data)
        mock_notify.assert_called_once()

    def test_list_exams(self):
        make_exam(self.admin)
        response = self.client.get('/api/admin/exams/')
        self.assertEqual(response.status_code, 200)
        self.assertGreaterEqual(len(response.json()), 1)

    def test_delete_exam_without_sessions(self):
        exam = make_exam(self.admin)
        response = self.client.delete(f'/api/admin/exams/{exam.id}/')
        self.assertEqual(response.status_code, 204)
        self.assertFalse(MockExam.objects.filter(id=exam.id).exists())

    def test_delete_exam_with_sessions_blocked(self):
        exam = make_exam(self.admin)
        student = make_student()
        ExamSession.objects.create(student=student, exam=exam, status='submitted')

        response = self.client.delete(f'/api/admin/exams/{exam.id}/')
        self.assertEqual(response.status_code, 400)
        self.assertTrue(MockExam.objects.filter(id=exam.id).exists())

    def test_update_exam_title(self):
        exam = make_exam(self.admin)
        response = self.client.put(f'/api/admin/exams/{exam.id}/', {
            'title': 'Updated Title',
        }, format='json')
        self.assertEqual(response.status_code, 200)
        exam.refresh_from_db()
        self.assertEqual(exam.title, 'Updated Title')

    def test_schedule_lock_after_students_start(self):
        """Cannot change schedule once students have started."""
        exam = make_exam(self.admin)
        student = make_student()
        ExamSession.objects.create(student=student, exam=exam, status='in_progress')

        response = self.client.put(f'/api/admin/exams/{exam.id}/', {
            'scheduled_start': (timezone.now() + timedelta(hours=5)).isoformat(),
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_title_change_still_allowed_with_sessions(self):
        """Non-schedule fields can still be changed."""
        exam = make_exam(self.admin)
        student = make_student()
        ExamSession.objects.create(student=student, exam=exam)

        response = self.client.put(f'/api/admin/exams/{exam.id}/', {
            'title': 'New Title',
        }, format='json')
        self.assertEqual(response.status_code, 200)


class TestAdminAnswerUpload(TestCase):
    """Test bulk answer upload via HTTP."""

    def setUp(self):
        self.client, self.admin = admin_client()
        self.exam = make_exam(self.admin)

    def test_upload_answers_replaces_existing(self):
        new_answers = [
            {'question_number': 1, 'sub_part': None, 'correct_answer': 'B'},
            {'question_number': 2, 'sub_part': None, 'correct_answer': 'C'},
        ]
        response = self.client.post(
            f'/api/admin/exams/{self.exam.id}/answers/',
            {'answers': new_answers},
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        # Old answers replaced
        self.assertEqual(
            CorrectAnswer.objects.filter(exam=self.exam).count(), 2
        )


class TestAdminResults(TestCase):
    """Test admin results and analytics endpoints."""

    def setUp(self):
        self.client, self.admin = admin_client()
        self.exam = make_exam(self.admin)

    def test_exam_results_endpoint(self):
        response = self.client.get(f'/api/admin/exams/{self.exam.id}/results/')
        self.assertEqual(response.status_code, 200)
        self.assertIsInstance(response.json(), list)

    def test_item_analysis_no_calibration(self):
        """Item analysis with no Rasch data returns empty items."""
        response = self.client.get(f'/api/admin/exams/{self.exam.id}/item-analysis/')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['items'], [])
        self.assertEqual(data['total_participants'], 0)

    def test_analytics_endpoint(self):
        response = self.client.get('/api/admin/analytics/')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn('total_students', data)
        self.assertIn('total_exams', data)
        self.assertIn('score_distribution', data)


class TestAdminAuthRequired(TestCase):
    """Verify admin endpoints reject non-admin users."""

    def test_student_cannot_access_admin_exams(self):
        client, _ = authenticated_client()
        response = client.get('/api/admin/exams/')
        self.assertIn(response.status_code, [401, 403])

    def test_anonymous_cannot_access_admin_exams(self):
        from rest_framework.test import APIClient
        client = APIClient()
        response = client.get('/api/admin/exams/')
        self.assertIn(response.status_code, [401, 403])

    def test_anonymous_cannot_access_analytics(self):
        from rest_framework.test import APIClient
        client = APIClient()
        response = client.get('/api/admin/analytics/')
        self.assertIn(response.status_code, [401, 403])
```

**Step 2: Run tests**

Run: `cd /Users/izzatbekkhamraev/XLOG/math/backend && python manage.py test tests.test_http_admin -v2`
Expected: All tests pass

**Step 3: Commit**

```bash
git add backend/tests/test_http_admin.py
git commit -m "test: add HTTP admin tests (CRUD, schedule lock, auth protection)"
```

---

## Task 5: Dashboard, History, Leaderboard via HTTP

**Files:**
- Create: `backend/tests/test_http_dashboard.py`
- Reference: `backend/exams/dashboard_views.py`, `backend/exams/leaderboard_views.py`

**Step 1: Write test file**

```python
# backend/tests/test_http_dashboard.py
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from exams.models import (
    ExamSession, StudentAnswer, StudentRating, StudentStreak,
    Achievement, StudentAchievement,
)
from exams.student_views import _submit_session
from tests.helpers import authenticated_client, admin_client, make_student, make_exam


class TestDashboardHTTP(TestCase):
    """Test GET /api/me/dashboard/ response structure."""

    def setUp(self):
        self.client, self.student = authenticated_client()

    def test_dashboard_new_student(self):
        """New student gets default values."""
        response = self.client.get('/api/me/dashboard/')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['elo'], 1200)
        self.assertIsNone(data['rasch_scaled'])
        self.assertEqual(data['current_streak'], 0)
        self.assertEqual(data['achievements'], [])

    def test_dashboard_with_rating(self):
        StudentRating.objects.create(student=self.student, elo=1500, exams_taken=3, rasch_scaled=72.5)
        StudentStreak.objects.create(student=self.student, current_streak=3, longest_streak=5)

        response = self.client.get('/api/me/dashboard/')
        data = response.json()
        self.assertEqual(data['elo'], 1500)
        self.assertEqual(data['rasch_scaled'], 72.5)
        self.assertEqual(data['current_streak'], 3)

    def test_dashboard_includes_upcoming_exam(self):
        _, admin = admin_client()
        make_exam(admin, start_offset=60, end_offset=240)

        response = self.client.get('/api/me/dashboard/')
        data = response.json()
        self.assertIsNotNone(data['upcoming_exam'])
        self.assertIn('id', data['upcoming_exam'])
        self.assertIn('title', data['upcoming_exam'])


class TestHistoryHTTP(TestCase):
    """Test GET /api/me/history/ response structure."""

    def setUp(self):
        self.client, self.student = authenticated_client()
        _, self.admin = admin_client()

    def test_empty_history(self):
        response = self.client.get('/api/me/history/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    def test_history_after_exam(self):
        exam = make_exam(self.admin)
        session = ExamSession.objects.create(
            student=self.student, exam=exam, status='in_progress',
        )
        StudentAnswer.objects.create(
            session=session, question_number=1, sub_part=None, answer='A'
        )
        _submit_session(session)

        response = self.client.get('/api/me/history/')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 1)
        self.assertIn('exam_title', data[0])
        self.assertIn('exercises_correct', data[0])
        self.assertIn('elo_delta', data[0])


class TestAchievementsHTTP(TestCase):
    """Test GET /api/me/achievements/ response structure."""

    def setUp(self):
        self.client, self.student = authenticated_client()
        self.achievement = Achievement.objects.create(
            type='milestone', name='Beginner', description='Reach 25',
            threshold=25, icon='star',
        )

    def test_achievements_shows_all_with_earned_status(self):
        response = self.client.get('/api/me/achievements/')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 1)
        self.assertFalse(data[0]['earned'])

    def test_earned_achievement_flagged(self):
        StudentAchievement.objects.create(
            student=self.student, achievement=self.achievement,
        )
        response = self.client.get('/api/me/achievements/')
        data = response.json()
        self.assertTrue(data[0]['earned'])
        self.assertIsNotNone(data[0]['earned_at'])


class TestLeaderboardHTTP(TestCase):
    """Test GET /api/leaderboard/ response structure."""

    def test_empty_leaderboard(self):
        from rest_framework.test import APIClient
        response = APIClient().get('/api/leaderboard/')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['tab'], 'top_rated')
        self.assertEqual(data['entries'], [])

    def test_leaderboard_with_students(self):
        for i in range(5):
            s = make_student(telegram_id=300000 + i, full_name=f"Student {i}")
            StudentRating.objects.create(student=s, elo=1200 + i * 50, exams_taken=1)

        response = APIClient().get('/api/leaderboard/')
        data = response.json()
        self.assertEqual(len(data['entries']), 5)
        # Sorted by ELO descending
        elos = [e['elo'] for e in data['entries']]
        self.assertEqual(elos, sorted(elos, reverse=True))

    def test_leaderboard_includes_current_user_flag(self):
        student = make_student(telegram_id=400001)
        StudentRating.objects.create(student=student, elo=1500, exams_taken=1)
        client, _ = authenticated_client(student)

        response = client.get('/api/leaderboard/')
        data = response.json()
        current = [e for e in data['entries'] if e['is_current_user']]
        self.assertEqual(len(current), 1)


class TestEloHistoryHTTP(TestCase):
    """Test GET /api/me/elo-history/ response structure."""

    def setUp(self):
        self.client, self.student = authenticated_client()

    def test_elo_history_empty(self):
        response = self.client.get('/api/me/elo-history/')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['current_elo'], 1200)
        self.assertEqual(data['history'], [])
```

Need to add the missing import at top of `TestLeaderboardHTTP`:
```python
from rest_framework.test import APIClient
```

**Step 2: Run tests**

Run: `cd /Users/izzatbekkhamraev/XLOG/math/backend && python manage.py test tests.test_http_dashboard -v2`
Expected: All tests pass

**Step 3: Commit**

```bash
git add backend/tests/test_http_dashboard.py
git commit -m "test: add HTTP dashboard, history, leaderboard, achievements tests"
```

---

## Task 6: API Response Contract Tests

**Files:**
- Create: `backend/tests/test_http_contracts.py`
- Purpose: Verify exact JSON field names match what frontend expects

**Step 1: Write test file**

```python
# backend/tests/test_http_contracts.py
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from exams.models import ExamSession, StudentAnswer
from exams.student_views import _submit_session
from tests.helpers import authenticated_client, admin_client, make_exam


class TestResultsContract(TestCase):
    """Verify /api/sessions/{id}/results/ returns exact field names frontend expects."""

    def setUp(self):
        self.client, self.student = authenticated_client()
        _, self.admin = admin_client()
        self.exam = make_exam(self.admin, start_offset=-180, end_offset=-1)
        self.session = ExamSession.objects.create(
            student=self.student, exam=self.exam, status='in_progress',
        )
        for q in range(1, 36):
            StudentAnswer.objects.create(
                session=self.session, question_number=q, sub_part=None, answer='A'
            )
        _submit_session(self.session)

    def test_results_response_fields(self):
        response = self.client.get(f'/api/sessions/{self.session.id}/results/')
        self.assertEqual(response.status_code, 200)
        data = response.json()

        # Required top-level fields
        required_fields = [
            'exercises_correct', 'exercises_total', 'points', 'points_total',
            'is_auto_submitted', 'exam_closed', 'exam_title',
            'breakdown', 'elo', 'letter_grade', 'rasch_scaled',
        ]
        for field in required_fields:
            self.assertIn(field, data, f"Missing field: {field}")

        # Breakdown item fields
        if data['breakdown']:
            item = data['breakdown'][0]
            for field in ['question_number', 'sub_part', 'is_correct', 'student_answer', 'correct_answer']:
                self.assertIn(field, item, f"Missing breakdown field: {field}")

        # ELO fields
        if data['elo']:
            for field in ['elo_before', 'elo_after', 'elo_delta']:
                self.assertIn(field, data['elo'], f"Missing elo field: {field}")


class TestDashboardContract(TestCase):
    """Verify /api/me/dashboard/ returns exact field names frontend expects."""

    def test_dashboard_response_fields(self):
        client, _ = authenticated_client()
        response = client.get('/api/me/dashboard/')
        data = response.json()

        required_fields = [
            'elo', 'rasch_scaled', 'exams_taken',
            'current_streak', 'longest_streak',
            'achievements', 'upcoming_exam',
        ]
        for field in required_fields:
            self.assertIn(field, data, f"Missing field: {field}")


class TestHistoryContract(TestCase):
    """Verify /api/me/history/ returns exact field names frontend expects."""

    def setUp(self):
        self.client, self.student = authenticated_client()
        _, admin = admin_client()
        exam = make_exam(admin)
        session = ExamSession.objects.create(
            student=self.student, exam=exam, status='in_progress',
        )
        StudentAnswer.objects.create(
            session=session, question_number=1, sub_part=None, answer='A'
        )
        _submit_session(session)

    def test_history_response_fields(self):
        response = self.client.get('/api/me/history/')
        data = response.json()
        self.assertGreaterEqual(len(data), 1)

        entry = data[0]
        required_fields = [
            'session_id', 'exam_id', 'exam_title', 'submitted_at',
            'exercises_correct', 'exercises_total',
            'rasch_scaled', 'elo_delta', 'is_auto_submitted',
        ]
        for field in required_fields:
            self.assertIn(field, entry, f"Missing field: {field}")


class TestLeaderboardContract(TestCase):
    """Verify /api/leaderboard/ returns exact field names frontend expects."""

    def test_leaderboard_response_fields(self):
        from rest_framework.test import APIClient
        response = APIClient().get('/api/leaderboard/')
        data = response.json()

        self.assertIn('tab', data)
        self.assertIn('entries', data)
        self.assertIn('my_entry', data)


class TestStartExamContract(TestCase):
    """Verify POST /api/exams/{id}/start/ returns exact field names."""

    def test_start_response_fields(self):
        client, _ = authenticated_client()
        _, admin = admin_client()
        exam = make_exam(admin)

        response = client.post(f'/api/exams/{exam.id}/start/')
        data = response.json()

        for field in ['session_id', 'started_at', 'duration']:
            self.assertIn(field, data, f"Missing field: {field}")
```

**Step 2: Run tests**

Run: `cd /Users/izzatbekkhamraev/XLOG/math/backend && python manage.py test tests.test_http_contracts -v2`
Expected: All tests pass

**Step 3: Commit**

```bash
git add backend/tests/test_http_contracts.py
git commit -m "test: add API response contract tests (field validation)"
```

---

## Task 7: Multi-Student and Concurrent Scenarios

**Files:**
- Create: `backend/tests/test_http_multi_student.py`
- Purpose: Verify scoring works correctly when multiple students take the same exam

**Step 1: Write test file**

```python
# backend/tests/test_http_multi_student.py
from django.test import TestCase

from exams.models import ExamSession, StudentAnswer, StudentRating, EloHistory
from exams.student_views import _submit_session
from exams.scoring import compute_letter_grade
from tests.helpers import authenticated_client, admin_client, make_student, make_exam


class TestMultiStudentExam(TestCase):
    """Test scoring when multiple students take the same exam."""

    def setUp(self):
        _, self.admin = admin_client()
        self.exam = make_exam(self.admin)

        # Create 10 students with different scores
        self.students = []
        self.sessions = []
        for i in range(10):
            student = make_student(telegram_id=500000 + i, full_name=f"Student {i}")
            self.students.append(student)

            session = ExamSession.objects.create(
                student=student, exam=self.exam, status='in_progress',
            )
            self.sessions.append(session)

            # Student i answers first (i+1)*3 questions correctly
            correct_count = min((i + 1) * 3, 35)
            for q in range(1, correct_count + 1):
                StudentAnswer.objects.create(
                    session=session, question_number=q, sub_part=None, answer='A'
                )
            # Wrong answers for the rest
            for q in range(correct_count + 1, 36):
                StudentAnswer.objects.create(
                    session=session, question_number=q, sub_part=None, answer='X'
                )

    def test_all_students_get_elo_updates(self):
        for session in self.sessions:
            _submit_session(session)

        for student in self.students:
            self.assertTrue(
                StudentRating.objects.filter(student=student).exists(),
                f"{student.full_name} missing rating"
            )
            self.assertTrue(
                EloHistory.objects.filter(student=student).exists(),
                f"{student.full_name} missing ELO history"
            )

    def test_better_scores_get_higher_elo(self):
        for session in self.sessions:
            _submit_session(session)

        elos = [
            StudentRating.objects.get(student=s).elo
            for s in self.students
        ]
        # Students with more correct answers should generally have higher ELO
        # (not strictly monotonic due to opponent rating, but top > bottom)
        self.assertGreater(elos[-1], elos[0])

    def test_letter_grades_distribute(self):
        """With 10 students, grades should span from A+ to D."""
        for session in self.sessions:
            _submit_session(session)

        all_points = [
            StudentAnswer.objects.filter(session=s, is_correct=True).count()
            for s in self.sessions
        ]

        grades = [compute_letter_grade(p, all_points) for p in all_points]
        # Best student should get A+, worst should get D
        self.assertEqual(grades[-1], 'A+')
        self.assertEqual(grades[0], 'D')


class TestMultiStudentHTTP(TestCase):
    """Test multi-student scenarios through HTTP endpoints."""

    def setUp(self):
        _, self.admin = admin_client()
        self.exam = make_exam(self.admin)

    def test_two_students_take_same_exam_via_http(self):
        client_a, student_a = authenticated_client(
            make_student(telegram_id=600001, full_name="Alice")
        )
        client_b, student_b = authenticated_client(
            make_student(telegram_id=600002, full_name="Bob")
        )

        # Both start
        r_a = client_a.post(f'/api/exams/{self.exam.id}/start/')
        r_b = client_b.post(f'/api/exams/{self.exam.id}/start/')
        self.assertEqual(r_a.status_code, 201)
        self.assertEqual(r_b.status_code, 201)

        sid_a = r_a.json()['session_id']
        sid_b = r_b.json()['session_id']
        self.assertNotEqual(sid_a, sid_b)

        # Alice answers all correctly, Bob answers none
        for q in range(1, 36):
            client_a.post(f'/api/sessions/{sid_a}/answers/', {
                'question_number': q, 'answer': 'A',
            }, format='json')

        # Both submit
        self.assertEqual(client_a.post(f'/api/sessions/{sid_a}/submit/').status_code, 200)
        self.assertEqual(client_b.post(f'/api/sessions/{sid_b}/submit/').status_code, 200)

        # Both have ELO
        rating_a = StudentRating.objects.get(student=student_a)
        rating_b = StudentRating.objects.get(student=student_b)
        self.assertGreater(rating_a.elo, rating_b.elo)
```

**Step 2: Run tests**

Run: `cd /Users/izzatbekkhamraev/XLOG/math/backend && python manage.py test tests.test_http_multi_student -v2`
Expected: All tests pass

**Step 3: Commit**

```bash
git add backend/tests/test_http_multi_student.py
git commit -m "test: add multi-student exam tests (ELO, grades, HTTP isolation)"
```

---

## Task 8: Run Full Test Suite and Verify

**Step 1: Run all tests together**

Run: `cd /Users/izzatbekkhamraev/XLOG/math/backend && python manage.py test -v2`
Expected: All tests pass (existing 60 + new ~55 = ~115 total)

**Step 2: Run with coverage report (if available)**

Run: `cd /Users/izzatbekkhamraev/XLOG/math/backend && pip install coverage && coverage run manage.py test && coverage report --include='exams/*' --show-missing`

**Step 3: Final commit**

```bash
git commit --allow-empty -m "test: HTTP integration test suite complete — 8 tasks done"
```

---

## Summary

| Task | File | Tests | What It Proves |
|------|------|-------|----------------|
| 1 | `helpers.py` | — | Auth + factory utilities |
| 2 | `test_http_auth.py` | ~12 | Telegram HMAC, token refresh, logout, permission gates |
| 3 | `test_http_exam.py` | ~16 | Full exam lifecycle, validation, late start, student isolation |
| 4 | `test_http_admin.py` | ~12 | CRUD, schedule lock, answer upload, auth protection |
| 5 | `test_http_dashboard.py` | ~10 | Dashboard, history, achievements, leaderboard, ELO history |
| 6 | `test_http_contracts.py` | ~5 | JSON field names match frontend expectations |
| 7 | `test_http_multi_student.py` | ~5 | Multi-student ELO, grade distribution, HTTP isolation |
| 8 | Full suite run | ~115 | Everything works together |

**After this plan, the test suite proves:**
- Auth system rejects invalid/expired tokens (**security**)
- Endpoints return correct status codes and JSON (**contracts**)
- Students can't access each other's data (**isolation**)
- Full exam flow works end-to-end (**functionality**)
- Admin CRUD and schedule lock work (**admin safety**)
- Multi-student scoring produces correct relative results (**correctness**)
