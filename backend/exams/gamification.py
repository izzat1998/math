from django.utils import timezone

from .models import (
    StudentStreak, StudentAchievement, Achievement,
    StudentRating, ExamSession,
)


def update_streak(student):
    """
    Update exam-based streak. Called after each exam submission.
    Streak = consecutive exams participated in.
    """
    streak, created = StudentStreak.objects.get_or_create(
        student=student,
        defaults={'current_streak': 0, 'longest_streak': 0}
    )

    today = timezone.now().date()

    streak.current_streak += 1
    streak.longest_streak = max(streak.longest_streak, streak.current_streak)
    streak.last_exam_date = today
    streak.save()


def check_streak_broken(student, exam):
    """
    Check if student missed the previous exam (streak break).
    Called before update_streak.
    """
    try:
        streak = student.streak
    except StudentStreak.DoesNotExist:
        return

    from .models import MockExam
    prev_exam = MockExam.objects.filter(
        scheduled_end__lt=exam.scheduled_start
    ).order_by('-scheduled_end').first()

    if prev_exam is None:
        return

    participated = ExamSession.objects.filter(
        student=student, exam=prev_exam, status='submitted'
    ).exists()

    if not participated:
        streak.current_streak = 0
        streak.save()


def check_and_award_achievements(student, session):
    """
    Check all achievement conditions and award any newly earned ones.
    Returns list of newly earned achievement names (for notifications).
    """
    newly_earned = []

    try:
        rating = student.rating
    except StudentRating.DoesNotExist:
        return newly_earned

    try:
        streak = student.streak
    except StudentStreak.DoesNotExist:
        streak = None

    # Check milestone achievements (Rasch score thresholds)
    if rating.rasch_scaled is not None:
        milestones = Achievement.objects.filter(type='milestone')
        for m in milestones:
            if rating.rasch_scaled >= m.threshold:
                _, created = StudentAchievement.objects.get_or_create(
                    student=student, achievement=m,
                    defaults={'session': session}
                )
                if created:
                    newly_earned.append(m.name)

    # Check streak achievements
    if streak:
        streak_achievements = Achievement.objects.filter(type='streak')
        for sa in streak_achievements:
            if streak.current_streak >= sa.threshold:
                _, created = StudentAchievement.objects.get_or_create(
                    student=student, achievement=sa,
                    defaults={'session': session}
                )
                if created:
                    newly_earned.append(sa.name)

    # Check improvement achievements (exams completed count)
    improvement_achievements = Achievement.objects.filter(type='improvement')
    for ia in improvement_achievements:
        if rating.exams_taken >= ia.threshold:
            _, created = StudentAchievement.objects.get_or_create(
                student=student, achievement=ia,
                defaults={'session': session}
            )
            if created:
                newly_earned.append(ia.name)

    return newly_earned
