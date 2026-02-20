from django.contrib import admin
from .models import (
    MockExam, CorrectAnswer, Student, ExamSession, StudentAnswer,
    StudentRating, EloHistory, ItemDifficulty, Question, PracticeSession,
    Achievement, StudentAchievement, StudentStreak,
)


@admin.register(MockExam)
class MockExamAdmin(admin.ModelAdmin):
    list_display = ['title', 'scheduled_start', 'scheduled_end', 'created_at']


@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = ['text_short', 'topic', 'difficulty', 'answer_type', 'created_at']
    list_filter = ['topic', 'difficulty', 'answer_type']
    search_fields = ['text']

    def text_short(self, obj):
        return obj.text[:80]
    text_short.short_description = 'Savol'


admin.site.register(CorrectAnswer)
admin.site.register(Student)
admin.site.register(ExamSession)
admin.site.register(StudentAnswer)
admin.site.register(StudentRating)
admin.site.register(EloHistory)
admin.site.register(ItemDifficulty)
admin.site.register(PracticeSession)
admin.site.register(Achievement)
admin.site.register(StudentAchievement)
admin.site.register(StudentStreak)
