from django.test import TestCase
from django.utils import timezone
from django.db import IntegrityError
from datetime import timedelta

from django.contrib.auth.models import User

from exams.models import (
    MockExam, ExamSession, StudentAnswer, CorrectAnswer,
    Student, StudentRating, EloHistory, StudentStreak,
)
from exams.student_views import _submit_session
from exams.gamification import update_streak, check_streak_broken
from exams.scoring import compute_score, compute_letter_grade


class TestFullExamFlow(TestCase):
    """End-to-end: create exam -> answers -> submit -> scoring -> ELO update."""

    def setUp(self):
        self.admin = User.objects.create_superuser('admin', 'a@b.com', 'pass')
        self.student = Student.objects.create(full_name="E2E Test", telegram_id=99999)
        now = timezone.now()
        self.exam = MockExam.objects.create(
            title="E2E Exam",
            scheduled_start=now - timedelta(minutes=5),
            scheduled_end=now + timedelta(hours=3),
            duration=150,
            created_by=self.admin,
        )
        # Create correct answers: 1-35 MCQ (sub_part=None) + 36-45 with a/b sub-parts
        for q in range(1, 36):
            CorrectAnswer.objects.create(
                exam=self.exam, question_number=q, sub_part=None,
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

    def test_perfect_score_flow(self):
        """All correct answers -> 55/55 points, 45/45 exercises."""
        session = ExamSession.objects.create(
            student=self.student, exam=self.exam,
            status=ExamSession.Status.IN_PROGRESS,
        )
        # Answer all questions correctly
        for q in range(1, 36):
            StudentAnswer.objects.create(
                session=session, question_number=q, sub_part=None,
                answer='A'
            )
        for q in range(36, 46):
            StudentAnswer.objects.create(
                session=session, question_number=q, sub_part='a', answer='5'
            )
            StudentAnswer.objects.create(
                session=session, question_number=q, sub_part='b', answer='10'
            )

        _submit_session(session)
        session.refresh_from_db()

        self.assertEqual(session.status, 'submitted')
        self.assertIsNotNone(session.submitted_at)
        self.assertFalse(session.is_auto_submitted)

        # Check grading
        correct_count = StudentAnswer.objects.filter(
            session=session, is_correct=True
        ).count()
        self.assertEqual(correct_count, 55)

        # Check scoring
        score = compute_score(session)
        self.assertEqual(score['exercises_correct'], 45)
        self.assertEqual(score['points'], 55)

        # Check ELO was updated
        rating = StudentRating.objects.get(student=self.student)
        self.assertNotEqual(rating.elo, 1200)  # Should have changed
        self.assertEqual(rating.exams_taken, 1)

        # Check ELO history
        elo_record = EloHistory.objects.get(session=session)
        self.assertEqual(elo_record.elo_before, 1200)
        self.assertGreater(elo_record.elo_after, 1200)  # Perfect score -> ELO up

    def test_partial_score_flow(self):
        """Some wrong answers -> partial score."""
        session = ExamSession.objects.create(
            student=self.student, exam=self.exam,
            status=ExamSession.Status.IN_PROGRESS,
        )
        # Answer first 20 correctly, rest wrong
        for q in range(1, 21):
            StudentAnswer.objects.create(
                session=session, question_number=q, sub_part=None, answer='A'
            )
        for q in range(21, 36):
            StudentAnswer.objects.create(
                session=session, question_number=q, sub_part=None, answer='B'  # Wrong
            )
        for q in range(36, 46):
            StudentAnswer.objects.create(
                session=session, question_number=q, sub_part='a', answer='999'  # Wrong
            )
            StudentAnswer.objects.create(
                session=session, question_number=q, sub_part='b', answer='999'  # Wrong
            )

        _submit_session(session)
        session.refresh_from_db()

        score = compute_score(session)
        self.assertEqual(score['exercises_correct'], 20)  # Only first 20 correct
        self.assertEqual(score['points'], 20)

    def test_auto_submit_flag(self):
        """Auto-submitted sessions should have is_auto_submitted=True."""
        session = ExamSession.objects.create(
            student=self.student, exam=self.exam,
            status=ExamSession.Status.IN_PROGRESS,
        )
        _submit_session(session, auto=True)
        session.refresh_from_db()
        self.assertTrue(session.is_auto_submitted)

    def test_paired_question_needs_both_correct(self):
        """For questions 36-45, exercise counts only if both a and b correct."""
        session = ExamSession.objects.create(
            student=self.student, exam=self.exam,
            status=ExamSession.Status.IN_PROGRESS,
        )
        # Answer all single questions correctly
        for q in range(1, 36):
            StudentAnswer.objects.create(
                session=session, question_number=q, sub_part=None, answer='A'
            )
        # For paired questions: only answer 'a' correctly, 'b' wrong
        for q in range(36, 46):
            StudentAnswer.objects.create(
                session=session, question_number=q, sub_part='a', answer='5'  # Correct
            )
            StudentAnswer.objects.create(
                session=session, question_number=q, sub_part='b', answer='999'  # Wrong
            )

        _submit_session(session)
        score = compute_score(session)
        # 35 singles correct + 0 paired exercises (need both a and b)
        self.assertEqual(score['exercises_correct'], 35)
        # Points: 35 singles + 10 correct 'a' parts = 45
        self.assertEqual(score['points'], 45)


class TestStreakIntegration(TestCase):
    """Test streak tracking across multiple consecutive exams."""

    def setUp(self):
        self.admin = User.objects.create_user('admin_streak', password='test')
        self.student = Student.objects.create(full_name="Streak Test", telegram_id=88888)

    def test_consecutive_exams_build_streak(self):
        """Participating in consecutive exams builds streak."""
        now = timezone.now()

        exams = []
        for i in range(3):
            exam = MockExam.objects.create(
                title=f"Streak Exam {i+1}",
                scheduled_start=now + timedelta(weeks=i),
                scheduled_end=now + timedelta(weeks=i, hours=3),
                duration=150,
                created_by=self.admin,
            )
            exams.append(exam)

        # Student takes all 3
        for exam in exams:
            ExamSession.objects.create(
                student=self.student, exam=exam, status='submitted',
                submitted_at=exam.scheduled_start + timedelta(hours=1),
            )
            check_streak_broken(self.student, exam)
            update_streak(self.student, exam)

        streak = StudentStreak.objects.get(student=self.student)
        self.assertEqual(streak.current_streak, 3)
        self.assertEqual(streak.longest_streak, 3)

    def test_missed_exam_breaks_streak(self):
        """Missing an exam resets streak to 0, then taking next starts at 1."""
        now = timezone.now()

        exams = []
        for i in range(3):
            exam = MockExam.objects.create(
                title=f"Break Exam {i+1}",
                scheduled_start=now + timedelta(weeks=i),
                scheduled_end=now + timedelta(weeks=i, hours=3),
                duration=150,
                created_by=self.admin,
            )
            exams.append(exam)

        # Take exam 1
        ExamSession.objects.create(
            student=self.student, exam=exams[0], status='submitted',
            submitted_at=exams[0].scheduled_start + timedelta(hours=1),
        )
        check_streak_broken(self.student, exams[0])
        update_streak(self.student, exams[0])

        # Skip exam 2, take exam 3
        check_streak_broken(self.student, exams[2])  # Should reset streak
        update_streak(self.student, exams[2])

        streak = StudentStreak.objects.get(student=self.student)
        self.assertEqual(streak.current_streak, 1)  # Reset then incremented


class TestLetterGradeDistribution(TestCase):
    """Test criterion-referenced letter grade (Milliy Sertifikat table)."""

    def test_high_rasch_gets_a_plus(self):
        self.assertEqual(compute_letter_grade(72), 'A+')

    def test_mid_rasch_gets_b(self):
        self.assertEqual(compute_letter_grade(57), 'B')

    def test_low_rasch_gets_d(self):
        self.assertEqual(compute_letter_grade(30), 'D')

    def test_none_rasch_returns_none(self):
        self.assertIsNone(compute_letter_grade(None))


class TestExamSessionConstraints(TestCase):
    """Test unique constraints and edge cases."""

    def setUp(self):
        self.admin = User.objects.create_user('admin_const', password='test')
        self.student = Student.objects.create(full_name="Constraint", telegram_id=77770)
        now = timezone.now()
        self.exam = MockExam.objects.create(
            title="Constraint Exam",
            scheduled_start=now - timedelta(hours=1),
            scheduled_end=now + timedelta(hours=2),
            duration=150,
            created_by=self.admin,
        )

    def test_student_cannot_have_two_sessions_same_exam(self):
        """unique_together(student, exam) prevents duplicate sessions."""
        ExamSession.objects.create(
            student=self.student, exam=self.exam, status='in_progress'
        )
        with self.assertRaises(IntegrityError):
            ExamSession.objects.create(
                student=self.student, exam=self.exam, status='in_progress'
            )

    def test_submit_idempotent(self):
        """Submitting an already-submitted session is a no-op."""
        session = ExamSession.objects.create(
            student=self.student, exam=self.exam, status='in_progress'
        )
        CorrectAnswer.objects.create(
            exam=self.exam, question_number=1, sub_part=None, correct_answer='A'
        )
        _submit_session(session)
        first_submitted_at = session.submitted_at

        # Submit again -- guard clause returns early
        _submit_session(session)
        session.refresh_from_db()

        # submitted_at should not have changed
        self.assertEqual(session.submitted_at, first_submitted_at)


class TestEloCalculation(TestCase):
    """Test ELO rating changes across different exam scenarios."""

    def setUp(self):
        self.admin = User.objects.create_superuser('admin_elo', 'elo@test.com', 'pass')
        self.student = Student.objects.create(full_name="ELO Student", telegram_id=12345)
        now = timezone.now()
        self.exam = MockExam.objects.create(
            title="ELO Exam",
            scheduled_start=now - timedelta(minutes=5),
            scheduled_end=now + timedelta(hours=3),
            duration=150,
            created_by=self.admin,
        )
        # Minimal correct answers
        CorrectAnswer.objects.create(
            exam=self.exam, question_number=1, sub_part=None, correct_answer='A'
        )

    def test_first_exam_uses_high_k_factor(self):
        """First exams (< 5) use K=40."""
        session = ExamSession.objects.create(
            student=self.student, exam=self.exam,
            status=ExamSession.Status.IN_PROGRESS,
        )
        StudentAnswer.objects.create(
            session=session, question_number=1, sub_part=None, answer='A'
        )
        _submit_session(session)

        elo_record = EloHistory.objects.get(session=session)
        self.assertEqual(elo_record.k_factor, 40)

    def test_elo_never_below_floor(self):
        """ELO should never drop below the floor of 100."""
        # Create a student with very low ELO
        rating = StudentRating.objects.create(
            student=self.student, elo=100, exams_taken=0
        )
        session = ExamSession.objects.create(
            student=self.student, exam=self.exam,
            status=ExamSession.Status.IN_PROGRESS,
        )
        # Don't answer any questions (0/55 score)
        _submit_session(session)

        rating.refresh_from_db()
        self.assertGreaterEqual(rating.elo, 100)

    def test_elo_history_created(self):
        """Each submission creates an EloHistory record."""
        session = ExamSession.objects.create(
            student=self.student, exam=self.exam,
            status=ExamSession.Status.IN_PROGRESS,
        )
        _submit_session(session)

        self.assertTrue(EloHistory.objects.filter(session=session).exists())
        elo_record = EloHistory.objects.get(session=session)
        self.assertEqual(elo_record.student, self.student)
        self.assertEqual(elo_record.elo_before, 1200)
        self.assertIsNotNone(elo_record.elo_after)
        self.assertEqual(elo_record.elo_delta, elo_record.elo_after - elo_record.elo_before)
