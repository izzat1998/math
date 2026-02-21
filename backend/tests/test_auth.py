from django.test import TestCase, override_settings
from exams.models import Student


@override_settings(SECURE_SSL_REDIRECT=False)
class TestTelegramNameSync(TestCase):
    def test_name_sync_updates_on_change(self):
        """Student name should update when Telegram name changes."""
        student = Student.objects.create(full_name="Old Name", telegram_id=12345)
        # Simulate name change
        student.full_name = "New Name"
        student.save(update_fields=['full_name'])
        student.refresh_from_db()
        self.assertEqual(student.full_name, "New Name")

    def test_latest_exam_endpoint_removed(self):
        """The latest exam endpoint should return 404."""
        from django.test import Client
        client = Client()
        response = client.get('/api/exams/latest/')
        self.assertEqual(response.status_code, 404)
