from django.contrib import admin
from .models import MockExam, CorrectAnswer, Student, InviteCode, ExamSession, StudentAnswer

admin.site.register(MockExam)
admin.site.register(CorrectAnswer)
admin.site.register(Student)
admin.site.register(InviteCode)
admin.site.register(ExamSession)
admin.site.register(StudentAnswer)
