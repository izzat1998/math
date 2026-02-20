# Phase 1: Database & Model Cleanup

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Clean up models to match the new spec — remove deprecated fields/models, add new ones, run migrations.

**Architecture:** Bottom-up approach — database layer first since every other layer depends on it. We remove InviteCode model, clean Student fields, normalize MockExam scheduling fields, and add new models for gamification (Achievement, StudentAchievement, StudentStreak) and enhanced ratings (rasch_ability, rasch_scaled on StudentRating).

**Tech Stack:** Django 6.0.1, PostgreSQL, Django migrations

**Prerequisites:** Database backup before starting.

---

### Task 1: Backup Database

**Files:**
- Run: `Makefile` target or manual `pg_dump`

**Step 1: Create backup**

Run:
```bash
cd /Users/izzatbekkhamraev/XLOG/math && make db-backup
```
Or manually:
```bash
pg_dump -U <DB_USER> <DB_NAME> > backend/backups/pre-refactor-$(date +%Y%m%d).sql
```

**Step 2: Verify backup exists**

Run: `ls -la backend/backups/`
Expected: New backup file present

**Step 3: Commit**
```bash
git add -A && git commit -m "chore: pre-refactor database backup"
```

---

### Task 2: Clean MockExam Model — Remove Deprecated Fields

**Files:**
- Modify: `backend/exams/models.py:14-28`
- Modify: `backend/exams/serializers.py:7-26`
- Modify: `backend/exams/views.py` (admin_exams, admin_exam_results)
- Modify: `backend/exams/student_views.py` (exam_detail, start_exam, save_answer, session_results, exam_lobby, upcoming_exam)
- Create: new migration

**Step 1: Write the failing test**

Create `backend/tests/test_models.py`:
```python
import pytest
from django.test import TestCase
from django.utils import timezone
from exams.models import MockExam
from django.contrib.auth.models import User


class TestMockExamModel(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user('admin', password='test')

    def test_mockexam_has_scheduled_fields(self):
        now = timezone.now()
        exam = MockExam.objects.create(
            title="Test",
            scheduled_start=now,
            scheduled_end=now + timezone.timedelta(hours=3),
            duration=150,
            created_by=self.admin,
        )
        self.assertIsNotNone(exam.scheduled_start)
        self.assertIsNotNone(exam.scheduled_end)

    def test_mockexam_no_open_at_close_at(self):
        """open_at and close_at should not exist anymore."""
        self.assertFalse(hasattr(MockExam, 'open_at') and
                         'open_at' in [f.name for f in MockExam._meta.get_fields()])

    def test_mockexam_no_is_scheduled(self):
        """is_scheduled should not exist anymore."""
        field_names = [f.name for f in MockExam._meta.get_fields()]
        self.assertNotIn('is_scheduled', field_names)
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/izzatbekkhamraev/XLOG/math/backend && python manage.py test tests.test_models.TestMockExamModel -v2`
Expected: FAIL — `open_at` still exists, `is_scheduled` still exists

**Step 3: Update MockExam model**

In `backend/exams/models.py`, replace lines 14-28 with:
```python
class MockExam(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    pdf_file = models.FileField(upload_to=exam_pdf_path)
    scheduled_start = models.DateTimeField()
    scheduled_end = models.DateTimeField()
    duration = models.IntegerField(default=150, help_text="Duration in minutes")
    created_by = models.ForeignKey(User, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title
```

Remove `open_at`, `close_at`, `is_scheduled` fields. Make `scheduled_start` and `scheduled_end` required (not nullable).

**Step 4: Update MockExamSerializer**

In `backend/exams/serializers.py`, update MockExamSerializer fields:
```python
class MockExamSerializer(serializers.ModelSerializer):
    class Meta:
        model = MockExam
        fields = ['id', 'title', 'pdf_file', 'scheduled_start', 'scheduled_end', 'duration', 'created_at']

    def validate_pdf_file(self, value):
        # keep existing validation
        ...
```

**Step 5: Create migration**

Run: `cd /Users/izzatbekkhamraev/XLOG/math/backend && python manage.py makemigrations exams`

Note: This migration will need to handle data — if any existing rows have null `scheduled_start`/`scheduled_end`, populate them from `open_at`/`close_at` before removing those columns. Create a two-step migration:

1. First migration: copy data from `open_at` → `scheduled_start`, `close_at` → `scheduled_end` for any rows where scheduled fields are null
2. Second migration: remove `open_at`, `close_at`, `is_scheduled`

**Step 6: Run migration**

