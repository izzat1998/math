from django.db import transaction
from django.db.models import Count, Q

from .models import StudentRating, EloHistory, ExamSession, StudentAnswer

TOTAL_POINTS = 55


def _score_percent(session):
    """Calculate score as fraction of total points."""
    correct = StudentAnswer.objects.filter(session=session, is_correct=True).count()
    return correct / TOTAL_POINTS


def update_elo_after_submission(session):
    """Update student Elo rating after an exam submission.

    Idempotent: returns existing EloHistory if already computed for this session.
    Uses select_for_update for concurrency safety.
    """
    # Idempotency check
    existing = EloHistory.objects.filter(session=session).first()
    if existing:
        return existing

    return _compute_and_save(session)


@transaction.atomic
def _compute_and_save(session):
    # Double-check inside transaction
    existing = EloHistory.objects.filter(session=session).select_for_update().first()
    if existing:
        return existing

    # Get or create student rating
    rating, _ = StudentRating.objects.select_for_update().get_or_create(
        student=session.student,
        defaults={'elo': 1200, 'exams_taken': 0},
    )

    student_score = _score_percent(session)

    # Compute exam average across all submitted sessions for this exam
    # Uses a single annotated query instead of N+1
    all_sessions = (
        ExamSession.objects
        .filter(exam=session.exam, status=ExamSession.Status.SUBMITTED)
        .exclude(id=session.id)
        .annotate(correct_count=Count('answers', filter=Q(answers__is_correct=True)))
    )

    avg_scores = [s.correct_count / TOTAL_POINTS for s in all_sessions]
    exam_avg = sum(avg_scores) / len(avg_scores) if avg_scores else 0.5

    # Elo calculation
    k_factor = 40 if rating.exams_taken < 5 else 20
    opponent_rating = 1200 + (exam_avg - 0.5) * 800
    expected = 1 / (1 + 10 ** ((opponent_rating - rating.elo) / 400))
    delta = round(k_factor * (student_score - expected))
    new_elo = max(100, rating.elo + delta)

    elo_before = rating.elo

    # Update rating
    rating.elo = new_elo
    rating.exams_taken += 1
    rating.save()

    # Create history record
    history = EloHistory.objects.create(
        student=session.student,
        session=session,
        elo_before=elo_before,
        elo_after=new_elo,
        elo_delta=new_elo - elo_before,
        score_percent=round(student_score, 4),
        exam_avg_percent=round(exam_avg, 4),
        k_factor=k_factor,
    )

    return history
