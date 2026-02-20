# Phase 3: Backend New Features

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add dashboard API, exam history, gamification (streaks + achievements), and Telegram bot notifications.

**Architecture:** New view modules for dashboard and notification logic. Gamification logic runs post-submission as part of the grading pipeline. Telegram bot uses python-telegram-bot for DM and channel notifications.

**Tech Stack:** Django 6.0.1, DRF, python-telegram-bot, Celery

**Prerequisites:** Phase 2 complete (scoring and auth updated).

---

### Task 1: Dashboard API Endpoint

**Files:**
- Create: `backend/exams/dashboard_views.py`
- Modify: `backend/exams/urls.py`

**Step 1: Write the failing test**

Create `backend/tests/test_dashboard.py`:
```python
from django.test import TestCase
from django.utils import timezone
from datetime import timedelta
from exams.models import Student, StudentRating, StudentStreak, MockExam
from django.contrib.auth.models import User


class TestDashboardData(TestCase):
    def setUp(self):
        self.student = Student.objects.create(full_name="Dashboard Test", telegram_id=33333)
        StudentRating.objects.create(student=self.student, elo=1350, rasch_scaled=62.5)
        StudentStreak.objects.create(student=self.student, current_streak=3, longest_streak=5)

    def test_dashboard_data_structure(self):
        from exams.dashboard_views import _get_dashboard_data
        data = _get_dashboard_data(self.student)
        self.assertEqual(data['elo'], 1350)
        self.assertEqual(data['rasch_scaled'], 62.5)
        self.assertEqual(data['current_streak'], 3)
        self.assertEqual(data['longest_streak'], 5)
        self.assertIn('upcoming_exam', data)
        self.assertIn('achievements', data)
        self.assertIn('exams_taken', data)
```

**Step 2: Run test to verify it fails**

Expected: FAIL — module doesn't exist

**Step 3: Implement dashboard_views.py**

Create `backend/exams/dashboard_views.py`:
```python
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from django.utils import timezone
from exams.models import (
    Student, StudentRating, StudentStreak, StudentAchievement,
    Achievement, MockExam, ExamSession,
)
from exams.permissions import IsStudent


def _get_dashboard_data(student):
    """Assemble dashboard data for a student."""
    # Rating
    try:
        rating = student.rating
        elo = rating.elo
        rasch_scaled = rating.rasch_scaled
        exams_taken = rating.exams_taken
    except StudentRating.DoesNotExist:
        elo = 1200
        rasch_scaled = 50.0
        exams_taken = 0

    # Streak
    try:
        streak = student.streak
        current_streak = streak.current_streak
        longest_streak = streak.longest_streak
    except StudentStreak.DoesNotExist:
        current_streak = 0
        longest_streak = 0

    # Achievements
    earned = StudentAchievement.objects.filter(
        student=student
    ).select_related('achievement').order_by('-earned_at')
    achievements = [
        {
            'name': sa.achievement.name,
            'type': sa.achievement.type,
            'icon': sa.achievement.icon,
            'earned_at': sa.earned_at.isoformat(),
        }
        for sa in earned
    ]

    # Upcoming exam
    now = timezone.now()
    upcoming = MockExam.objects.filter(
        scheduled_end__gt=now
    ).order_by('scheduled_start').first()

    upcoming_exam = None
    if upcoming:
        has_session = ExamSession.objects.filter(
            student=student, exam=upcoming
        ).exists()
        upcoming_exam = {
            'id': str(upcoming.id),
            'title': upcoming.title,
            'scheduled_start': upcoming.scheduled_start.isoformat(),
            'scheduled_end': upcoming.scheduled_end.isoformat(),
            'has_started': now >= upcoming.scheduled_start,
            'already_taken': has_session,
        }

    return {
        'elo': elo,
        'rasch_scaled': rasch_scaled,
        'exams_taken': exams_taken,
        'current_streak': current_streak,
        'longest_streak': longest_streak,
        'achievements': achievements,
        'upcoming_exam': upcoming_exam,
    }


@api_view(['GET'])
@permission_classes([IsStudent])
def dashboard(request):
    data = _get_dashboard_data(request.user)
    return Response(data)
```