Run: `cd /Users/izzatbekkhamraev/XLOG/math/backend && python manage.py migrate`

**Step 7: Run test to verify it passes**

Run: `cd /Users/izzatbekkhamraev/XLOG/math/backend && python manage.py test tests.test_models.TestMockExamModel -v2`
Expected: PASS

**Step 8: Commit**
```bash
git add backend/exams/models.py backend/exams/serializers.py backend/exams/migrations/ backend/tests/test_models.py
git commit -m "refactor: remove deprecated MockExam fields (open_at, close_at, is_scheduled)"
```

---

### Task 3: Clean Student Model — Remove email, google_id; Make telegram_id Required

**Files:**
- Modify: `backend/exams/models.py:45-54`
- Create: new migration

**Step 1: Write the failing test**

Add to `backend/tests/test_models.py`:
```python
class TestStudentModel(TestCase):
    def test_student_no_email_field(self):
        field_names = [f.name for f in Student._meta.get_fields()]
        self.assertNotIn('email', field_names)

    def test_student_no_google_id_field(self):
        field_names = [f.name for f in Student._meta.get_fields()]
        self.assertNotIn('google_id', field_names)

    def test_student_telegram_id_required(self):
        from django.db import IntegrityError
        with self.assertRaises(IntegrityError):
            Student.objects.create(full_name="Test", telegram_id=None)
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/izzatbekkhamraev/XLOG/math/backend && python manage.py test tests.test_models.TestStudentModel -v2`
Expected: FAIL

**Step 3: Update Student model**

In `backend/exams/models.py`, replace Student class:
```python
class Student(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    full_name = models.CharField(max_length=255)
    telegram_id = models.BigIntegerField(unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.full_name
```

**Step 4: Create and run migration**

Run:
```bash
cd /Users/izzatbekkhamraev/XLOG/math/backend
python manage.py makemigrations exams
python manage.py migrate
```

Note: If any Students have null telegram_id, the migration will fail. Create a data migration first to handle this (delete students with null telegram_id, or assign placeholder values).

**Step 5: Run test to verify it passes**

Run: `cd /Users/izzatbekkhamraev/XLOG/math/backend && python manage.py test tests.test_models.TestStudentModel -v2`
Expected: PASS

**Step 6: Commit**
```bash
git add backend/exams/models.py backend/exams/migrations/ backend/tests/test_models.py
git commit -m "refactor: clean Student model - remove email/google_id, require telegram_id"
```

---

### Task 4: Remove InviteCode Model

**Files:**
- Modify: `backend/exams/models.py:57-66` (remove InviteCode class)
- Modify: `backend/exams/views.py:48-68` (remove admin_generate_invite_codes)
- Modify: `backend/exams/serializers.py:46-54` (remove InviteCodeSerializer, GenerateInviteCodesSerializer)
- Modify: `backend/exams/urls.py:15` (remove invite-codes URL)
- Modify: `backend/exams/auth_views.py:118-180` (remove join_exam_by_invite_code)
- Modify: `backend/exams/admin.py` (remove InviteCode registration)
- Create: new migration

**Step 1: Remove InviteCode from models.py**

Delete the entire InviteCode class (lines 57-66).

**Step 2: Remove invite code view from views.py**

Delete `admin_generate_invite_codes` function (lines 48-68).

**Step 3: Remove invite code serializers from serializers.py**

Delete `InviteCodeSerializer` (lines 46-50) and `GenerateInviteCodesSerializer` (lines 53-54).

**Step 4: Remove invite code auth endpoint from auth_views.py**

Delete `join_exam_by_invite_code` function (lines 118-180).

**Step 5: Remove invite code URL from urls.py**

Delete line 15: `path('admin/exams/<uuid:exam_id>/invite-codes/', ...)`
Delete line 20: `path('auth/invite-code/', ...)`

**Step 6: Remove InviteCode from admin.py**

Remove `InviteCode` from admin site registration.

**Step 7: Create and run migration**

Run:
```bash
cd /Users/izzatbekkhamraev/XLOG/math/backend
python manage.py makemigrations exams
python manage.py migrate
```

**Step 8: Verify no references remain**

Run: `grep -r "InviteCode\|invite.code\|invite_code" backend/ --include="*.py" -l`
Expected: No results (or only migration files)

**Step 9: Commit**
```bash
git add backend/exams/models.py backend/exams/views.py backend/exams/serializers.py backend/exams/auth_views.py backend/exams/urls.py backend/exams/admin.py backend/exams/migrations/
git commit -m "refactor: remove InviteCode model and all related code"
```

