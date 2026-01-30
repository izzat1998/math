import random
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

admin_perm = [permissions.IsAdminUser]


@api_view(['POST', 'GET'])
@permission_classes(admin_perm)
def admin_exams(request):
    if request.method == 'POST':
        serializer = MockExamSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(created_by=request.user)
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
    return Response({'message': 'Javoblar saqlandi'}, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes(admin_perm)
def admin_generate_invite_codes(request, exam_id):
    exam = get_object_or_404(MockExam, id=exam_id)
    serializer = GenerateInviteCodesSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    count = serializer.validated_data['count']
    codes = [
        InviteCode(exam=exam, code=''.join(random.choices(string.ascii_uppercase + string.digits, k=8)))
        for _ in range(count)
    ]
    InviteCode.objects.bulk_create(codes)
    return Response(InviteCodeSerializer(codes, many=True).data, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes(admin_perm)
def admin_exam_results(request, exam_id):
    exam = get_object_or_404(MockExam, id=exam_id)
    sessions = (
        ExamSession.objects
        .filter(exam=exam, status=ExamSession.Status.SUBMITTED)
        .select_related('student')
    )

    results = []
    for session in sessions:
        score = compute_score(session)
        results.append({
            'student_id': session.student.id,
            'student_name': session.student.full_name,
            **score,
            'submitted_at': session.submitted_at,
            'is_auto_submitted': session.is_auto_submitted,
        })

    return Response(results)
