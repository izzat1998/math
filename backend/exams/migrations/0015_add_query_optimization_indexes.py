from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('exams', '0014_seed_achievements'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='studentanswer',
            index=models.Index(
                fields=['session', 'question_number'],
                name='idx_answer_session_question',
            ),
        ),
        migrations.AddIndex(
            model_name='examsession',
            index=models.Index(
                fields=['exam', 'status'],
                name='idx_session_exam_status',
            ),
        ),
        migrations.AddIndex(
            model_name='mockexam',
            index=models.Index(
                fields=['scheduled_start', 'scheduled_end'],
                name='idx_exam_schedule',
            ),
        ),
    ]