---

### Task 5: Enhance StudentRating Model — Add Rasch Fields

**Files:**
- Modify: `backend/exams/models.py:104-114`
- Create: new migration

**Step 1: Write the failing test**

Add to `backend/tests/test_models.py`:
```python
class TestStudentRatingModel(TestCase):
    def test_rating_has_rasch_fields(self):
        field_names = [f.name for f in StudentRating._meta.get_fields()]
        self.assertIn('rasch_ability', field_names)
        self.assertIn('rasch_scaled', field_names)

    def test_rating_defaults(self):
        student = Student.objects.create(full_name="Test", telegram_id=12345)
        rating = StudentRating.objects.create(student=student)
        self.assertEqual(rating.elo, 1200)
        self.assertEqual(rating.rasch_ability, 0.0)
        self.assertEqual(rating.rasch_scaled, 50.0)
        self.assertEqual(rating.exams_taken, 0)
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/izzatbekkhamraev/XLOG/math/backend && python manage.py test tests.test_models.TestStudentRatingModel -v2`
Expected: FAIL — rasch_ability field doesn't exist

**Step 3: Update StudentRating model**

```python
class StudentRating(models.Model):
    student = models.OneToOneField(Student, on_delete=models.CASCADE, primary_key=True, related_name='rating')
    elo = models.IntegerField(default=1200)
    rasch_ability = models.FloatField(default=0.0, help_text="Current Rasch theta (logits)")
    rasch_scaled = models.FloatField(default=50.0, help_text="Rasch score on 0-100 scale")
    exams_taken = models.IntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.student.full_name}: ELO={self.elo}, Rasch={self.rasch_scaled}"
```

**Step 4: Create and run migration**

Run:
```bash
cd /Users/izzatbekkhamraev/XLOG/math/backend
python manage.py makemigrations exams
python manage.py migrate
```

**Step 5: Run test to verify it passes**

Expected: PASS

**Step 6: Commit**
```bash
git add backend/exams/models.py backend/exams/migrations/ backend/tests/test_models.py
git commit -m "feat: add rasch_ability and rasch_scaled fields to StudentRating"
```

---

### Task 6: Enhance EloHistory Model — Add Rasch Tracking

**Files:**
- Modify: `backend/exams/models.py:117-136`
- Create: new migration

**Step 1: Update EloHistory model**

Add two fields after `score_percent`:
```python
rasch_before = models.FloatField(default=50.0, help_text="Rasch scaled score before this exam")
rasch_after = models.FloatField(default=50.0, help_text="Rasch scaled score after this exam")
```

**Step 2: Create and run migration**

Run:
```bash
cd /Users/izzatbekkhamraev/XLOG/math/backend
python manage.py makemigrations exams
python manage.py migrate
```

**Step 3: Commit**
```bash
git add backend/exams/models.py backend/exams/migrations/
git commit -m "feat: add rasch_before/rasch_after fields to EloHistory"
```

---

### Task 7: Add Achievement Model

**Files:**
- Modify: `backend/exams/models.py` (add at end)
- Create: new migration

**Step 1: Write the failing test**

Add to `backend/tests/test_models.py`:
```python
from exams.models import Achievement, StudentAchievement

class TestAchievementModel(TestCase):
    def test_create_achievement(self):
        achievement = Achievement.objects.create(
            type='milestone',
            name='First Exam',
            description='Complete your first exam',
            threshold=1,
            icon='trophy',
        )
        self.assertEqual(achievement.type, 'milestone')
        self.assertEqual(achievement.name, 'First Exam')

    def test_student_achievement_unique(self):
        from django.db import IntegrityError
        student = Student.objects.create(full_name="Test", telegram_id=99999)
        achievement = Achievement.objects.create(
            type='streak', name='3-Streak', description='3 exams in a row',
            threshold=3, icon='fire',
        )
        StudentAchievement.objects.create(student=student, achievement=achievement)
        with self.assertRaises(IntegrityError):
            StudentAchievement.objects.create(student=student, achievement=achievement)
```

**Step 2: Run test to verify it fails**

Expected: FAIL — Achievement model doesn't exist

**Step 3: Add Achievement and StudentAchievement models**