**Step 4: Add URL**

In `backend/exams/urls.py`:
```python
from exams import dashboard_views

# In urlpatterns:
path('me/dashboard/', dashboard_views.dashboard, name='dashboard'),
```

**Step 5: Run test**

Expected: PASS

**Step 6: Commit**
```bash
git add backend/exams/dashboard_views.py backend/exams/urls.py backend/tests/test_dashboard.py
git commit -m "feat: add /me/dashboard/ endpoint"
```

---

### Task 2: Exam History API Endpoint

**Files:**
- Modify: `backend/exams/dashboard_views.py`
- Modify: `backend/exams/urls.py`

**Step 1: Write the failing test**

Add to `backend/tests/test_dashboard.py`:
```python
class TestExamHistory(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user('admin', password='test')
        self.student = Student.objects.create(full_name="History Test", telegram_id=44444)
        now = timezone.now()
        self.exam = MockExam.objects.create(
            title="Past Exam",
            scheduled_start=now - timedelta(hours=5),
            scheduled_end=now - timedelta(hours=2),
            duration=150,
            created_by=self.admin,
        )
        self.session = ExamSession.objects.create(
            student=self.student, exam=self.exam,
            status='submitted', submitted_at=now - timedelta(hours=3),
        )

    def test_history_returns_past_exams(self):
        from exams.dashboard_views import _get_exam_history
        history = _get_exam_history(self.student)
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]['exam_title'], 'Past Exam')
        self.assertIn('session_id', history[0])
        self.assertIn('submitted_at', history[0])
```

**Step 2: Implement history**

Add to `backend/exams/dashboard_views.py`:
```python
def _get_exam_history(student):
    """Get list of past exams with scores."""
    sessions = ExamSession.objects.filter(
        student=student,
        status='submitted',
    ).select_related('exam').order_by('-submitted_at')

    history = []
    for session in sessions:
        # Get score data
        from exams.models import StudentAnswer, EloHistory
        correct = StudentAnswer.objects.filter(
            session=session, is_correct=True
        ).count()

        elo_entry = EloHistory.objects.filter(session=session).first()

        history.append({
            'session_id': str(session.id),
            'exam_id': str(session.exam.id),
            'exam_title': session.exam.title,
            'submitted_at': session.submitted_at.isoformat() if session.submitted_at else None,
            'exercises_correct': correct,
            'exercises_total': 45,
            'rasch_scaled': elo_entry.rasch_after if elo_entry else None,
            'elo_delta': elo_entry.elo_delta if elo_entry else None,
            'is_auto_submitted': session.is_auto_submitted,
        })

    return history


@api_view(['GET'])
@permission_classes([IsStudent])
def exam_history(request):
    history = _get_exam_history(request.user)
    return Response(history)
```

**Step 3: Add URL**

```python
path('me/history/', dashboard_views.exam_history, name='exam-history'),
```

**Step 4: Run test, commit**
```bash
git commit -m "feat: add /me/history/ endpoint for past exam list"
```

---

### Task 3: Achievements API Endpoint

**Files:**
- Modify: `backend/exams/dashboard_views.py`
- Modify: `backend/exams/urls.py`

**Step 1: Add endpoint to dashboard_views.py**

```python
@api_view(['GET'])
@permission_classes([IsStudent])
def achievements(request):
    earned = StudentAchievement.objects.filter(
        student=request.user
    ).select_related('achievement').order_by('-earned_at')

    all_achievements = Achievement.objects.all()

    earned_ids = set(sa.achievement_id for sa in earned)
    result = []
    for a in all_achievements:
        result.append({
            'id': str(a.id),
            'name': a.name,
            'type': a.type,
            'description': a.description,
            'icon': a.icon,
            'threshold': a.threshold,
            'earned': a.id in earned_ids,
            'earned_at': next(
                (sa.earned_at.isoformat() for sa in earned if sa.achievement_id == a.id),
                None
            ),
        })

    return Response(result)
```

**Step 2: Add URL**
```python
path('me/achievements/', dashboard_views.achievements, name='achievements'),
```

