import random
from collections import defaultdict

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.response import Response

from .models import Question, PracticeSession
from .permissions import StudentJWTAuthentication, IsStudent
from .scoring import normalize_answer
from .serializers import PracticeSessionSerializer, QuestionResultSerializer

student_auth = [StudentJWTAuthentication]
student_perm = [IsStudent]


def _assemble_questions(count):
    """Pick `count` questions balanced by topic."""
    all_questions = list(Question.objects.all())
    if len(all_questions) <= count:
        return all_questions

    by_topic = defaultdict(list)
    for q in all_questions:
        by_topic[q.topic].append(q)

    for topic_list in by_topic.values():
        random.shuffle(topic_list)

    selected = []
    topics = list(by_topic.keys())
    random.shuffle(topics)
    idx = 0
    while len(selected) < count:
        topic = topics[idx % len(topics)]
        if by_topic[topic]:
            selected.append(by_topic[topic].pop())
        else:
            topics.remove(topic)
            if not topics:
                break
            idx = idx % len(topics)
            continue
        idx += 1

    return selected


@api_view(['POST'])
@authentication_classes(student_auth)
@permission_classes(student_perm)
def start_practice(request):
    mode = request.data.get('mode')
    if mode not in PracticeSession.MODE_CONFIG:
        return Response({'error': "Noto'g'ri rejim. 'light' yoki 'medium' tanlang."},
                        status=status.HTTP_400_BAD_REQUEST)

    config = PracticeSession.MODE_CONFIG[mode]
    questions = _assemble_questions(config['question_count'])

    if not questions:
        return Response({'error': "Savollar bazasi bo'sh."}, status=status.HTTP_404_NOT_FOUND)

    session = PracticeSession.objects.create(
        student=request.user,
        mode=mode,
        duration=config['duration'],
    )
    session.questions.set(questions)

    return Response(PracticeSessionSerializer(session).data, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@authentication_classes(student_auth)
@permission_classes(student_perm)
def practice_detail(request, session_id):
    session = get_object_or_404(PracticeSession, id=session_id, student=request.user)
    return Response(PracticeSessionSerializer(session).data)


@api_view(['POST'])
@authentication_classes(student_auth)
@permission_classes(student_perm)
def practice_answer(request, session_id):
    session = get_object_or_404(PracticeSession, id=session_id, student=request.user)

    if session.status == PracticeSession.Status.SUBMITTED:
        return Response({'error': 'Allaqachon topshirilgan'}, status=status.HTTP_403_FORBIDDEN)

    elapsed = (timezone.now() - session.started_at).total_seconds() / 60
    if elapsed >= session.duration:
        _submit_practice(session)
        return Response({'error': 'Vaqt tugadi, avtomatik topshirildi'}, status=status.HTTP_403_FORBIDDEN)

    question_id = request.data.get('question_id')
    answer = request.data.get('answer')
    if not question_id or answer is None:
        return Response({'error': 'question_id va answer talab qilinadi'}, status=status.HTTP_400_BAD_REQUEST)

    if not isinstance(answer, str) or len(answer) > 500:
        return Response({'error': 'Javob 500 belgidan oshmasligi kerak'}, status=status.HTTP_400_BAD_REQUEST)

    # Validate that question_id belongs to this session's question set
    valid_ids = set(str(qid) for qid in session.questions.values_list('id', flat=True))
    if str(question_id) not in valid_ids:
        return Response({'error': "Savol bu sessiyaga tegishli emas"}, status=status.HTTP_400_BAD_REQUEST)

    answers = session.answers or {}
    answers[str(question_id)] = answer
    session.answers = answers
    session.save(update_fields=['answers'])

    return Response({'message': 'Javob saqlandi'})


@api_view(['POST'])
@authentication_classes(student_auth)
@permission_classes(student_perm)
def practice_submit(request, session_id):
    session = get_object_or_404(PracticeSession, id=session_id, student=request.user)

    if session.status == PracticeSession.Status.SUBMITTED:
        return Response({'error': 'Allaqachon topshirilgan'}, status=status.HTTP_403_FORBIDDEN)

    _submit_practice(session)
    return Response({'message': 'Topshirildi'})


@api_view(['GET'])
@authentication_classes(student_auth)
@permission_classes(student_perm)
def practice_results(request, session_id):
    session = get_object_or_404(PracticeSession, id=session_id, student=request.user)

    if session.status != PracticeSession.Status.SUBMITTED:
        return Response({'error': 'Hali topshirilmagan'}, status=status.HTTP_403_FORBIDDEN)

    questions = session.questions.all()
    answers = session.answers or {}

    breakdown = []
    for q in questions:
        student_answer = answers.get(str(q.id), '')
        is_correct = normalize_answer(student_answer) == normalize_answer(q.correct_answer)
        breakdown.append({
            'question': QuestionResultSerializer(q).data,
            'student_answer': student_answer,
            'is_correct': is_correct,
        })

    return Response({
        'session_id': str(session.id),
        'mode': session.mode,
        'score': session.score,
        'total': questions.count(),
        'duration': session.duration,
        'started_at': session.started_at.isoformat(),
        'submitted_at': session.submitted_at.isoformat() if session.submitted_at else None,
        'breakdown': breakdown,
    })


def _submit_practice(session):
    with transaction.atomic():
        session = PracticeSession.objects.select_for_update().get(pk=session.pk)
        if session.status == PracticeSession.Status.SUBMITTED:
            return  # Already submitted, skip

        questions = {str(q.id): q for q in session.questions.all()}
        answers = session.answers or {}
        correct = 0
        for qid, q in questions.items():
            student_answer = answers.get(qid, '')
            if normalize_answer(student_answer) == normalize_answer(q.correct_answer):
                correct += 1
        session.score = correct
        session.status = PracticeSession.Status.SUBMITTED
        session.submitted_at = timezone.now()
        session.save()
