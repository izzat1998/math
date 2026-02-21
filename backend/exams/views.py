import logging
from datetime import timedelta

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status, permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from .models import MockExam, ExamSession
from .scoring import compute_score
from .serializers import (
    MockExamSerializer,
    BulkCorrectAnswerSerializer,
)

logger = logging.getLogger(__name__)
admin_perm = [permissions.IsAdminUser]


@api_view(['POST', 'GET'])
@permission_classes(admin_perm)
def admin_exams(request):
    if request.method == 'POST':
        serializer = MockExamSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        exam = serializer.save(created_by=request.user)
        logger.info('Admin %s created exam %s (%s)', request.user.username, exam.id, exam.title)
        from .tasks import send_exam_notification
        send_exam_notification.delay(str(exam.id))
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    exams = MockExam.objects.all().order_by('-created_at')
    return Response(MockExamSerializer(exams, many=True).data)


@api_view(['POST'])
@permission_classes(admin_perm)
def admin_exam_answers(request, exam_id):
    exam = get_object_or_404(MockExam, id=exam_id)
    serializer = BulkCorrectAnswerSerializer(data=request.data, context={'exam': exam})
    serializer.is_valid(raise_exception=True)
    serializer.save()
    logger.info('Admin %s uploaded answers for exam %s', request.user.username, exam_id)
    return Response({'message': 'Javoblar saqlandi'}, status=status.HTTP_201_CREATED)



@api_view(['PUT', 'DELETE'])
@permission_classes(admin_perm)
def admin_exam_detail(request, exam_id):
    exam = get_object_or_404(MockExam, id=exam_id)

    if request.method == 'DELETE':
        if ExamSession.objects.filter(exam=exam).exists():
            return Response(
                {'error': 'Cannot delete an exam that has been taken by students.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        exam.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    if request.method == 'PUT':
        # Prevent schedule changes if students have already started the exam
        if ExamSession.objects.filter(exam=exam).exists():
            schedule_fields = {'scheduled_start', 'scheduled_end', 'duration'}
            if schedule_fields & set(request.data.keys()):
                return Response(
                    {'error': 'Cannot change schedule for an exam that has been started by students.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        serializer = MockExamSerializer(exam, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(MockExamSerializer(exam).data)


@api_view(['GET'])
@permission_classes(admin_perm)
def admin_exam_results(request, exam_id):
    exam = get_object_or_404(MockExam, id=exam_id)
    sessions = (
        ExamSession.objects
        .filter(exam=exam, status=ExamSession.Status.SUBMITTED)
        .select_related('student')
        .prefetch_related('answers')
    )

    results = []
    for session in sessions:
        score = compute_score(session, prefetched_answers=list(session.answers.all()))
        results.append({
            'student_id': session.student.id,
            'student_name': session.student.full_name,
            **score,
            'submitted_at': session.submitted_at,
            'is_auto_submitted': session.is_auto_submitted,
        })

    return Response(results)


@api_view(['POST'])
@permission_classes(admin_perm)
def admin_notify(request):
    """Manually trigger exam notification."""
    exam_id = request.data.get('exam_id')
    if not exam_id:
        return Response({'error': 'exam_id required'}, status=status.HTTP_400_BAD_REQUEST)
    exam = get_object_or_404(MockExam, id=exam_id)
    from .tasks import send_exam_notification
    send_exam_notification.delay(str(exam.id))
    return Response({'status': 'Notification queued'})


@api_view(['GET'])
@permission_classes(admin_perm)
def admin_item_analysis(request, exam_id):
    """Rasch item analysis for an exam."""
    from .models import ItemDifficulty, StudentAnswer

    exam = get_object_or_404(MockExam, id=exam_id)

    items = ItemDifficulty.objects.filter(exam=exam).order_by('question_number', 'sub_part')

    if not items.exists():
        return Response({
            'exam_id': str(exam.id),
            'exam_title': exam.title,
            'items': [],
            'total_participants': ExamSession.objects.filter(
                exam=exam, status='submitted'
            ).count(),
        })

    # Single aggregated query for all items instead of 2 queries per item
    from django.db.models import Count, Q
    answer_stats = {}
    for row in StudentAnswer.objects.filter(
        session__exam=exam,
        session__status='submitted',
    ).values('question_number', 'sub_part').annotate(
        total=Count('id'),
        correct=Count('id', filter=Q(is_correct=True)),
    ):
        answer_stats[(row['question_number'], row['sub_part'])] = (row['total'], row['correct'])

    analysis = []
    for item in items:
        flag = None
        if item.infit is not None and (item.infit < 0.7 or item.infit > 1.3):
            flag = 'misfit_infit'
        if item.outfit is not None and (item.outfit < 0.7 or item.outfit > 1.3):
            flag = 'misfit_outfit' if not flag else 'misfit_both'

        total, correct = answer_stats.get((item.question_number, item.sub_part), (0, 0))

        analysis.append({
            'question_number': item.question_number,
            'sub_part': item.sub_part,
            'difficulty': round(item.beta, 3),
            'infit': round(item.infit, 3) if item.infit is not None else None,
            'outfit': round(item.outfit, 3) if item.outfit is not None else None,
            'percent_correct': round(correct / total * 100, 1) if total > 0 else 0,
            'flagged': flag is not None,
        })

    return Response({
        'exam_id': str(exam.id),
        'exam_title': exam.title,
        'items': analysis,
        'total_participants': ExamSession.objects.filter(
            exam=exam, status='submitted'
        ).count(),
    })


@api_view(['GET'])
@permission_classes(admin_perm)
def admin_analytics(request):
    """Platform-wide analytics."""
    from django.db.models import Count, Q, Avg
    from .models import Student, StudentRating, StudentAnswer

    total_students = Student.objects.count()
    thirty_days_ago = timezone.now() - timedelta(days=30)
    active_students_30d = ExamSession.objects.filter(
        started_at__gte=thirty_days_ago
    ).values('student').distinct().count()
    total_exams = MockExam.objects.count()
    total_sessions = ExamSession.objects.filter(status='submitted').count()

    # Average score percentage across all submitted sessions
    from .scoring import POINTS_TOTAL
    submitted = ExamSession.objects.filter(status='submitted').annotate(
        correct_count=Count('answers', filter=Q(answers__is_correct=True))
    )
    avg_result = submitted.aggregate(avg_correct=Avg('correct_count'))
    avg_correct = avg_result['avg_correct']
    avg_score_percent = round((avg_correct / POINTS_TOTAL) * 100, 1) if avg_correct and POINTS_TOTAL > 0 else 0

    # Score distribution buckets
    score_distribution = []
    buckets = [
        ('0-20%', 0, 0.2),
        ('21-40%', 0.2, 0.4),
        ('41-60%', 0.4, 0.6),
        ('61-80%', 0.6, 0.8),
        ('81-100%', 0.8, 1.01),
    ]
    for label, lo_frac, hi_frac in buckets:
        lo_pts = lo_frac * POINTS_TOTAL
        hi_pts = hi_frac * POINTS_TOTAL
        count = submitted.filter(correct_count__gte=lo_pts, correct_count__lt=hi_pts).count()
        score_distribution.append({'bucket': label, 'count': count})

    return Response({
        'total_students': total_students,
        'active_students_30d': active_students_30d,
        'total_exams': total_exams,
        'total_sessions': total_sessions,
        'avg_score_percent': avg_score_percent,
        'score_distribution': score_distribution,
    })
