import os
import uuid
from django.db import models
from django.contrib.auth.models import User
from django.utils.text import get_valid_filename


def exam_pdf_path(instance, filename):
    """Sanitize uploaded PDF filename to prevent path traversal."""
    safe_name = get_valid_filename(os.path.basename(filename))
    return f'exams/pdfs/{instance.id}_{safe_name}'


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


class CorrectAnswer(models.Model):
    exam = models.ForeignKey(MockExam, on_delete=models.CASCADE, related_name='correct_answers')
    question_number = models.IntegerField()
    sub_part = models.CharField(max_length=1, null=True, blank=True)
    correct_answer = models.CharField(max_length=255)

    class Meta:
        unique_together = ('exam', 'question_number', 'sub_part')

    def __str__(self):
        part = f"({self.sub_part})" if self.sub_part else ""
        return f"Q{self.question_number}{part}: {self.correct_answer}"


class Student(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    full_name = models.CharField(max_length=255)
    telegram_id = models.BigIntegerField(unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.full_name



class ExamSession(models.Model):
    class Status(models.TextChoices):
        IN_PROGRESS = 'in_progress', 'Jarayonda'
        SUBMITTED = 'submitted', 'Topshirilgan'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='sessions', db_index=True)
    exam = models.ForeignKey(MockExam, on_delete=models.CASCADE, related_name='sessions', db_index=True)
    started_at = models.DateTimeField(auto_now_add=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    is_auto_submitted = models.BooleanField(default=False)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.IN_PROGRESS, db_index=True)

    class Meta:
        unique_together = ('student', 'exam')

    def __str__(self):
        return f"{self.student} - {self.exam} ({self.status})"


class StudentAnswer(models.Model):
    session = models.ForeignKey(ExamSession, on_delete=models.CASCADE, related_name='answers', db_index=True)
    question_number = models.IntegerField()
    sub_part = models.CharField(max_length=1, null=True, blank=True)
    answer = models.CharField(max_length=255)
    is_correct = models.BooleanField(default=False)

    class Meta:
        unique_together = ('session', 'question_number', 'sub_part')

    def __str__(self):
        part = f"({self.sub_part})" if self.sub_part else ""
        return f"Q{self.question_number}{part}: {self.answer}"


class StudentRating(models.Model):
    student = models.OneToOneField(Student, on_delete=models.CASCADE, primary_key=True, related_name='rating')
    elo = models.IntegerField(default=1200)
    exams_taken = models.IntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-elo']

    def __str__(self):
        return f"{self.student} — {self.elo}"


class EloHistory(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='elo_history')
    session = models.OneToOneField(ExamSession, on_delete=models.CASCADE, related_name='elo_snapshot')
    elo_before = models.IntegerField()
    elo_after = models.IntegerField()
    elo_delta = models.IntegerField()
    score_percent = models.FloatField()
    exam_avg_percent = models.FloatField()
    k_factor = models.IntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['student', '-created_at']),
        ]

    def __str__(self):
        return f"{self.student} | {self.elo_before} → {self.elo_after} ({self.elo_delta:+d})"


class ItemDifficulty(models.Model):
    exam = models.ForeignKey(MockExam, on_delete=models.CASCADE, related_name='item_difficulties')
    question_number = models.IntegerField()
    sub_part = models.CharField(max_length=1, null=True, blank=True)
    beta = models.FloatField(help_text="Rasch difficulty parameter")
    infit = models.FloatField(null=True, blank=True, help_text="Infit MNSQ")
    outfit = models.FloatField(null=True, blank=True, help_text="Outfit MNSQ")
    calibrated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('exam', 'question_number', 'sub_part')

    def __str__(self):
        part = f"({self.sub_part})" if self.sub_part else ""
        return f"Q{self.question_number}{part}: β={self.beta:.2f}"


class Question(models.Model):
    class AnswerType(models.TextChoices):
        MULTIPLE_CHOICE = 'multiple_choice', 'Ko\'p tanlov'
        FREE_RESPONSE = 'free_response', 'Erkin javob'

    TOPIC_CHOICES = [
        ('algebra', 'Algebra'),
        ('geometry', 'Geometriya'),
        ('probability', 'Ehtimollik'),
        ('calculus', 'Analiz'),
        ('trigonometry', 'Trigonometriya'),
        ('number_theory', 'Sonlar nazariyasi'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    text = models.TextField(help_text="Savol matni")
    image = models.ImageField(upload_to='questions/images/', null=True, blank=True)
    topic = models.CharField(max_length=50, choices=TOPIC_CHOICES)
    difficulty = models.IntegerField(choices=[(i, str(i)) for i in range(1, 6)], default=3)
    answer_type = models.CharField(max_length=20, choices=AnswerType.choices, default=AnswerType.MULTIPLE_CHOICE)
    choices = models.JSONField(null=True, blank=True, help_text="Variantlar ro'yxati, masalan: ['A', 'B', 'C', 'D']")
    correct_answer = models.CharField(max_length=255)
    explanation = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"[{self.topic}] {self.text[:60]}"


class PracticeSession(models.Model):
    class Mode(models.TextChoices):
        LIGHT = 'light', 'Yengil (30 daq)'
        MEDIUM = 'medium', 'O\'rta (60 daq)'

    class Status(models.TextChoices):
        IN_PROGRESS = 'in_progress', 'Jarayonda'
        SUBMITTED = 'submitted', 'Topshirilgan'

    MODE_CONFIG = {
        'light': {'question_count': 6, 'duration': 30},
        'medium': {'question_count': 10, 'duration': 60},
    }

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='practice_sessions')
    mode = models.CharField(max_length=10, choices=Mode.choices)
    questions = models.ManyToManyField(Question, related_name='practice_sessions')
    started_at = models.DateTimeField(auto_now_add=True)
    duration = models.IntegerField(help_text="Daqiqalarda")
    submitted_at = models.DateTimeField(null=True, blank=True)
    answers = models.JSONField(default=dict, blank=True)
    score = models.IntegerField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.IN_PROGRESS)

    def __str__(self):
        return f"{self.student} — {self.get_mode_display()} ({self.status})"
