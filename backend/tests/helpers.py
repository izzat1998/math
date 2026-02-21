from datetime import timedelta

from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APIClient

from exams.auth_views import _get_tokens_for_student
from exams.models import MockExam, CorrectAnswer, Student


def make_student(telegram_id=100001, full_name="Test Student"):
    """Create a Student and return it."""
    return Student.objects.create(telegram_id=telegram_id, full_name=full_name)


def authenticated_client(student=None):
    """Return an APIClient with valid JWT for the given student."""
    if student is None:
        student = make_student()
    tokens = _get_tokens_for_student(student)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")
    return client, student


def admin_client():
    """Return an APIClient authenticated as a Django admin user."""
    user = User.objects.create_superuser('testadmin', 'admin@test.com', 'testpass123')
    client = APIClient()
    client.force_authenticate(user=user)
    return client, user


def make_exam(admin_user, start_offset=-5, end_offset=175, duration=150, title="Test Exam"):
    """Create a MockExam with full correct answers.

    start_offset/end_offset are minutes from now.
    Returns the exam.
    """
    now = timezone.now()
    exam = MockExam.objects.create(
        title=title,
        scheduled_start=now + timedelta(minutes=start_offset),
        scheduled_end=now + timedelta(minutes=end_offset),
        duration=duration,
        created_by=admin_user,
    )
    # Q1-35: MCQ, answer is 'A'
    for q in range(1, 36):
        CorrectAnswer.objects.create(
            exam=exam, question_number=q, sub_part=None, correct_answer='A'
        )
    # Q36-45: paired, a='5', b='10'
    for q in range(36, 46):
        CorrectAnswer.objects.create(
            exam=exam, question_number=q, sub_part='a', correct_answer='5'
        )
        CorrectAnswer.objects.create(
            exam=exam, question_number=q, sub_part='b', correct_answer='10'
        )
    return exam