Add to `backend/exams/models.py`:
```python
class Achievement(models.Model):
    class Type(models.TextChoices):
        STREAK = 'streak', 'Streak'
        MILESTONE = 'milestone', 'Milestone'
        IMPROVEMENT = 'improvement', 'Improvement'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    type = models.CharField(max_length=20, choices=Type.choices)
    name = models.CharField(max_length=100)
    description = models.TextField()
    threshold = models.FloatField(help_text="Numeric threshold for earning")
    icon = models.CharField(max_length=50)

    def __str__(self):
        return f"{self.name} ({self.type})"


class StudentAchievement(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='achievements')
    achievement = models.ForeignKey(Achievement, on_delete=models.CASCADE)
    earned_at = models.DateTimeField(auto_now_add=True)
    session = models.ForeignKey(ExamSession, on_delete=models.SET_NULL, null=True, blank=True)

    class Meta:
        unique_together = ('student', 'achievement')

    def __str__(self):
        return f"{self.student.full_name} - {self.achievement.name}"
```

**Step 4: Create and run migration**

Run:
```bash
cd /Users/izzatbekkhamraev/XLOG/math/backend
python manage.py makemigrations exams
python manage.py migrate
```

**Step 5: Run test to verify it passes**

Expected: PASS

**Step 6: Commit**
```bash
git add backend/exams/models.py backend/exams/migrations/ backend/tests/test_models.py
git commit -m "feat: add Achievement and StudentAchievement models"
```

---

### Task 8: Add StudentStreak Model

**Files:**
- Modify: `backend/exams/models.py` (add at end)
- Create: new migration

**Step 1: Write the failing test**

Add to `backend/tests/test_models.py`:
```python
from exams.models import StudentStreak

class TestStudentStreakModel(TestCase):
    def test_create_streak(self):
        student = Student.objects.create(full_name="Streak Test", telegram_id=88888)
        streak = StudentStreak.objects.create(student=student)
        self.assertEqual(streak.current_streak, 0)
        self.assertEqual(streak.longest_streak, 0)
        self.assertIsNone(streak.last_exam_date)
```

**Step 2: Run test to verify it fails**

Expected: FAIL — StudentStreak doesn't exist

**Step 3: Add StudentStreak model**

Add to `backend/exams/models.py`:
```python
class StudentStreak(models.Model):
    student = models.OneToOneField(Student, on_delete=models.CASCADE, primary_key=True, related_name='streak')
    current_streak = models.IntegerField(default=0)
    longest_streak = models.IntegerField(default=0)
    last_exam_date = models.DateField(null=True, blank=True)

    def __str__(self):
        return f"{self.student.full_name}: {self.current_streak} streak"
```

Note: We use `last_exam_date` instead of `last_exam_week` for simpler streak logic — streak is exam-based (consecutive exams participated), not week-based.

**Step 4: Create and run migration**

Run:
```bash
cd /Users/izzatbekkhamraev/XLOG/math/backend
python manage.py makemigrations exams
python manage.py migrate
```

**Step 5: Run test to verify it passes**

Expected: PASS

**Step 6: Commit**
```bash
git add backend/exams/models.py backend/exams/migrations/ backend/tests/test_models.py
git commit -m "feat: add StudentStreak model for exam participation tracking"
```

---

### Task 9: Register New Models in Admin

**Files:**
- Modify: `backend/exams/admin.py`

**Step 1: Update admin.py**

Add registrations for new models:
```python
from exams.models import Achievement, StudentAchievement, StudentStreak

admin.site.register(Achievement)
admin.site.register(StudentAchievement)
admin.site.register(StudentStreak)
```

Remove `InviteCode` registration if still present.

**Step 2: Verify admin loads**

Run: `cd /Users/izzatbekkhamraev/XLOG/math/backend && python manage.py check`
Expected: System check identified no issues.

**Step 3: Commit**
```bash
git add backend/exams/admin.py
git commit -m "chore: register new models in Django admin, remove InviteCode"
```

---

### Task 10: Seed Initial Achievements

**Files:**
- Create: new data migration

**Step 1: Create data migration**

Run: `cd /Users/izzatbekkhamraev/XLOG/math/backend && python manage.py makemigrations exams --empty -n seed_achievements`

**Step 2: Write migration content**

