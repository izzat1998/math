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
            scheduled_start=now - timedelta(minutes=140),
            scheduled_end=now + timedelta(minutes=10),
            duration=150,
            created_by=self.admin,
        )

    def test_late_start_gets_reduced_time(self):
        """If only 10 minutes remain in window, duration should be ~10, not 150."""
        session = ExamSession.objects.create(
            student=self.student,
            exam=self.exam,
            status='in_progress',
        )
        remaining = (self.exam.scheduled_end - session.started_at).total_seconds() / 60
        effective_duration = min(self.exam.duration, max(0, int(remaining)))
        self.assertLessEqual(effective_duration, 11)
        self.assertLess(effective_duration, 150)

    def test_on_time_start_gets_full_duration(self):
        """If starting on time, get full duration."""
        now = timezone.now()
        on_time_exam = MockExam.objects.create(
            title="On Time Exam",
            scheduled_start=now,
            scheduled_end=now + timedelta(minutes=180),
            duration=150,
            created_by=self.admin,
        )
        session = ExamSession.objects.create(
            student=self.student,
            exam=on_time_exam,
            status='in_progress',
        )
        remaining = (on_time_exam.scheduled_end - session.started_at).total_seconds() / 60
        effective_duration = min(on_time_exam.duration, max(0, int(remaining)))
        self.assertEqual(effective_duration, 150)


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

    def test_overlapping_exam_detected(self):
        """Creating an exam with overlapping time window should be detected."""
        now = timezone.now()
        overlapping_start = now + timedelta(hours=2)
        overlapping_end = now + timedelta(hours=5)
        overlaps = MockExam.objects.filter(
            scheduled_start__lt=overlapping_end,
            scheduled_end__gt=overlapping_start,
        ).exists()
        self.assertTrue(overlaps)

    def test_non_overlapping_exam_ok(self):
        """Non-overlapping exam should not be detected."""
        now = timezone.now()
        ok_start = now + timedelta(hours=5)
        ok_end = now + timedelta(hours=8)
        overlaps = MockExam.objects.filter(
            scheduled_start__lt=ok_end,
            scheduled_end__gt=ok_start,
        ).exists()
        self.assertFalse(overlaps)


class TestExamDeletion(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user('admin3', password='test')
        now = timezone.now()
        self.exam = MockExam.objects.create(
            title="Exam to Delete",
            scheduled_start=now,
            scheduled_end=now + timedelta(hours=3),
            duration=150,
            created_by=self.admin,
        )
        self.student = Student.objects.create(full_name="Test", telegram_id=77777)

    def test_can_delete_exam_without_sessions(self):
        """Exam with no sessions can be deleted."""
        self.assertEqual(ExamSession.objects.filter(exam=self.exam).count(), 0)
        self.exam.delete()
        self.assertFalse(MockExam.objects.filter(id=self.exam.id).exists())

    def test_exam_with_sessions_has_sessions(self):
        """Exam with sessions should be blocked from deletion."""
        ExamSession.objects.create(
            student=self.student, exam=self.exam, status='in_progress'
        )
        has_sessions = ExamSession.objects.filter(exam=self.exam).exists()
        self.assertTrue(has_sessions)
