from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.response import Response
from .models import MockExam, ExamSession, StudentAnswer, CorrectAnswer
from .permissions import StudentJWTAuthentication, IsStudent
from .serializers import MockExamSerializer

student_auth = [StudentJWTAuthentication]
student_perm = [IsStudent]


@api_view(['GET'])
@authentication_classes(student_auth)
@permission_classes(student_perm)
def exam_detail(request, exam_id):
    try:
        exam = MockExam.objects.get(id=exam_id)
    except MockExam.DoesNotExist:
        return Response({'error': 'Imtihon topilmadi'}, status=status.HTTP_404_NOT_FOUND)

    now = timezone.now()
    return Response({
        **MockExamSerializer(exam).data,
        'is_open': exam.open_at <= now <= exam.close_at,
    })


@api_view(['GET'])
@authentication_classes(student_auth)
@permission_classes(student_perm)
def exam_pdf(request, exam_id):
    try:
        exam = MockExam.objects.get(id=exam_id)
    except MockExam.DoesNotExist:
        return Response({'error': 'Imtihon topilmadi'}, status=status.HTTP_404_NOT_FOUND)
    from django.http import FileResponse
    return FileResponse(exam.pdf_file.open(), content_type='application/pdf')


@api_view(['POST'])
@authentication_classes(student_auth)
@permission_classes(student_perm)
def start_exam(request, exam_id):
    student = request.user
    try:
        exam = MockExam.objects.get(id=exam_id)
    except MockExam.DoesNotExist:
        return Response({'error': 'Imtihon topilmadi'}, status=status.HTTP_404_NOT_FOUND)

    now = timezone.now()
    if not (exam.open_at <= now <= exam.close_at):
        return Response({'error': 'Imtihon hozirda ochiq emas'}, status=status.HTTP_403_FORBIDDEN)

    existing = ExamSession.objects.filter(student=student, exam=exam).first()
    if existing:
        if existing.status == ExamSession.Status.SUBMITTED:
            return Response({'error': 'Allaqachon topshirilgan'}, status=status.HTTP_403_FORBIDDEN)
        return Response({
            'session_id': str(existing.id),
            'started_at': existing.started_at.isoformat(),
            'duration': exam.duration,
        })

    session = ExamSession.objects.create(student=student, exam=exam)
    return Response({
        'session_id': str(session.id),
        'started_at': session.started_at.isoformat(),
        'duration': exam.duration,
    }, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@authentication_classes(student_auth)
@permission_classes(student_perm)
def save_answer(request, session_id):
    student = request.user
    try:
        session = ExamSession.objects.get(id=session_id, student=student)
    except ExamSession.DoesNotExist:
        return Response({'error': 'Sessiya topilmadi'}, status=status.HTTP_404_NOT_FOUND)

    if session.status == ExamSession.Status.SUBMITTED:
        return Response({'error': 'Imtihon allaqachon topshirilgan'}, status=status.HTTP_403_FORBIDDEN)

    now = timezone.now()
    elapsed = (now - session.started_at).total_seconds() / 60
    if elapsed >= session.exam.duration:
        _submit_session(session, auto=True)
        return Response({'error': 'Vaqt tugadi, imtihon avtomatik topshirildi'}, status=status.HTTP_403_FORBIDDEN)

    question_number = request.data.get('question_number')
    sub_part = request.data.get('sub_part')
    answer = request.data.get('answer')

    if not question_number or not answer:
        return Response({'error': 'Savol raqami va javob talab qilinadi'}, status=status.HTTP_400_BAD_REQUEST)

    StudentAnswer.objects.update_or_create(
        session=session,
        question_number=question_number,
        sub_part=sub_part,
        defaults={'answer': answer},
    )
    return Response({'message': 'Javob saqlandi'})


@api_view(['POST'])
@authentication_classes(student_auth)
@permission_classes(student_perm)
def submit_exam(request, session_id):
    student = request.user
    try:
        session = ExamSession.objects.get(id=session_id, student=student)
    except ExamSession.DoesNotExist:
        return Response({'error': 'Sessiya topilmadi'}, status=status.HTTP_404_NOT_FOUND)

    if session.status == ExamSession.Status.SUBMITTED:
        return Response({'error': 'Allaqachon topshirilgan'}, status=status.HTTP_403_FORBIDDEN)

    _submit_session(session, auto=False)
    return Response({'message': 'Imtihon topshirildi'})


def _submit_session(session, auto=False):
    """Grade all answers and mark session as submitted."""
    correct_answers = {
        (ca.question_number, ca.sub_part): ca.correct_answer
        for ca in CorrectAnswer.objects.filter(exam=session.exam)
    }

    for answer in StudentAnswer.objects.filter(session=session):
        key = (answer.question_number, answer.sub_part)
        expected = correct_answers.get(key, '')
        answer.is_correct = answer.answer.strip().lower() == expected.strip().lower()
        answer.save()

    session.status = ExamSession.Status.SUBMITTED
    session.submitted_at = timezone.now()
    session.is_auto_submitted = auto
    session.save()


@api_view(['GET'])
@authentication_classes(student_auth)
@permission_classes(student_perm)
def session_results(request, session_id):
    student = request.user
    try:
        session = ExamSession.objects.get(id=session_id, student=student)
    except ExamSession.DoesNotExist:
        return Response({'error': 'Sessiya topilmadi'}, status=status.HTTP_404_NOT_FOUND)

    if session.status != ExamSession.Status.SUBMITTED:
        return Response({'error': 'Imtihon hali topshirilmagan'}, status=status.HTTP_403_FORBIDDEN)

    answers = StudentAnswer.objects.filter(session=session).order_by('question_number', 'sub_part')
    points = answers.filter(is_correct=True).count()

    exercises_correct = 0
    for q in range(1, 36):
        if answers.filter(question_number=q, is_correct=True).exists():
            exercises_correct += 1
    for q in range(36, 46):
        a_ok = answers.filter(question_number=q, sub_part='a', is_correct=True).exists()
        b_ok = answers.filter(question_number=q, sub_part='b', is_correct=True).exists()
        if a_ok and b_ok:
            exercises_correct += 1

    exam_closed = timezone.now() > session.exam.close_at
    correct_answers = {}
    if exam_closed:
        correct_answers = {
            (ca.question_number, ca.sub_part): ca.correct_answer
            for ca in CorrectAnswer.objects.filter(exam=session.exam)
        }

    breakdown = []
    for a in answers:
        key = (a.question_number, a.sub_part)
        breakdown.append({
            'question_number': a.question_number,
            'sub_part': a.sub_part,
            'is_correct': a.is_correct,
            'student_answer': a.answer,
            'correct_answer': correct_answers.get(key) if exam_closed else None,
        })

    return Response({
        'exercises_correct': exercises_correct,
        'exercises_total': 45,
        'points': points,
        'points_total': 55,
        'is_auto_submitted': session.is_auto_submitted,
        'exam_closed': exam_closed,
        'exam_title': session.exam.title,
        'breakdown': breakdown,
    })
