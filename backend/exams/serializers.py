from rest_framework import serializers

from .models import MockExam, CorrectAnswer, InviteCode


class MockExamSerializer(serializers.ModelSerializer):
    class Meta:
        model = MockExam
        fields = ['id', 'title', 'pdf_file', 'open_at', 'close_at', 'duration', 'created_at']
        read_only_fields = ['id', 'created_at']


class CorrectAnswerSerializer(serializers.ModelSerializer):
    class Meta:
        model = CorrectAnswer
        fields = ['id', 'question_number', 'sub_part', 'correct_answer']


class BulkCorrectAnswerSerializer(serializers.Serializer):
    answers = CorrectAnswerSerializer(many=True)

    def create(self, validated_data):
        exam = self.context['exam']
        answers = [CorrectAnswer(exam=exam, **data) for data in validated_data['answers']]
        CorrectAnswer.objects.filter(exam=exam).delete()
        return CorrectAnswer.objects.bulk_create(answers)


class InviteCodeSerializer(serializers.ModelSerializer):
    class Meta:
        model = InviteCode
        fields = ['id', 'code', 'is_used', 'used_by']
        read_only_fields = ['id', 'code', 'is_used', 'used_by']


class GenerateInviteCodesSerializer(serializers.Serializer):
    count = serializers.IntegerField(min_value=1, max_value=500)