**Step 3: Commit**
```bash
git commit -m "feat: add /me/achievements/ endpoint"
```

---

### Task 4: Streak Logic — Update After Exam Submission

**Files:**
- Create: `backend/exams/gamification.py`

**Step 1: Write the failing test**

Create `backend/tests/test_gamification.py`:
```python
from django.test import TestCase
from django.utils import timezone
from datetime import timedelta
from exams.models import Student, StudentStreak, MockExam, ExamSession
from exams.gamification import update_streak
from django.contrib.auth.models import User


class TestStreakLogic(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user('admin', password='test')
        self.student = Student.objects.create(full_name="Streak User", telegram_id=55555)

    def test_first_exam_starts_streak_at_1(self):
        update_streak(self.student)
        streak = StudentStreak.objects.get(student=self.student)
        self.assertEqual(streak.current_streak, 1)

    def test_consecutive_exams_increment_streak(self):
        # First exam
        update_streak(self.student)
        # Second consecutive exam
        update_streak(self.student)
        streak = StudentStreak.objects.get(student=self.student)
        self.assertEqual(streak.current_streak, 2)

    def test_longest_streak_tracked(self):
        for _ in range(5):
            update_streak(self.student)
        streak = StudentStreak.objects.get(student=self.student)
        self.assertEqual(streak.longest_streak, 5)
```

**Step 2: Implement gamification.py**

Create `backend/exams/gamification.py`:
```python
from django.utils import timezone
from exams.models import (
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

    # Increment streak (exam-based, not week-based)
    streak.current_streak += 1
    streak.longest_streak = max(streak.longest_streak, streak.current_streak)
    streak.last_exam_date = today
    streak.save()


def check_streak_broken(student, exam):
    """
    Check if student missed the previous exam (streak break).
    Called when a new exam starts.
    """
    try:
        streak = student.streak
    except StudentStreak.DoesNotExist:
        return  # No streak to break

    # Find the previous exam (before current one)
    from exams.models import MockExam
    prev_exam = MockExam.objects.filter(
        scheduled_end__lt=exam.scheduled_start
    ).order_by('-scheduled_end').first()

    if prev_exam is None:
        return  # This is the first exam ever

    # Check if student participated in previous exam
    participated = ExamSession.objects.filter(
        student=student, exam=prev_exam, status='submitted'
    ).exists()

    if not participated:
        streak.current_streak = 0
        streak.save()


def check_and_award_achievements(student, session):
    """
    Check all achievement conditions and award any newly earned ones.
    Called after exam submission and scoring.
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
        # "First Exam", "5 Exams", "10 Exams" — threshold = number of exams
        if ia.description.lower().startswith('complete') and rating.exams_taken >= ia.threshold:
            _, created = StudentAchievement.objects.get_or_create(
                student=student, achievement=ia,
                defaults={'session': session}
            )
            if created:
                newly_earned.append(ia.name)

    return newly_earned
```

**Step 3: Integrate into submission pipeline**

In `backend/exams/student_views.py`, at the end of `_submit_session`:
```python
from exams.gamification import update_streak, check_streak_broken, check_and_award_achievements

# After grading and ELO update:
check_streak_broken(session.student, session.exam)
update_streak(session.student)
check_and_award_achievements(session.student, session)
```

**Step 4: Run test, commit**
```bash
git commit -m "feat: add streak tracking and achievement awarding on exam submission"
```

---

### Task 5: Telegram Bot Notifications

**Files:**
- Create: `backend/exams/notifications.py`
- Modify: `backend/requirements.txt` (add python-telegram-bot)
- Modify: `backend/exams/views.py` (trigger after exam creation)

**Step 1: Install dependency**

Run: `cd /Users/izzatbekkhamraev/XLOG/math/backend && pip install python-telegram-bot`

Add to `requirements.txt`:
```
python-telegram-bot==22.0
```

**Step 2: Create notifications.py**

