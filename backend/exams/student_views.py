from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.response import Response

from .models import MockExam, ExamSession, StudentAnswer, CorrectAnswer
from .permissions import StudentJWTAuthentication, IsStudent
from .scoring import compute_score
from .serializers import MockExamSerializer

student_auth = [StudentJWTAuthentication]
student_perm = [IsStudent]

ALREADY_SUBMITTED_MSG = 'Allaqachon topshirilgan'


@api_view(['GET'])
@authentication_classes(student_auth)
@permission_classes(student_perm)
def exam_detail(request, exam_id):
    exam = get_object_or_404(MockExam, id=exam_id)
    now = timezone.now()
    return Response({
        **MockExamSerializer(exam).data,
        'is_open': exam.open_at <= now <= exam.close_at,
    })


@api_view(['GET'])
@authentication_classes(student_auth)
@permission_classes(student_perm)
def exam_pdf(request, exam_id):
    exam = get_object_or_404(MockExam, id=exam_id)
    return FileResponse(exam.pdf_file.open(), content_type='application/pdf')


@api_view(['POST'])
@authentication_classes(student_auth)
@permission_classes(student_perm)
def start_exam(request, exam_id):
    exam = get_object_or_404(MockExam, id=exam_id)

    now = timezone.now()
    if not (exam.open_at <= now <= exam.close_at):
        return Response({'error': 'Imtihon hozirda ochiq emas'}, status=status.HTTP_403_FORBIDDEN)

    existing = ExamSession.objects.filter(student=request.user, exam=exam).first()
    if existing:
        if existing.status == ExamSession.Status.SUBMITTED:
            return Response({'error': ALREADY_SUBMITTED_MSG}, status=status.HTTP_403_FORBIDDEN)
        return Response(_session_payload(existing, exam))

    session = ExamSession.objects.create(student=request.user, exam=exam)
    return Response(_session_payload(session, exam), status=status.HTTP_201_CREATED)


@api_view(['POST'])
@authentication_classes(student_auth)
@permission_classes(student_perm)
def save_answer(request, session_id):
    session = get_object_or_404(ExamSession, id=session_id, student=request.user)

    if session.status == ExamSession.Status.SUBMITTED:
        return Response({'error': 'Imtihon allaqachon topshirilgan'}, status=status.HTTP_403_FORBIDDEN)

    elapsed_minutes = (timezone.now() - session.started_at).total_seconds() / 60
    if elapsed_minutes >= session.exam.duration:
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
    session = get_object_or_404(ExamSession, id=session_id, student=request.user)

    if session.status == ExamSession.Status.SUBMITTED:
        return Response({'error': ALREADY_SUBMITTED_MSG}, status=status.HTTP_403_FORBIDDEN)

    _submit_session(session, auto=False)
    return Response({'message': 'Imtihon topshirildi'})


@api_view(['GET'])
@authentication_classes(student_auth)
@permission_classes(student_perm)
def session_results(request, session_id):
    session = get_object_or_404(ExamSession, id=session_id, student=request.user)

    if session.status != ExamSession.Status.SUBMITTED:
        return Response({'error': 'Imtihon hali topshirilmagan'}, status=status.HTTP_403_FORBIDDEN)

    score = compute_score(session)
    answers = StudentAnswer.objects.filter(session=session).order_by('question_number', 'sub_part')

    exam_closed = timezone.now() > session.exam.close_at
    correct_answers = {}
    if exam_closed:
        correct_answers = {
            (ca.question_number, ca.sub_part): ca.correct_answer
            for ca in CorrectAnswer.objects.filter(exam=session.exam)
        }

    breakdown = [
        {
            'question_number': a.question_number,
            'sub_part': a.sub_part,
            'is_correct': a.is_correct,
            'student_answer': a.answer,
            'correct_answer': correct_answers.get((a.question_number, a.sub_part)) if exam_closed else None,
        }
        for a in answers
    ]

    return Response({
        **score,
        'is_auto_submitted': session.is_auto_submitted,
        'exam_closed': exam_closed,
        'exam_title': session.exam.title,
        'breakdown': breakdown,
    })


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _session_payload(session, exam):
    return {
        'session_id': str(session.id),
        'started_at': session.started_at.isoformat(),
        'duration': exam.duration,
    }


def _submit_session(session, auto=False):
    """Grade all answers and mark session as submitted."""
    correct_answers = {
        (ca.question_number, ca.sub_part): ca.correct_answer
        for ca in CorrectAnswer.objects.filter(exam=session.exam)
    }

    student_answers = list(StudentAnswer.objects.filter(session=session))
    for answer in student_answers:
        key = (answer.question_number, answer.sub_part)
        expected = correct_answers.get(key, '')
        answer.is_correct = answer.answer.strip().lower() == expected.strip().lower()

    StudentAnswer.objects.bulk_update(student_answers, ['is_correct'])

    session.status = ExamSession.Status.SUBMITTED
    session.submitted_at = timezone.now()
    session.is_auto_submitted = auto
    session.save()
