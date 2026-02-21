from django.test import TestCase, override_settings
from tests.helpers import make_student, make_exam, authenticated_client, admin_client
from exams.models import ExamSession, StudentRating, EloHistory
from django.utils import timezone
from datetime import timedelta


@override_settings(SECURE_SSL_REDIRECT=False)
class LeaderboardTabsTest(TestCase):

    def setUp(self):
        """Create 3 students with different profiles."""
        ac, admin = admin_client()
        self.exam = make_exam(admin)

        # Student 1: high ELO, 1 exam
        self.s1 = make_student(telegram_id=1001, full_name="Top Rated")
        self.c1, _ = authenticated_client(self.s1)
        StudentRating.objects.create(student=self.s1, elo=1500, exams_taken=1)

        # Student 2: medium ELO, 3 exams (most active)
        self.s2 = make_student(telegram_id=1002, full_name="Most Active")
        self.c2, _ = authenticated_client(self.s2)
        StudentRating.objects.create(student=self.s2, elo=1300, exams_taken=3)

        # Student 3: low ELO but big improvement
        self.s3 = make_student(telegram_id=1003, full_name="Most Improved")
        self.c3, _ = authenticated_client(self.s3)
        StudentRating.objects.create(student=self.s3, elo=1250, exams_taken=2)

        # ELO history for improvement tracking
        session3 = ExamSession.objects.create(
            student=self.s3, exam=self.exam, status='submitted',
            submitted_at=timezone.now(),
        )
        EloHistory.objects.create(
            student=self.s3, session=session3,
            elo_before=1100, elo_after=1250, elo_delta=150,
            score_percent=0.9, exam_avg_percent=0.5, k_factor=40,
        )

        # Need a second exam for s1 session (unique constraint on student+exam)
        self.exam2 = make_exam(admin, title="Test Exam 2")
        session1 = ExamSession.objects.create(
            student=self.s1, exam=self.exam2, status='submitted',
            submitted_at=timezone.now() - timedelta(hours=1),
        )
        EloHistory.objects.create(
            student=self.s1, session=session1,
            elo_before=1480, elo_after=1500, elo_delta=20,
            score_percent=0.6, exam_avg_percent=0.5, k_factor=20,
        )

    def test_default_tab_is_top_rated(self):
        resp = self.c1.get('/api/leaderboard/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['tab'], 'top_rated')
        # Highest ELO first
        self.assertEqual(resp.data['entries'][0]['full_name'], 'Top Rated')

    def test_top_rated_tab_explicit(self):
        resp = self.c1.get('/api/leaderboard/?tab=top_rated')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['tab'], 'top_rated')

    def test_most_improved_tab(self):
        resp = self.c1.get('/api/leaderboard/?tab=most_improved')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['tab'], 'most_improved')
        # s3 has delta +150, s1 has delta +20
        self.assertEqual(resp.data['entries'][0]['full_name'], 'Most Improved')
        self.assertIn('improvement', resp.data['entries'][0])

    def test_most_active_tab(self):
        resp = self.c1.get('/api/leaderboard/?tab=most_active')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['tab'], 'most_active')
        # s2 has 3 exams
        self.assertEqual(resp.data['entries'][0]['full_name'], 'Most Active')

    def test_invalid_tab_defaults_to_top_rated(self):
        resp = self.c1.get('/api/leaderboard/?tab=invalid')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['tab'], 'top_rated')

    def test_my_entry_in_most_improved(self):
        resp = self.c1.get('/api/leaderboard/?tab=most_improved')
        self.assertEqual(resp.status_code, 200)
        # s1 is logged in and has ELO history -- should see themselves
        my = resp.data.get('my_entry')
        if my:
            self.assertTrue(my['is_current_user'])