```python
import logging
from django.conf import settings

logger = logging.getLogger(__name__)

TELEGRAM_BOT_TOKEN = settings.TELEGRAM_BOT_TOKEN
TELEGRAM_CHANNEL_ID = getattr(settings, 'TELEGRAM_CHANNEL_ID', None)


async def _send_telegram_message(chat_id, text):
    """Send a message to a specific Telegram chat."""
    from telegram import Bot
    bot = Bot(token=TELEGRAM_BOT_TOKEN)
    try:
        await bot.send_message(chat_id=chat_id, text=text, parse_mode='HTML')
    except Exception as e:
        logger.warning(f"Failed to send Telegram message to {chat_id}: {e}")


def notify_new_exam(exam):
    """
    Notify all registered users and channel about a new exam.
    Runs as Celery task to avoid blocking.
    """
    import asyncio
    from exams.models import Student

    text = (
        f"📝 <b>New Mock Exam Available!</b>\n\n"
        f"<b>{exam.title}</b>\n"
        f"📅 Starts: {exam.scheduled_start.strftime('%B %d, %Y at %H:%M')}\n"
        f"📅 Ends: {exam.scheduled_end.strftime('%B %d, %Y at %H:%M')}\n"
        f"⏱ Duration: {exam.duration} minutes\n\n"
        f"Open the Mini App to participate!"
    )

    loop = asyncio.new_event_loop()

    # Send to channel
    if TELEGRAM_CHANNEL_ID:
        try:
            loop.run_until_complete(_send_telegram_message(TELEGRAM_CHANNEL_ID, text))
        except Exception as e:
            logger.error(f"Channel notification failed: {e}")

    # Send DMs to all registered students
    students = Student.objects.all().values_list('telegram_id', flat=True)
    for tid in students:
        try:
            loop.run_until_complete(_send_telegram_message(tid, text))
        except Exception as e:
            logger.warning(f"DM to {tid} failed: {e}")

    loop.close()
```

**Step 3: Add Celery task for async notification**

Add to `backend/exams/tasks.py`:
```python
@shared_task
def send_exam_notification(exam_id):
    from exams.models import MockExam
    from exams.notifications import notify_new_exam
    try:
        exam = MockExam.objects.get(id=exam_id)
        notify_new_exam(exam)
    except MockExam.DoesNotExist:
        logger.error(f"Exam {exam_id} not found for notification")
```

**Step 4: Trigger notification on exam creation**

In `backend/exams/views.py`, in `admin_exams` POST handler, after creating exam:
```python
from exams.tasks import send_exam_notification
send_exam_notification.delay(str(exam.id))
```

**Step 5: Add TELEGRAM_CHANNEL_ID to settings.py**

```python
TELEGRAM_CHANNEL_ID = os.environ.get('TELEGRAM_CHANNEL_ID')
```

**Step 6: Add admin notify endpoint**

In `backend/exams/views.py`:
```python
@api_view(['POST'])
@permission_classes([IsAdminUser])
def admin_notify(request):
    exam_id = request.data.get('exam_id')
    if not exam_id:
        return Response({'error': 'exam_id required'}, status=400)
    from exams.tasks import send_exam_notification
    send_exam_notification.delay(exam_id)
    return Response({'status': 'Notification queued'})
```

**Step 7: Add URL**
```python
path('admin/notify/', views.admin_notify, name='admin-notify'),
```

**Step 8: Commit**
```bash
git add backend/exams/notifications.py backend/exams/tasks.py backend/exams/views.py backend/exams/urls.py backend/requirements.txt backend/config/settings.py
git commit -m "feat: Telegram bot DM + channel notifications for new exams"
```

---

### Task 6: Admin Item Analysis Endpoint

**Files:**
- Modify: `backend/exams/views.py`
- Modify: `backend/exams/urls.py`

**Step 1: Implement item analysis view**

