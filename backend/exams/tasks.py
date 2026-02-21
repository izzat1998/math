import logging
from datetime import timedelta


from celery import shared_task
from django.db import transaction
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=300,
    max_retries=3,
)
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
        .values_list('id', 'started_at', 'exam__duration', 'exam__scheduled_end')
    )

    count = 0
    for session_id, started_at, duration, scheduled_end in session_ids:
        elapsed_seconds = (now - started_at).total_seconds()
        remaining_at_start = (scheduled_end - started_at).total_seconds()
        effective_duration_seconds = min(duration * 60, remaining_at_start)

        if elapsed_seconds >= effective_duration_seconds:
            try:
                submit_session_safe(session_id, auto=True)
                count += 1
            except Exception:
                logger.exception('Failed to auto-submit session %s', session_id)

    # Check if any exam windows just closed (trigger Rasch calibration)
    from .models import MockExam, ItemDifficulty
    recently_closed = MockExam.objects.filter(
        scheduled_end__lte=now,
        scheduled_end__gte=now - timedelta(minutes=2),
    )
    for exam in recently_closed:
        if not ItemDifficulty.objects.filter(exam=exam).exists():
            calibrate_exam_rasch.delay(str(exam.id))

    return f"{count} ta sessiya avtomatik topshirildi"


@shared_task(
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=300,
    max_retries=3,
)
def send_exam_notification(exam_id):
    from .models import MockExam
    from .notifications import notify_new_exam
    try:
        exam = MockExam.objects.get(id=exam_id)
        notify_new_exam(exam)
    except MockExam.DoesNotExist:
        logger.error('Exam %s not found for notification', exam_id)


@shared_task(
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=600,
    max_retries=3,
)
def calibrate_exam_rasch(exam_id):
    """
    Run Rasch calibration after exam window closes.
    Updates ItemDifficulty and StudentRating.rasch_scaled for all participants.
    """
    from .models import MockExam, ExamSession, StudentAnswer, ItemDifficulty, StudentRating, CorrectAnswer
    from .rasch import estimate_item_difficulties, estimate_theta, compute_item_fit
    from .scoring import compute_rasch_scaled_score, MIN_RASCH_PARTICIPANTS

    try:
        exam = MockExam.objects.get(id=exam_id)
    except MockExam.DoesNotExist:
        logger.error('Exam %s not found for calibration', exam_id)
        return

    sessions = list(
        ExamSession.objects.filter(exam=exam, status='submitted')
        .select_related('student')
        .order_by('started_at')
    )

    if len(sessions) < MIN_RASCH_PARTICIPANTS:
        logger.info('Exam %s: only %d participants, using raw-percentage fallback (need %d for Rasch)',
                     exam_id, len(sessions), MIN_RASCH_PARTICIPANTS)
        _apply_rasch_fallback(exam, sessions)
        return

    # Get all correct answer keys to define the item set
    correct_answers = list(
        CorrectAnswer.objects.filter(exam=exam)
        .order_by('question_number', 'sub_part')
    )
    item_keys = [(ca.question_number, ca.sub_part) for ca in correct_answers]
    n_items = len(item_keys)

    if n_items == 0:
        logger.warning('Exam %s: no correct answers defined, skipping Rasch', exam_id)
        return

    # Build response matrix (N_students x N_items)
    import numpy as np
    matrix = np.full((len(sessions), n_items), np.nan)

    # Batch-fetch all answers for all sessions
    all_answers = StudentAnswer.objects.filter(
        session__in=[s.id for s in sessions]
    ).values_list('session_id', 'question_number', 'sub_part', 'is_correct')

    # Build lookup: session_id -> {(q, sub): is_correct}
    answer_lookup = {}
    for sid, q, sub, correct in all_answers:
        if sid not in answer_lookup:
            answer_lookup[sid] = {}
        answer_lookup[sid][(q, sub)] = correct

    for i, session in enumerate(sessions):
        answers = answer_lookup.get(session.id, {})
        for j, (q, sub) in enumerate(item_keys):
            val = answers.get((q, sub))
            if val is not None:
                matrix[i, j] = 1.0 if val else 0.0

    # Run JMLE calibration
    betas, thetas = estimate_item_difficulties(matrix)

    # Save ItemDifficulty records and update student ratings atomically
    from .models import EloHistory
    with transaction.atomic():
        ItemDifficulty.objects.filter(exam=exam).delete()

        item_difficulties = []
        for j, (q, sub) in enumerate(item_keys):
            fit = compute_item_fit(j, matrix, thetas, betas)
            item_difficulties.append(ItemDifficulty(
                exam=exam,
                question_number=q,
                sub_part=sub,
                beta=float(betas[j]),
                infit=fit['infit'],
                outfit=fit['outfit'],
            ))
        ItemDifficulty.objects.bulk_create(item_difficulties)

        # Update each student's Rasch ability and scaled score
        for i, session in enumerate(sessions):
            theta = float(thetas[i])
            scaled = compute_rasch_scaled_score(theta)
            StudentRating.objects.filter(
                student=session.student
            ).update(rasch_ability=theta, rasch_scaled=scaled)
            EloHistory.objects.filter(session=session).update(rasch_after=scaled)

    logger.info('Exam %s: Rasch calibration complete for %d participants, %d items',
                exam_id, len(sessions), n_items)


def _apply_rasch_fallback(exam, sessions):
    """Apply raw-percentage-based provisional Rasch scores when N < MIN_RASCH_PARTICIPANTS."""
    from .models import StudentRating, StudentAnswer, EloHistory
    from .scoring import compute_score, POINTS_TOTAL

    session_ids = [s.id for s in sessions]
    all_answers = StudentAnswer.objects.filter(session_id__in=session_ids)
    answers_by_session = {}
    for a in all_answers:
        answers_by_session.setdefault(a.session_id, []).append(a)

    with transaction.atomic():
        for session in sessions:
            prefetched = answers_by_session.get(session.id, [])
            score = compute_score(session, prefetched_answers=prefetched)
            raw_pct = score['points'] / POINTS_TOTAL if POINTS_TOTAL > 0 else 0
            # Linear map: raw percentage → 0-75 scale
            scaled = round(max(0.0, min(75.0, raw_pct * 75)), 1)
            StudentRating.objects.filter(
                student=session.student
            ).update(rasch_scaled=scaled)
            EloHistory.objects.filter(session=session).update(rasch_after=scaled)

    logger.info('Exam %s: raw-percentage fallback applied for %d participants',
                str(exam.id), len(sessions))
