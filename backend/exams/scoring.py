import unicodedata

import numpy as np

from .models import StudentAnswer, CorrectAnswer, ItemDifficulty
from .rasch import rasch_probability, estimate_theta

SINGLE_QUESTIONS = range(1, 36)
PAIRED_QUESTIONS = range(36, 46)
EXERCISES_TOTAL = 45
POINTS_TOTAL = 55


def normalize_answer(text):
    """Normalize answer text for comparison: strip, lowercase, remove accents, normalize math symbols."""
    text = text.strip().lower()
    text = text.replace('\u2212', '-')  # unicode minus → hyphen-minus
    text = text.replace('\u00d7', '*')  # multiplication sign → asterisk
    text = text.replace('\u00f7', '/')  # division sign → slash
    nfkd = unicodedata.normalize('NFKD', text)
    return ''.join(c for c in nfkd if not unicodedata.combining(c))


def compute_score(session, prefetched_answers=None):
    """Compute exercises_correct and points for a submitted session.

    Returns a dict with exercises_correct, exercises_total, points, points_total.

    If *prefetched_answers* is provided (e.g. from prefetch_related), it will
    be used instead of issuing a new query — avoids N+1 in list views.
    """
    if prefetched_answers is not None:
        correct = [a for a in prefetched_answers if a.is_correct]
        points = len(correct)
        correct_keys = {(a.question_number, a.sub_part) for a in correct}
    else:
        answers = StudentAnswer.objects.filter(session=session, is_correct=True)
        points = answers.count()
        correct_keys = set(answers.values_list('question_number', 'sub_part'))
    correct_question_numbers = {q for q, _ in correct_keys}

    exercises_correct = 0
    for q in SINGLE_QUESTIONS:
        if q in correct_question_numbers:
            exercises_correct += 1

    for q in PAIRED_QUESTIONS:
        if (q, 'a') in correct_keys and (q, 'b') in correct_keys:
            exercises_correct += 1

    return {
        'exercises_correct': exercises_correct,
        'exercises_total': EXERCISES_TOTAL,
        'points': points,
        'points_total': POINTS_TOTAL,
    }


def compute_rasch_score(session):
    """Compute Rasch-model score for a submitted session.

    Returns dict with theta, rasch_percentage, expected_score, raw_percentage,
    or None if no ItemDifficulty records exist for the exam.
    """
    difficulties = list(
        ItemDifficulty.objects.filter(exam=session.exam)
        .order_by('question_number', 'sub_part')
    )
    if not difficulties:
        return None

    # Build item key → beta mapping
    item_map = {(d.question_number, d.sub_part): d.beta for d in difficulties}

    # Get correct answers for this exam to know the full item set
    correct_answers = list(
        CorrectAnswer.objects.filter(exam=session.exam)
        .order_by('question_number', 'sub_part')
    )

    # Build student's binary response vector aligned with item difficulties
    student_answers = {
        (a.question_number, a.sub_part): a.is_correct
        for a in StudentAnswer.objects.filter(session=session)
    }

    responses = []
    betas = []
    for ca in correct_answers:
        key = (ca.question_number, ca.sub_part)
        if key in item_map:
            betas.append(item_map[key])
            responses.append(1.0 if student_answers.get(key, False) else 0.0)

    if not betas:
        return None

    betas_arr = np.array(betas)
    responses_arr = np.array(responses)

    theta = estimate_theta(responses_arr, betas_arr)

    # Expected score = sum of P(correct) for each item at this theta
    expected_score = sum(rasch_probability(theta, b) for b in betas)

    raw_correct = responses_arr.sum()
    total_items = len(betas)

    return {
        'theta': round(theta, 2),
        'rasch_percentage': round(expected_score / total_items * 100, 1),
        'expected_score': round(expected_score, 1),
        'raw_percentage': round(raw_correct / total_items * 100, 1),
    }


_GRADE_TABLE = [
    (70, 'A+'),
    (64, 'A'),
    (60, 'B+'),
    (55, 'B'),
    (50, 'C+'),
    (46, 'C'),
]


def compute_letter_grade(rasch_scaled):
    """Compute letter grade from Rasch scaled score (0-75) using Milliy Sertifikat fixed grade table."""
    if rasch_scaled is None:
        return None

    for threshold, grade in _GRADE_TABLE:
        if rasch_scaled >= threshold:
            return grade
    return 'D'


MIN_RASCH_PARTICIPANTS = 10


def compute_rasch_scaled_score(theta, min_theta=-4.0, max_theta=4.0):
    """Convert Rasch theta (logits) to 0-75 Milliy Sertifikat scale. Clamps to [0, 75]."""
    scaled = ((theta - min_theta) / (max_theta - min_theta)) * 75
    return max(0.0, min(75.0, round(scaled, 1)))
