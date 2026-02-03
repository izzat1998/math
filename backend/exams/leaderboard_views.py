from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import StudentRating, EloHistory, Student
from .permissions import StudentJWTAuthentication, IsStudent

student_auth = [StudentJWTAuthentication]
student_perm = [IsStudent]


def _trend_and_delta(student):
    """Determine trend and last delta from Elo history."""
    recent = list(
        EloHistory.objects.filter(student=student)
        .order_by('-created_at')
        .values_list('elo_delta', flat=True)[:3]
    )
    if not recent:
        return 'stable', 0
    last_delta = recent[0]
    avg_delta = sum(recent) / len(recent)
    if avg_delta > 2:
        trend = 'up'
    elif avg_delta < -2:
        trend = 'down'
    else:
        trend = 'stable'
    return trend, last_delta


def _build_entry(rating, rank, current_student_id=None, improvement=None):
    trend, last_delta = _trend_and_delta(rating.student)
    entry = {
        'rank': rank,
        'student_id': str(rating.student_id),
        'full_name': rating.student.full_name,
        'elo': rating.elo,
        'exams_taken': rating.exams_taken,
        'trend': trend,
        'last_elo_delta': last_delta,
        'is_current_user': current_student_id is not None and str(rating.student_id) == str(current_student_id),
    }
    if improvement is not None:
        entry['improvement'] = improvement
    return entry


@api_view(['GET'])
@authentication_classes(student_auth)
@permission_classes([AllowAny])
def leaderboard(request):
    limit = min(int(request.query_params.get('limit', 50)), 100)
    current_student = request.user if request.user and hasattr(request.user, 'id') and not getattr(request.user, 'is_anonymous', True) else None
    return _top_rated(current_student, limit)


def _top_rated(current_student, limit):
    ratings = (
        StudentRating.objects
        .select_related('student')
        .order_by('-elo')[:limit]
    )
    student_id = current_student.id if current_student else None
    entries = [_build_entry(r, i + 1, student_id) for i, r in enumerate(ratings)]

    my_entry = _get_my_entry_top_rated(current_student, entries) if current_student else None

    return Response({'tab': 'top_rated', 'entries': entries, 'my_entry': my_entry})


def _get_my_entry_top_rated(student, entries):
    if student is None:
        return None

    for e in entries:
        if e['is_current_user']:
            return e

    try:
        my_rating = StudentRating.objects.get(student=student)
    except StudentRating.DoesNotExist:
        return None

    rank = StudentRating.objects.filter(elo__gt=my_rating.elo).count() + 1
    return _build_entry(my_rating, rank, student.id)


def _most_improved(current_student, limit):
    """Biggest total Elo delta over last 5 exams."""
    students_with_history = Student.objects.filter(
        elo_history__isnull=False
    ).distinct()

    improvements = []
    for student in students_with_history:
        recent = list(
            EloHistory.objects.filter(student=student)
            .order_by('-created_at')
            .values_list('elo_delta', flat=True)[:5]
        )
        if recent:
            improvements.append((student, sum(recent)))

    improvements.sort(key=lambda x: x[1], reverse=True)
    improvements = improvements[:limit]

    entries = []
    for rank, (student, delta) in enumerate(improvements, 1):
        try:
            rating = student.rating
        except StudentRating.DoesNotExist:
            continue
        entries.append(_build_entry(rating, rank, current_student.id, improvement=delta))

    my_entry = None
    for e in entries:
        if e['is_current_user']:
            my_entry = e
            break

    if my_entry is None:
        recent = list(
            EloHistory.objects.filter(student=current_student)
            .order_by('-created_at')
            .values_list('elo_delta', flat=True)[:5]
        )
        if recent:
            my_delta = sum(recent)
            my_rank = sum(1 for _, d in improvements if d > my_delta) + 1
            try:
                my_rating = current_student.rating
                my_entry = _build_entry(my_rating, my_rank, current_student.id, improvement=my_delta)
            except StudentRating.DoesNotExist:
                pass

    return Response({'tab': 'most_improved', 'entries': entries, 'my_entry': my_entry})


def _most_active(current_student, limit):
    ratings = (
        StudentRating.objects
        .select_related('student')
        .filter(exams_taken__gt=0)
        .order_by('-exams_taken', '-elo')[:limit]
    )
    entries = [_build_entry(r, i + 1, current_student.id) for i, r in enumerate(ratings)]

    my_entry = None
    for e in entries:
        if e['is_current_user']:
            my_entry = e
            break

    if my_entry is None:
        try:
            my_rating = StudentRating.objects.get(student=current_student)
            rank = StudentRating.objects.filter(exams_taken__gt=my_rating.exams_taken).count() + 1
            my_entry = _build_entry(my_rating, rank, current_student.id)
        except StudentRating.DoesNotExist:
            pass

    return Response({'tab': 'most_active', 'entries': entries, 'my_entry': my_entry})


@api_view(['GET'])
@authentication_classes(student_auth)
@permission_classes(student_perm)
def my_elo_history(request):
    student = request.user

    try:
        rating = student.rating
        current_elo = rating.elo
        exams_taken = rating.exams_taken
    except StudentRating.DoesNotExist:
        current_elo = 1200
        exams_taken = 0

    history = (
        EloHistory.objects
        .filter(student=student)
        .select_related('session__exam')
        .order_by('created_at')
    )

    history_data = [
        {
            'exam_title': h.session.exam.title,
            'elo_before': h.elo_before,
            'elo_after': h.elo_after,
            'elo_delta': h.elo_delta,
            'score_percent': h.score_percent,
            'date': h.created_at.isoformat(),
        }
        for h in history
    ]

    return Response({
        'current_elo': current_elo,
        'exams_taken': exams_taken,
        'history': history_data,
    })
