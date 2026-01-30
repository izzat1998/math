import string
import random
from django.utils import timezone
from rest_framework import status, permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from .models import MockExam, CorrectAnswer, InviteCode, ExamSession, StudentAnswer
from .serializers import (
    MockExamSerializer,
    BulkCorrectAnswerSerializer,
    GenerateInviteCodesSerializer,
    InviteCodeSerializer,
)


# --- Admin Views ---

@api_view(['POST', 'GET'])
@permission_classes([permissions.IsAdminUser])
def admin_exams(request):
    if request.method == 'POST':
        serializer = MockExamSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(created_by=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    exams = MockExam.objects.all().order_by('-created_at')
    serializer = MockExamSerializer(exams, many=True)
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([permissions.IsAdminUser])
def admin_exam_answers(request, exam_id):
    try:
        exam = MockExam.objects.get(id=exam_id)
    except MockExam.DoesNotExist:
        return Response({'error': 'Imtihon topilmadi'}, status=status.HTTP_404_NOT_FOUND)
    serializer = BulkCorrectAnswerSerializer(data=request.data, context={'exam': exam})
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response({'message': 'Javoblar saqlandi'}, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([permissions.IsAdminUser])
def admin_generate_invite_codes(request, exam_id):
    try:
        exam = MockExam.objects.get(id=exam_id)
    except MockExam.DoesNotExist:
        return Response({'error': 'Imtihon topilmadi'}, status=status.HTTP_404_NOT_FOUND)
    serializer = GenerateInviteCodesSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    count = serializer.validated_data['count']
    codes = []
    for _ in range(count):
        code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
        codes.append(InviteCode(exam=exam, code=code))
    InviteCode.objects.bulk_create(codes)
    return Response(
        InviteCodeSerializer(codes, many=True).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(['GET'])
@permission_classes([permissions.IsAdminUser])
def admin_exam_results(request, exam_id):
    try:
        exam = MockExam.objects.get(id=exam_id)
    except MockExam.DoesNotExist:
        return Response({'error': 'Imtihon topilmadi'}, status=status.HTTP_404_NOT_FOUND)
    sessions = ExamSession.objects.filter(
        exam=exam, status=ExamSession.Status.SUBMITTED
    ).select_related('student')
    results = []
    for session in sessions:
        answers = StudentAnswer.objects.filter(session=session)
        points = answers.filter(is_correct=True).count()
        exercises_correct = 0
        for q in range(1, 36):
            if answers.filter(question_number=q, is_correct=True).exists():
                exercises_correct += 1
        for q in range(36, 46):
            a_correct = answers.filter(question_number=q, sub_part='a', is_correct=True).exists()
            b_correct = answers.filter(question_number=q, sub_part='b', is_correct=True).exists()
            if a_correct and b_correct:
                exercises_correct += 1
        results.append({
            'student_id': session.student.id,
            'student_name': session.student.full_name,
            'exercises_correct': exercises_correct,
            'exercises_total': 45,
            'points': points,
            'points_total': 55,
            'submitted_at': session.submitted_at,
            'is_auto_submitted': session.is_auto_submitted,
        })
    return Response(results)
