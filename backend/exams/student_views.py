import unicodedata

from django.db import transaction
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .elo import update_elo_after_submission
from .models import MockExam, ExamSession, StudentAnswer, CorrectAnswer, EloHistory
from .permissions import StudentJWTAuthentication, IsStudent
from .scoring import compute_score, compute_rasch_score
from .serializers import MockExamSerializer

student_auth = [StudentJWTAuthentication]
student_perm = [IsStudent]

ALREADY_SUBMITTED_MSG = 'Allaqachon topshirilgan'


@api_view(['GET'])
@permission_classes([AllowAny])
def latest_exam(request):
    """Public endpoint: returns the latest exam ID."""
    exam = MockExam.objects.order_by('-created_at').first()
    if not exam:
        return Response({'error': 'No exams found'}, status=status.HTTP_404_NOT_FOUND)
    return Response({'exam_id': str(exam.id)})


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
    if not exam.pdf_file:
        return Response({'error': 'PDF fayl topilmadi'}, status=status.HTTP_404_NOT_FOUND)
    f = exam.pdf_file.open()
    return FileResponse(f, content_type='application/pdf')


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
    answer = request.data.get('answer')
    sub_part = request.data.get('sub_part') or None

    try:
        question_number = int(request.data.get('question_number'))
    except (TypeError, ValueError):
        return Response({'error': 'Savol raqami butun son bo\'lishi kerak'}, status=status.HTTP_400_BAD_REQUEST)

    if question_number < 1 or question_number > 45:
        return Response({'error': 'Savol raqami 1 dan 45 gacha bo\'lishi kerak'}, status=status.HTTP_400_BAD_REQUEST)

    if not answer or not isinstance(answer, str):
        return Response({'error': 'Javob talab qilinadi'}, status=status.HTTP_400_BAD_REQUEST)

    if len(answer) > 500:
        return Response({'error': 'Javob 500 belgidan oshmasligi kerak'}, status=status.HTTP_400_BAD_REQUEST)

    if sub_part and sub_part not in ('a', 'b'):
        return Response({'error': 'sub_part faqat "a" yoki "b" bo\'lishi mumkin'}, status=status.HTTP_400_BAD_REQUEST)

    # Questions 1-35 should not have sub_part; 36-45 require it
    if question_number <= 35 and sub_part:
        return Response({'error': '1-35 savollar uchun sub_part kerak emas'}, status=status.HTTP_400_BAD_REQUEST)

    if question_number >= 36 and not sub_part:
        return Response({'error': '36-45 savollar uchun sub_part ("a" yoki "b") talab qilinadi'}, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        session = get_object_or_404(
            ExamSession.objects.select_for_update(),
            id=session_id, student=request.user,
        )

        if session.status == ExamSession.Status.SUBMITTED:
            return Response({'error': 'Imtihon allaqachon topshirilgan'}, status=status.HTTP_403_FORBIDDEN)

        elapsed_minutes = (timezone.now() - session.started_at).total_seconds() / 60
        if elapsed_minutes >= session.exam.duration:
            _submit_session(session, auto=True)
            return Response({'error': 'Vaqt tugadi, imtihon avtomatik topshirildi'}, status=status.HTTP_403_FORBIDDEN)

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
    with transaction.atomic():
        session = get_object_or_404(
            ExamSession.objects.select_for_update(),
            id=session_id, student=request.user,
        )

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

    exam_closed = timezone.now() > session.exam.close_at

    # Hold back all results until the exam window closes
    if not exam_closed:
        return Response({
            'exam_closed': False,
            'exam_title': session.exam.title,
            'is_auto_submitted': session.is_auto_submitted,
            'message': 'Natijalar imtihon yopilgandan keyin e\'lon qilinadi',
        })

    score = compute_score(session)
    answers = StudentAnswer.objects.filter(session=session).order_by('question_number', 'sub_part')

    breakdown = [
        {
            'question_number': a.question_number,
            'sub_part': a.sub_part,
            'is_correct': a.is_correct,
            'student_answer': a.answer,
        }
        for a in answers
    ]

    elo_data = None
    try:
        snapshot = session.elo_snapshot
        elo_data = {
            'elo_before': snapshot.elo_before,
            'elo_after': snapshot.elo_after,
            'elo_delta': snapshot.elo_delta,
        }
    except EloHistory.DoesNotExist:
        pass

    rasch_data = compute_rasch_score(session)

    return Response({
        **score,
        'is_auto_submitted': session.is_auto_submitted,
        'exam_closed': exam_closed,
        'exam_title': session.exam.title,
        'breakdown': breakdown,
        'elo': elo_data,
        'rasch': rasch_data,
    })


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _normalize_answer(text):
    """Normalize answer text for comparison: strip, lowercase, remove accents."""
    text = text.strip().lower()
    # Normalize unicode math symbols to their ASCII equivalents
    text = text.replace('\u2212', '-')  # unicode minus → hyphen-minus
    text = text.replace('\u00d7', '*')  # multiplication sign → asterisk
    text = text.replace('\u00f7', '/')  # division sign → slash
    nfkd = unicodedata.normalize('NFKD', text)
    return ''.join(c for c in nfkd if not unicodedata.combining(c))


def _session_payload(session, exam):
    return {
        'session_id': str(session.id),
        'started_at': session.started_at.isoformat(),
        'duration': exam.duration,
    }


@api_view(['GET'])
@permission_classes([AllowAny])
def upcoming_exam(request):
    now = timezone.now()
    exam = MockExam.objects.filter(
        is_scheduled=True,
        scheduled_end__gt=now,
    ).order_by('scheduled_start').first()

    if not exam:
        return Response({'exam': None})

    return Response({
        'exam': {
            'id': str(exam.id),
            'title': exam.title,
            'scheduled_start': exam.scheduled_start.isoformat(),
            'scheduled_end': exam.scheduled_end.isoformat(),
            'has_started': now >= exam.scheduled_start,
        }
    })


@api_view(['GET'])
@authentication_classes(student_auth)
@permission_classes(student_perm)
def exam_lobby(request, exam_id):
    exam = get_object_or_404(MockExam, id=exam_id, is_scheduled=True)
    now = timezone.now()

    return Response({
        'id': str(exam.id),
        'title': exam.title,
        'scheduled_start': exam.scheduled_start.isoformat(),
        'scheduled_end': exam.scheduled_end.isoformat(),
        'has_started': now >= exam.scheduled_start,
        'has_ended': now >= exam.scheduled_end,
    })


def _submit_session(session, auto=False):
    """Grade all answers and mark session as submitted.

    Expects to be called inside a transaction with the session already
    locked via select_for_update(). The Celery task path uses
    submit_session_safe() which acquires its own lock.
    """
    if session.status == ExamSession.Status.SUBMITTED:
        return  # Already submitted (race condition guard)

    correct_answers = {
        (ca.question_number, ca.sub_part): ca.correct_answer
        for ca in CorrectAnswer.objects.filter(exam=session.exam)
    }

    student_answers = list(StudentAnswer.objects.filter(session=session))
    for answer in student_answers:
        key = (answer.question_number, answer.sub_part)
        expected = correct_answers.get(key, '')
        answer.is_correct = _normalize_answer(answer.answer) == _normalize_answer(expected)

    StudentAnswer.objects.bulk_update(student_answers, ['is_correct'], batch_size=100)

    session.status = ExamSession.Status.SUBMITTED
    session.submitted_at = timezone.now()
    session.is_auto_submitted = auto
    session.save()

    update_elo_after_submission(session)


def submit_session_safe(session_id, auto=False):
    """Thread-safe submission entry point for Celery tasks."""
    with transaction.atomic():
        try:
            session = ExamSession.objects.select_for_update().get(id=session_id)
        except ExamSession.DoesNotExist:
            return
        _submit_session(session, auto=auto)
