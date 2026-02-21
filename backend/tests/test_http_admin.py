import io
from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.utils import timezone

from exams.models import MockExam, CorrectAnswer, ExamSession
from tests.helpers import admin_client, authenticated_client, make_student, make_exam


@override_settings(SECURE_SSL_REDIRECT=False)
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


@override_settings(SECURE_SSL_REDIRECT=False)
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


@override_settings(SECURE_SSL_REDIRECT=False)
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


@override_settings(SECURE_SSL_REDIRECT=False)
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
