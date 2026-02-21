from django.db.models import Sum
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import StudentRating, EloHistory, Student
from .permissions import StudentJWTAuthentication, IsStudent

student_auth = [StudentJWTAuthentication]
student_perm = [IsStudent]


def _prefetch_trends(student_ids):
    """Batch-fetch trend data for a list of student IDs in one query.

    Returns a dict mapping student_id -> (trend, last_delta).
    """
    if not student_ids:
        return {}

    # Fetch recent elo_delta values per student (only needed fields)
    history_qs = (
        EloHistory.objects
        .filter(student_id__in=student_ids)
        .only('student_id', 'elo_delta', 'created_at')
        .order_by('student_id', '-created_at')
    )

    # Group by student
    student_deltas = {}
    for h in history_qs:
        sid = h.student_id
        if sid not in student_deltas:
            student_deltas[sid] = []
        if len(student_deltas[sid]) < 3:
            student_deltas[sid].append(h.elo_delta)

    result = {}
    for sid in student_ids:
        recent = student_deltas.get(sid, [])
        if not recent:
            result[sid] = ('stable', 0)
            continue
        last_delta = recent[0]
        avg_delta = sum(recent) / len(recent)
        if avg_delta > 2:
            trend = 'up'
        elif avg_delta < -2:
            trend = 'down'
        else:
            trend = 'stable'
        result[sid] = (trend, last_delta)
    return result


def _build_entry(rating, rank, trend_data, current_student_id=None, improvement=None):
    trend, last_delta = trend_data.get(rating.student_id, ('stable', 0))
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
    try:
        limit = min(int(request.query_params.get('limit', 50)), 100)
    except (TypeError, ValueError):
        limit = 50
    current_student = request.user if request.user and hasattr(request.user, 'id') and not getattr(request.user, 'is_anonymous', True) else None

    tab = request.query_params.get('tab', 'top_rated')
    if tab == 'most_improved':
        return _most_improved(current_student, limit)
    elif tab == 'most_active':
        return _most_active(current_student, limit)
    else:
        return _top_rated(current_student, limit)


def _top_rated(current_student, limit):
    from django.core.cache import cache

    cache_key = f'leaderboard_top_{limit}'
    cached = cache.get(cache_key)

    if cached is not None:
        # Use cached entries but personalize is_current_user
        entries = [dict(e) for e in cached['entries']]  # shallow copy each dict
        trend_data = dict(cached['trend_data'])  # copy to prevent cache mutation
    else:
        ratings = list(
            StudentRating.objects
            .select_related('student')
            .order_by('-elo')[:limit]
        )
        trend_data = _prefetch_trends([r.student_id for r in ratings])
        entries = [_build_entry(r, i + 1, trend_data) for i, r in enumerate(ratings)]
        cache.set(cache_key, {'entries': entries, 'trend_data': trend_data}, timeout=300)

    student_id = current_student.id if current_student else None
    if student_id:
        for e in entries:
            e['is_current_user'] = str(e['student_id']) == str(student_id)

    my_entry = _get_my_entry_top_rated(current_student, entries, trend_data) if current_student else None

    return Response({'tab': 'top_rated', 'entries': entries, 'my_entry': my_entry})


def _get_my_entry_top_rated(student, entries, trend_data):
    if student is None:
        return None

    for e in entries:
        if e['is_current_user']:
            return e

    try:
        my_rating = StudentRating.objects.select_related('student').get(student=student)
    except StudentRating.DoesNotExist:
        return None

    rank = StudentRating.objects.filter(elo__gt=my_rating.elo).count() + 1
    if my_rating.student_id not in trend_data:
        trend_data.update(_prefetch_trends([my_rating.student_id]))
    return _build_entry(my_rating, rank, trend_data, student.id)


def _most_improved(current_student, limit):
    """Biggest total Elo delta over recent exams.

    Uses DB-level aggregation instead of loading the entire EloHistory table.
    """
    from django.core.cache import cache

    cache_key = f'leaderboard_improved_{limit}'
    cached = cache.get(cache_key)

    if cached is not None:
        entries = [dict(e) for e in cached['entries']]
        trend_data = dict(cached['trend_data'])
    else:
        # Aggregate total elo_delta per student at the DB level
        improvements_qs = (
            EloHistory.objects
            .values('student_id')
            .annotate(total_delta=Sum('elo_delta'))
            .order_by('-total_delta')[:limit]
        )

        student_ids = [row['student_id'] for row in improvements_qs]
        delta_map = {row['student_id']: row['total_delta'] for row in improvements_qs}

        # Batch-fetch ratings and trends
        ratings_map = {
            r.student_id: r
            for r in StudentRating.objects.select_related('student').filter(student_id__in=student_ids)
        }
        trend_data = _prefetch_trends(student_ids)

        entries = []
        for rank, sid in enumerate(student_ids, 1):
            rating = ratings_map.get(sid)
            if not rating:
                continue
            entries.append(_build_entry(rating, rank, trend_data, improvement=delta_map[sid]))

        cache.set(cache_key, {'entries': entries, 'trend_data': trend_data}, timeout=300)

    student_id = current_student.id if current_student else None
    if student_id:
        for e in entries:
            e['is_current_user'] = str(e['student_id']) == str(student_id)

    my_entry = None
    if current_student:
        for e in entries:
            if e['is_current_user']:
                my_entry = e
                break

        if my_entry is None:
            my_delta_qs = EloHistory.objects.filter(student=current_student).aggregate(total_delta=Sum('elo_delta'))
            my_delta = my_delta_qs['total_delta']
            if my_delta is not None:
                my_rank = (
                    EloHistory.objects
                    .values('student_id')
                    .annotate(total_delta=Sum('elo_delta'))
                    .filter(total_delta__gt=my_delta)
                    .count()
                ) + 1
                try:
                    my_rating = StudentRating.objects.select_related('student').get(student=current_student)
                    if current_student.id not in trend_data:
                        trend_data.update(_prefetch_trends([current_student.id]))
                    my_entry = _build_entry(my_rating, my_rank, trend_data, current_student.id, improvement=my_delta)
                except StudentRating.DoesNotExist:
                    pass

    return Response({'tab': 'most_improved', 'entries': entries, 'my_entry': my_entry})


def _most_active(current_student, limit):
    from django.core.cache import cache

    cache_key = f'leaderboard_active_{limit}'
    cached = cache.get(cache_key)

    if cached is not None:
        entries = [dict(e) for e in cached['entries']]
        trend_data = dict(cached['trend_data'])
    else:
        ratings = list(
            StudentRating.objects
            .select_related('student')
            .filter(exams_taken__gt=0)
            .order_by('-exams_taken', '-elo')[:limit]
        )
        trend_data = _prefetch_trends([r.student_id for r in ratings])
        entries = [_build_entry(r, i + 1, trend_data) for i, r in enumerate(ratings)]
        cache.set(cache_key, {'entries': entries, 'trend_data': trend_data}, timeout=300)

    student_id = current_student.id if current_student else None
    if student_id:
        for e in entries:
            e['is_current_user'] = str(e['student_id']) == str(student_id)

    my_entry = None
    if current_student:
        for e in entries:
            if e['is_current_user']:
                my_entry = e
                break

        if my_entry is None:
            try:
                my_rating = StudentRating.objects.select_related('student').get(student=current_student)
                rank = StudentRating.objects.filter(exams_taken__gt=my_rating.exams_taken).count() + 1
                if my_rating.student_id not in trend_data:
                    trend_data.update(_prefetch_trends([my_rating.student_id]))
                my_entry = _build_entry(my_rating, rank, trend_data, current_student.id)
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