```python
from django.db import migrations
import uuid


def seed_achievements(apps, schema_editor):
    Achievement = apps.get_model('exams', 'Achievement')
    achievements = [
        # Milestones (Rasch scaled score thresholds)
        {'type': 'milestone', 'name': 'Novice', 'description': 'Reach a Rasch score of 25', 'threshold': 25, 'icon': 'seedling'},
        {'type': 'milestone', 'name': 'Intermediate', 'description': 'Reach a Rasch score of 50', 'threshold': 50, 'icon': 'star'},
        {'type': 'milestone', 'name': 'Advanced', 'description': 'Reach a Rasch score of 60', 'threshold': 60, 'icon': 'medal'},
        {'type': 'milestone', 'name': 'Proficient', 'description': 'Reach a Rasch score of 70', 'threshold': 70, 'icon': 'award'},
        {'type': 'milestone', 'name': 'Expert', 'description': 'Reach a Rasch score of 80', 'threshold': 80, 'icon': 'crown'},
        {'type': 'milestone', 'name': 'Master', 'description': 'Reach a Rasch score of 90', 'threshold': 90, 'icon': 'gem'},
        {'type': 'milestone', 'name': 'Grandmaster', 'description': 'Reach a Rasch score of 95', 'threshold': 95, 'icon': 'diamond'},
        # Streaks
        {'type': 'streak', 'name': '3-Exam Streak', 'description': 'Complete 3 consecutive exams', 'threshold': 3, 'icon': 'fire'},
        {'type': 'streak', 'name': '5-Exam Streak', 'description': 'Complete 5 consecutive exams', 'threshold': 5, 'icon': 'fire'},
        {'type': 'streak', 'name': '10-Exam Streak', 'description': 'Complete 10 consecutive exams', 'threshold': 10, 'icon': 'fire'},
        # Improvement
        {'type': 'improvement', 'name': 'First Exam', 'description': 'Complete your first exam', 'threshold': 1, 'icon': 'rocket'},
        {'type': 'improvement', 'name': '5 Exams', 'description': 'Complete 5 exams', 'threshold': 5, 'icon': 'trophy'},
        {'type': 'improvement', 'name': '10 Exams', 'description': 'Complete 10 exams', 'threshold': 10, 'icon': 'trophy'},
        {'type': 'improvement', 'name': 'Rising Star', 'description': 'Improve your score by 10%', 'threshold': 10, 'icon': 'trending-up'},
        {'type': 'improvement', 'name': 'Big Leap', 'description': 'Improve your score by 20%', 'threshold': 20, 'icon': 'trending-up'},
    ]
    for a in achievements:
        Achievement.objects.get_or_create(name=a['name'], defaults={**a, 'id': uuid.uuid4()})


def reverse(apps, schema_editor):
    Achievement = apps.get_model('exams', 'Achievement')
    Achievement.objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [
        ('exams', '<previous_migration>'),  # Update this
    ]
    operations = [
        migrations.RunPython(seed_achievements, reverse),
    ]
```

**Step 3: Run migration**

Run: `cd /Users/izzatbekkhamraev/XLOG/math/backend && python manage.py migrate`

**Step 4: Verify**

Run: `cd /Users/izzatbekkhamraev/XLOG/math/backend && python manage.py shell -c "from exams.models import Achievement; print(Achievement.objects.count())"`
Expected: 15

**Step 5: Commit**
```bash
git add backend/exams/migrations/
git commit -m "feat: seed initial achievement definitions"
```

---

### Task 11: Run Full Test Suite & Verify

**Step 1: Run all existing tests**

Run: `cd /Users/izzatbekkhamraev/XLOG/math/backend && python manage.py test -v2`

**Step 2: Fix any failures**

Address any test failures caused by model changes (likely in test_rasch.py if it creates MockExam instances with old fields).

**Step 3: Run Django system check**

Run: `cd /Users/izzatbekkhamraev/XLOG/math/backend && python manage.py check --deploy`

**Step 4: Commit any fixes**
```bash
git add -A && git commit -m "fix: update tests for new model structure"
```

---

## Phase 1 Summary

| Task | What Changes | Models Affected |
|------|-------------|-----------------|
| 1 | Database backup | — |
| 2 | Remove open_at, close_at, is_scheduled from MockExam | MockExam |
| 3 | Remove email, google_id from Student; require telegram_id | Student |
| 4 | Remove InviteCode model + all related code | InviteCode (deleted) |
| 5 | Add rasch_ability, rasch_scaled to StudentRating | StudentRating |
| 6 | Add rasch_before, rasch_after to EloHistory | EloHistory |
| 7 | Add Achievement + StudentAchievement models | Achievement, StudentAchievement (new) |
| 8 | Add StudentStreak model | StudentStreak (new) |
| 9 | Register new models in admin | — |
| 10 | Seed achievement definitions | Achievement (data) |
| 11 | Run full test suite | — |

**Estimated migrations:** 6-8 new migration files
**Risk:** Data migration for MockExam fields (open_at → scheduled_start) and Student cleanup (null telegram_id handling)
