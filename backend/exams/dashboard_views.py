from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.response import Response
from django.utils import timezone

from .models import (
    StudentRating, StudentStreak, StudentAchievement,
    Achievement, MockExam, ExamSession, EloHistory, StudentAnswer,
)
from .permissions import StudentJWTAuthentication, IsStudent
from .scoring import compute_score

student_auth = [StudentJWTAuthentication]
student_perm = [IsStudent]


def _get_dashboard_data(student):
    """Assemble dashboard data for a student."""
    try:
        rating = student.rating
        elo = rating.elo
        rasch_scaled = rating.rasch_scaled
        exams_taken = rating.exams_taken
    except StudentRating.DoesNotExist:
        elo = 1200
        rasch_scaled = None
        exams_taken = 0

    try:
        streak = student.streak
        current_streak = streak.current_streak
        longest_streak = streak.longest_streak
    except StudentStreak.DoesNotExist:
        current_streak = 0
        longest_streak = 0

    earned = StudentAchievement.objects.filter(
        student=student
    ).select_related('achievement').order_by('-earned_at')
    achievements = [
        {
            'name': sa.achievement.name,
            'type': sa.achievement.type,
            'icon': sa.achievement.icon,
            'earned_at': sa.earned_at.isoformat(),
        }
        for sa in earned
    ]

    now = timezone.now()
    upcoming = MockExam.objects.filter(
        scheduled_end__gt=now
    ).order_by('scheduled_start').first()

    upcoming_exam = None
    if upcoming:
        has_session = ExamSession.objects.filter(
            student=student, exam=upcoming
        ).exists()
        upcoming_exam = {
            'id': str(upcoming.id),
            'title': upcoming.title,
            'scheduled_start': upcoming.scheduled_start.isoformat(),
            'scheduled_end': upcoming.scheduled_end.isoformat(),
            'has_started': now >= upcoming.scheduled_start,
            'already_taken': has_session,
        }

    return {
        'elo': elo,
        'rasch_scaled': rasch_scaled,
        'exams_taken': exams_taken,
        'current_streak': current_streak,
        'longest_streak': longest_streak,
        'achievements': achievements,
        'upcoming_exam': upcoming_exam,
    }


@api_view(['GET'])
@authentication_classes(student_auth)
@permission_classes(student_perm)
def dashboard(request):
    data = _get_dashboard_data(request.user)
    return Response(data)


def _get_exam_history(student):
    """Get list of past exams with scores."""
    sessions = list(
        ExamSession.objects.filter(
            student=student,
            status='submitted',
        ).select_related('exam').order_by('-submitted_at')
    )

    if not sessions:
        return []

    session_ids = [s.id for s in sessions]

    # Batch-fetch all answers grouped by session to avoid N+1
    all_answers = StudentAnswer.objects.filter(session_id__in=session_ids)
    answers_by_session = {}
    for a in all_answers:
        answers_by_session.setdefault(a.session_id, []).append(a)

    # Batch-fetch EloHistory
    elo_entries = {
        e.session_id: e
        for e in EloHistory.objects.filter(session_id__in=session_ids)
    }

    history = []
    for session in sessions:
        prefetched = answers_by_session.get(session.id, [])
        score = compute_score(session, prefetched_answers=prefetched)
        elo_entry = elo_entries.get(session.id)
        history.append({
            'session_id': str(session.id),
            'exam_id': str(session.exam.id),
            'exam_title': session.exam.title,
            'submitted_at': session.submitted_at.isoformat() if session.submitted_at else None,
            'exercises_correct': score['exercises_correct'],
            'exercises_total': score['exercises_total'],
            'rasch_scaled': elo_entry.rasch_after if elo_entry else None,
            'elo_delta': elo_entry.elo_delta if elo_entry else None,
            'is_auto_submitted': session.is_auto_submitted,
        })

    return history


@api_view(['GET'])
@authentication_classes(student_auth)
@permission_classes(student_perm)
def exam_history(request):
    history = _get_exam_history(request.user)
    return Response(history)


@api_view(['GET'])
@authentication_classes(student_auth)
@permission_classes(student_perm)
def achievements(request):
    earned = StudentAchievement.objects.filter(
        student=request.user
    ).select_related('achievement').order_by('-earned_at')

    all_achievements = Achievement.objects.all()

    earned_map = {sa.achievement_id: sa for sa in earned}
    result = []
    for a in all_achievements:
        sa = earned_map.get(a.id)
        result.append({
            'id': str(a.id),
            'name': a.name,
            'type': a.type,
            'description': a.description,
            'icon': a.icon,
            'threshold': a.threshold,
            'earned': a.id in earned_map,
            'earned_at': sa.earned_at.isoformat() if sa else None,
        })

    return Response(result)