Add to `backend/exams/views.py`:
```python
@api_view(['GET'])
@permission_classes([IsAdminUser])
def admin_item_analysis(request, exam_id):
    """Rasch item analysis for an exam."""
    exam = get_object_or_404(MockExam, id=exam_id)

    items = ItemDifficulty.objects.filter(exam=exam).order_by('question_number', 'sub_part')

    analysis = []
    for item in items:
        flag = None
        if item.infit and (item.infit < 0.7 or item.infit > 1.3):
            flag = 'misfit_infit'
        if item.outfit and (item.outfit < 0.7 or item.outfit > 1.3):
            flag = 'misfit_outfit' if not flag else 'misfit_both'

        # Get % correct for this item
        from exams.models import StudentAnswer, ExamSession
        total = StudentAnswer.objects.filter(
            session__exam=exam,
            session__status='submitted',
            question_number=item.question_number,
            sub_part=item.sub_part or '',
        ).count()
        correct = StudentAnswer.objects.filter(
            session__exam=exam,
            session__status='submitted',
            question_number=item.question_number,
            sub_part=item.sub_part or '',
            is_correct=True,
        ).count()

        analysis.append({
            'question_number': item.question_number,
            'sub_part': item.sub_part,
            'beta': round(item.beta, 3),
            'infit': round(item.infit, 3) if item.infit else None,
            'outfit': round(item.outfit, 3) if item.outfit else None,
            'percent_correct': round(correct / total * 100, 1) if total > 0 else 0,
            'total_responses': total,
            'flag': flag,
        })

    return Response({
        'exam_id': str(exam.id),
        'exam_title': exam.title,
        'items': analysis,
        'total_participants': ExamSession.objects.filter(
            exam=exam, status='submitted'
        ).count(),
    })
```

**Step 2: Add URL**
```python
path('admin/exams/<uuid:exam_id>/item-analysis/', views.admin_item_analysis, name='admin-item-analysis'),
```

**Step 3: Commit**
```bash
git commit -m "feat: add admin item analysis endpoint with Rasch stats"
```

---

### Task 7: Admin Analytics Endpoint

**Files:**
- Modify: `backend/exams/views.py`
- Modify: `backend/exams/urls.py`

**Step 1: Implement analytics view**

```python
@api_view(['GET'])
@permission_classes([IsAdminUser])
def admin_analytics(request):
    """Platform-wide analytics."""
    from django.db.models import Count, Avg
    from exams.models import Student, ExamSession, StudentRating

    total_students = Student.objects.count()
    active_students = ExamSession.objects.values('student').distinct().count()
    total_exams = MockExam.objects.count()
    total_sessions = ExamSession.objects.filter(status='submitted').count()

    # Score distribution for most recent exam
    latest_exam = MockExam.objects.order_by('-scheduled_end').first()
    score_distribution = []
    if latest_exam:
        sessions = ExamSession.objects.filter(
            exam=latest_exam, status='submitted'
        )
        for session in sessions:
            correct = StudentAnswer.objects.filter(
                session=session, is_correct=True
            ).count()
            score_distribution.append(correct)

    # User growth (students registered per month)
    from django.db.models.functions import TruncMonth
    growth = Student.objects.annotate(
        month=TruncMonth('created_at')
    ).values('month').annotate(count=Count('id')).order_by('month')

    # ELO distribution
    elo_distribution = list(
        StudentRating.objects.values_list('elo', flat=True)
    )

    return Response({
        'total_students': total_students,
        'active_students': active_students,
        'total_exams': total_exams,
        'total_sessions': total_sessions,
        'score_distribution': score_distribution,
        'user_growth': list(growth),
        'elo_distribution': elo_distribution,
    })
```

**Step 2: Add URL**
```python
path('admin/analytics/', views.admin_analytics, name='admin-analytics'),
```

**Step 3: Commit**
```bash
git commit -m "feat: add admin analytics endpoint"
```

---

## Phase 3 Summary

| Task | What's Added | New Files |
|------|-------------|-----------|
| 1 | Dashboard API with scores, streak, badges, upcoming exam | dashboard_views.py |
| 2 | Exam history endpoint | dashboard_views.py |
| 3 | Achievements list endpoint | dashboard_views.py |
| 4 | Streak tracking + achievement awarding logic | gamification.py |
| 5 | Telegram bot DM + channel notifications | notifications.py, tasks.py |
| 6 | Admin item analysis with Rasch stats | views.py |
| 7 | Admin platform analytics | views.py |
