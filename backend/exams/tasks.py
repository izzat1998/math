from celery import shared_task
from django.utils import timezone
from datetime import timedelta


@shared_task
def auto_submit_expired_sessions():
    from .models import ExamSession
    from .student_views import _submit_session

    sessions = ExamSession.objects.filter(status=ExamSession.Status.IN_PROGRESS).select_related('exam')
    now = timezone.now()
    count = 0
    for session in sessions:
        elapsed = (now - session.started_at).total_seconds() / 60
        if elapsed >= session.exam.duration:
            _submit_session(session, auto=True)
            count += 1
    return f"{count} ta sessiya avtomatik topshirildi"
