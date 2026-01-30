import uuid
from django.db import models
from django.contrib.auth.models import User


class MockExam(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    pdf_file = models.FileField(upload_to='exams/pdfs/')
    open_at = models.DateTimeField()
    close_at = models.DateTimeField()
    duration = models.IntegerField(default=150, help_text="Davomiyligi (daqiqalarda)")
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
    telegram_id = models.BigIntegerField(null=True, blank=True, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.full_name


class InviteCode(models.Model):
    exam = models.ForeignKey(MockExam, on_delete=models.CASCADE, related_name='invite_codes')
    code = models.CharField(max_length=20, unique=True)
    is_used = models.BooleanField(default=False)
    used_by = models.ForeignKey(Student, on_delete=models.SET_NULL, null=True, blank=True)

    def __str__(self):
        return f"{self.code} ({'used' if self.is_used else 'available'})"


class ExamSession(models.Model):
    class Status(models.TextChoices):
        IN_PROGRESS = 'in_progress', 'Jarayonda'
        SUBMITTED = 'submitted', 'Topshirilgan'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='sessions')
    exam = models.ForeignKey(MockExam, on_delete=models.CASCADE, related_name='sessions')
    started_at = models.DateTimeField(auto_now_add=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    is_auto_submitted = models.BooleanField(default=False)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.IN_PROGRESS)

    class Meta:
        unique_together = ('student', 'exam')

    def __str__(self):
        return f"{self.student} - {self.exam} ({self.status})"


class StudentAnswer(models.Model):
    session = models.ForeignKey(ExamSession, on_delete=models.CASCADE, related_name='answers')
    question_number = models.IntegerField()
    sub_part = models.CharField(max_length=1, null=True, blank=True)
    answer = models.CharField(max_length=255)
    is_correct = models.BooleanField(default=False)

    class Meta:
        unique_together = ('session', 'question_number', 'sub_part')

    def __str__(self):
        part = f"({self.sub_part})" if self.sub_part else ""
        return f"Q{self.question_number}{part}: {self.answer}"
