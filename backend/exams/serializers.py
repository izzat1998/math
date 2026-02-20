from django.db import transaction
from rest_framework import serializers

from .models import MockExam, CorrectAnswer, Question, PracticeSession


class MockExamSerializer(serializers.ModelSerializer):
    class Meta:
        model = MockExam
        fields = ['id', 'title', 'pdf_file', 'scheduled_start', 'scheduled_end', 'duration', 'created_at']
        read_only_fields = ['id', 'created_at']

    def validate_pdf_file(self, value):
        max_size = 50 * 1024 * 1024  # 50 MB
        if value.size > max_size:
            raise serializers.ValidationError('PDF fayl hajmi 50 MB dan oshmasligi kerak')
        if not value.name.lower().endswith('.pdf'):
            raise serializers.ValidationError('Faqat PDF fayllar qabul qilinadi')
        if hasattr(value, 'content_type') and value.content_type not in ('application/pdf', 'application/octet-stream'):
            raise serializers.ValidationError('Fayl turi PDF bo\'lishi kerak')
        # Check PDF magic bytes
        header = value.read(4)
        value.seek(0)
        if header != b'%PDF':
            raise serializers.ValidationError('Fayl haqiqiy PDF emas')
        return value


class CorrectAnswerSerializer(serializers.ModelSerializer):
    class Meta:
        model = CorrectAnswer
        fields = ['id', 'question_number', 'sub_part', 'correct_answer']


class BulkCorrectAnswerSerializer(serializers.Serializer):
    answers = CorrectAnswerSerializer(many=True)

    @transaction.atomic
    def create(self, validated_data):
        exam = self.context['exam']
        answers = [CorrectAnswer(exam=exam, **data) for data in validated_data['answers']]
        CorrectAnswer.objects.filter(exam=exam).delete()
        return CorrectAnswer.objects.bulk_create(answers)



class QuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Question
        fields = ['id', 'text', 'image', 'topic', 'difficulty', 'answer_type', 'choices']


class QuestionResultSerializer(serializers.ModelSerializer):
    class Meta:
        model = Question
        fields = ['id', 'text', 'image', 'topic', 'difficulty', 'answer_type', 'choices', 'correct_answer', 'explanation']


class PracticeSessionSerializer(serializers.ModelSerializer):
    questions = QuestionSerializer(many=True, read_only=True)

    class Meta:
        model = PracticeSession
        fields = ['id', 'mode', 'questions', 'started_at', 'duration', 'answers', 'status']
