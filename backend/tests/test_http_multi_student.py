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

    def test_letter_grades_from_rasch_scale(self):
        """Letter grades are criterion-referenced (fixed table), not percentile."""
        # Verify grade boundaries directly
        self.assertEqual(compute_letter_grade(72), 'A+')
        self.assertEqual(compute_letter_grade(65), 'A')
        self.assertEqual(compute_letter_grade(57), 'B')
        self.assertEqual(compute_letter_grade(30), 'D')


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
