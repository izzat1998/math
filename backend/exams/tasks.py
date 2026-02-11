import logging
from datetime import timedelta


from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task
def auto_submit_expired_sessions():
    from .models import ExamSession
    from .student_views import submit_session_safe

    now = timezone.now()
    session_ids = list(
        ExamSession.objects
        .filter(
            status=ExamSession.Status.IN_PROGRESS,
            started_at__lte=now - timedelta(minutes=1),
        )
        .select_related('exam')
        .values_list('id', 'started_at', 'exam__duration')
    )

    count = 0
    for session_id, started_at, duration in session_ids:
        elapsed_minutes = (now - started_at).total_seconds() / 60
        if elapsed_minutes >= duration:
            try:
                submit_session_safe(session_id, auto=True)
                count += 1
            except Exception:
                logger.exception('Failed to auto-submit session %s', session_id)

    return f"{count} ta sessiya avtomatik topshirildi"
