from .models import StudentAnswer

SINGLE_QUESTIONS = range(1, 36)
PAIRED_QUESTIONS = range(36, 46)
EXERCISES_TOTAL = 45
POINTS_TOTAL = 55


def compute_score(session):
    """Compute exercises_correct and points for a submitted session.

    Returns a dict with exercises_correct, exercises_total, points, points_total.
    """
    answers = StudentAnswer.objects.filter(session=session, is_correct=True)
    points = answers.count()

    correct_keys = set(
        answers.values_list('question_number', 'sub_part')
    )
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
