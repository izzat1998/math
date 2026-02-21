from django.test import TestCase, override_settings

from exams.models import ExamSession, StudentAnswer
from exams.student_views import _submit_session
from tests.helpers import authenticated_client, admin_client, make_exam


@override_settings(SECURE_SSL_REDIRECT=False)
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


@override_settings(SECURE_SSL_REDIRECT=False)
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


@override_settings(SECURE_SSL_REDIRECT=False)
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


@override_settings(SECURE_SSL_REDIRECT=False)
class TestLeaderboardContract(TestCase):
    """Verify /api/leaderboard/ returns exact field names frontend expects."""

    def test_leaderboard_response_fields(self):
        from rest_framework.test import APIClient
        response = APIClient().get('/api/leaderboard/')
        data = response.json()

        self.assertIn('tab', data)
        self.assertIn('entries', data)
        self.assertIn('my_entry', data)


@override_settings(SECURE_SSL_REDIRECT=False)
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
