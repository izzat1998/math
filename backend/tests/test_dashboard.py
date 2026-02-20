from django.test import TestCase
from django.utils import timezone
from datetime import timedelta
from exams.models import Student, StudentRating, StudentStreak, MockExam, ExamSession
from django.contrib.auth.models import User


class TestDashboardData(TestCase):
    def setUp(self):
        self.student = Student.objects.create(full_name="Dashboard Test", telegram_id=33333)
        StudentRating.objects.create(student=self.student, elo=1350, rasch_scaled=62.5)
        StudentStreak.objects.create(student=self.student, current_streak=3, longest_streak=5)

    def test_dashboard_data_structure(self):
        from exams.dashboard_views import _get_dashboard_data
        data = _get_dashboard_data(self.student)
        self.assertEqual(data['elo'], 1350)
        self.assertEqual(data['rasch_scaled'], 62.5)
        self.assertEqual(data['current_streak'], 3)
        self.assertEqual(data['longest_streak'], 5)
        self.assertIn('upcoming_exam', data)
        self.assertIn('achievements', data)
        self.assertIn('exams_taken', data)

    def test_dashboard_defaults_without_rating(self):
        student2 = Student.objects.create(full_name="New Student", telegram_id=33334)
        from exams.dashboard_views import _get_dashboard_data
        data = _get_dashboard_data(student2)
        self.assertEqual(data['elo'], 1200)
        self.assertIsNone(data['rasch_scaled'])
        self.assertEqual(data['current_streak'], 0)


class TestExamHistory(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user('admin', password='test')
        self.student = Student.objects.create(full_name="History Test", telegram_id=44444)
        now = timezone.now()
        self.exam = MockExam.objects.create(
            title="Past Exam",
            scheduled_start=now - timedelta(hours=5),
            scheduled_end=now - timedelta(hours=2),
            duration=150,
            created_by=self.admin,
        )
        self.session = ExamSession.objects.create(
            student=self.student, exam=self.exam,
            status='submitted', submitted_at=now - timedelta(hours=3),
        )

    def test_history_returns_past_exams(self):
        from exams.dashboard_views import _get_exam_history
        history = _get_exam_history(self.student)
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]['exam_title'], 'Past Exam')
        self.assertIn('session_id', history[0])
        self.assertIn('submitted_at', history[0])

    def test_empty_history(self):
        student2 = Student.objects.create(full_name="New", telegram_id=44445)
        from exams.dashboard_views import _get_exam_history
        history = _get_exam_history(student2)
        self.assertEqual(len(history), 0)
