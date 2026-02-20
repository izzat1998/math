import logging
import secrets
import string

from django.shortcuts import get_object_or_404
from rest_framework import status, permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from .models import MockExam, ExamSession, InviteCode
from .scoring import compute_score
from .serializers import (
    MockExamSerializer,
    BulkCorrectAnswerSerializer,
    GenerateInviteCodesSerializer,
    InviteCodeSerializer,
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


@api_view(['GET', 'POST'])
@permission_classes(admin_perm)
def admin_generate_invite_codes(request, exam_id):
    exam = get_object_or_404(MockExam, id=exam_id)

    if request.method == 'GET':
        codes = InviteCode.objects.filter(exam=exam).order_by('-id')
        return Response(InviteCodeSerializer(codes, many=True).data)

    serializer = GenerateInviteCodesSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    count = serializer.validated_data['count']
    alphabet = string.ascii_uppercase + string.digits
    codes = [
        InviteCode(exam=exam, code=''.join(secrets.choice(alphabet) for _ in range(10)))
        for _ in range(count)
    ]
    InviteCode.objects.bulk_create(codes)
    logger.info('Admin %s generated %d invite codes for exam %s', request.user.username, count, exam_id)
    return Response(InviteCodeSerializer(codes, many=True).data, status=status.HTTP_201_CREATED)


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
