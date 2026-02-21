from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone

from exams.models import ExamSession, StudentAnswer, StudentRating, EloHistory
from tests.helpers import authenticated_client, admin_client, make_exam, make_student


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
