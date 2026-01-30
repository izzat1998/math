from celery import shared_task
from django.utils import timezone


@shared_task
def auto_submit_expired_sessions():
    from .models import ExamSession
    from .student_views import _submit_session

    now = timezone.now()
    sessions = (
        ExamSession.objects
        .filter(status=ExamSession.Status.IN_PROGRESS)
        .select_related('exam')
    )

    count = 0
    for session in sessions:
        elapsed_minutes = (now - session.started_at).total_seconds() / 60
        if elapsed_minutes >= session.exam.duration:
            _submit_session(session, auto=True)
            count += 1

    return f"{count} ta sessiya avtomatik topshirildi"
