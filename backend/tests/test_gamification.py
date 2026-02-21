from django.test import TestCase
from django.utils import timezone
from datetime import timedelta
from exams.models import Student, StudentStreak, MockExam, ExamSession, Achievement, StudentAchievement, StudentRating
from exams.gamification import update_streak, check_streak_broken, check_and_award_achievements
from django.contrib.auth.models import User


class TestStreakLogic(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user('admin', password='test')
        self.student = Student.objects.create(full_name="Streak User", telegram_id=55555)

    def test_first_exam_starts_streak_at_1(self):
        update_streak(self.student)
        streak = StudentStreak.objects.get(student=self.student)
        self.assertEqual(streak.current_streak, 1)

    def test_consecutive_exams_increment_streak(self):
        now = timezone.now()
        for i in range(2):
            exam = MockExam.objects.create(
                title=f"Streak {i}", scheduled_start=now + timedelta(weeks=i),
                scheduled_end=now + timedelta(weeks=i, hours=3),
                duration=150, created_by=self.admin,
            )
            update_streak(self.student, exam)
        streak = StudentStreak.objects.get(student=self.student)
        self.assertEqual(streak.current_streak, 2)

    def test_longest_streak_tracked(self):
        now = timezone.now()
        for i in range(5):
            exam = MockExam.objects.create(
                title=f"Streak {i}", scheduled_start=now + timedelta(weeks=i),
                scheduled_end=now + timedelta(weeks=i, hours=3),
                duration=150, created_by=self.admin,
            )
            update_streak(self.student, exam)
        streak = StudentStreak.objects.get(student=self.student)
        self.assertEqual(streak.longest_streak, 5)

    def test_streak_break_resets_current(self):
        now = timezone.now()
        exam1 = MockExam.objects.create(
            title="Exam 1", scheduled_start=now - timedelta(days=14),
            scheduled_end=now - timedelta(days=14) + timedelta(hours=3),
            duration=150, created_by=self.admin,
        )
        exam2 = MockExam.objects.create(
            title="Exam 2", scheduled_start=now - timedelta(days=7),
            scheduled_end=now - timedelta(days=7) + timedelta(hours=3),
            duration=150, created_by=self.admin,
        )
        # Student took exam1 but NOT exam2
        ExamSession.objects.create(
            student=self.student, exam=exam1, status='submitted',
            submitted_at=now - timedelta(days=14),
        )
        update_streak(self.student, exam1)  # streak = 1

        # Now exam3 comes, student missed exam2
        exam3 = MockExam.objects.create(
            title="Exam 3", scheduled_start=now,
            scheduled_end=now + timedelta(hours=3),
            duration=150, created_by=self.admin,
        )
        check_streak_broken(self.student, exam3)  # should reset
        streak = StudentStreak.objects.get(student=self.student)
        self.assertEqual(streak.current_streak, 0)


class TestAchievementAwarding(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user('admin2', password='test')
        self.student = Student.objects.create(full_name="Badge User", telegram_id=66666)
        self.rating = StudentRating.objects.create(
            student=self.student, elo=1400, rasch_scaled=70.0, exams_taken=5
        )
        # Create a streak for the student
        StudentStreak.objects.create(
            student=self.student, current_streak=3, longest_streak=3
        )
        now = timezone.now()
        self.exam = MockExam.objects.create(
            title="Test Exam", scheduled_start=now - timedelta(hours=3),
            scheduled_end=now, duration=150, created_by=self.admin,
        )
        self.session = ExamSession.objects.create(
            student=self.student, exam=self.exam, status='submitted',
            submitted_at=now,
        )

    def test_milestone_achievement_awarded(self):
        # Create a milestone achievement with threshold 60
        a = Achievement.objects.create(
            name="Score 60+", type='milestone',
            description="Reach 60 Rasch score", icon="star",
            threshold=60,
        )
        earned = check_and_award_achievements(self.student, self.session)
        self.assertIn("Score 60+", earned)
        self.assertTrue(
            StudentAchievement.objects.filter(student=self.student, achievement=a).exists()
        )

    def test_streak_achievement_awarded(self):
        a = Achievement.objects.create(
            name="3-Streak", type='streak',
            description="3 exams in a row", icon="fire",
            threshold=3,
        )
        earned = check_and_award_achievements(self.student, self.session)
        self.assertIn("3-Streak", earned)

    def test_no_duplicate_awards(self):
        a = Achievement.objects.create(
            name="Score 60+", type='milestone',
            description="Reach 60 Rasch score", icon="star",
            threshold=60,
        )
        check_and_award_achievements(self.student, self.session)
        earned2 = check_and_award_achievements(self.student, self.session)
        self.assertNotIn("Score 60+", earned2)
        self.assertEqual(
            StudentAchievement.objects.filter(student=self.student, achievement=a).count(), 1
        )
