from django.core.cache import cache
from django.test import TestCase, override_settings

from exams.models import (
    ExamSession, StudentAnswer, StudentRating, StudentStreak,
    Achievement, StudentAchievement,
)
from exams.student_views import _submit_session
from rest_framework.test import APIClient
from tests.helpers import authenticated_client, admin_client, make_student, make_exam


@override_settings(SECURE_SSL_REDIRECT=False)
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


@override_settings(SECURE_SSL_REDIRECT=False)
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


@override_settings(SECURE_SSL_REDIRECT=False)
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
        # May have seeded achievements + our test one
        test_achievement = [a for a in data if a['name'] == 'Beginner']
        self.assertEqual(len(test_achievement), 1)
        self.assertFalse(test_achievement[0]['earned'])

    def test_earned_achievement_flagged(self):
        StudentAchievement.objects.create(
            student=self.student, achievement=self.achievement,
        )
        response = self.client.get('/api/me/achievements/')
        data = response.json()
        test_achievement = [a for a in data if a['name'] == 'Beginner']
        self.assertTrue(test_achievement[0]['earned'])
        self.assertIsNotNone(test_achievement[0]['earned_at'])


@override_settings(SECURE_SSL_REDIRECT=False)
class TestLeaderboardHTTP(TestCase):
    """Test GET /api/leaderboard/ response structure."""

    def setUp(self):
        cache.clear()  # Reset leaderboard cache between tests

    def test_empty_leaderboard(self):
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


@override_settings(SECURE_SSL_REDIRECT=False)
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
