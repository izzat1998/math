"""Schema migration:
- MockExam: make scheduled_start/scheduled_end non-nullable; remove open_at, close_at, is_scheduled
- Student: remove email, google_id; make telegram_id non-nullable
- Delete InviteCode model
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('exams', '0011_delete_students_without_telegram_id'),
    ]

    operations = [
        # --- MockExam: make scheduled fields required ---
        migrations.AlterField(
            model_name='mockexam',
            name='scheduled_start',
            field=models.DateTimeField(),
        ),
        migrations.AlterField(
            model_name='mockexam',
            name='scheduled_end',
            field=models.DateTimeField(),
        ),
        # --- MockExam: update duration help_text ---
        migrations.AlterField(
            model_name='mockexam',
            name='duration',
            field=models.IntegerField(default=150, help_text='Duration in minutes'),
        ),
        # --- MockExam: remove deprecated fields ---
        migrations.RemoveField(
            model_name='mockexam',
            name='open_at',
        ),
        migrations.RemoveField(
            model_name='mockexam',
            name='close_at',
        ),
        migrations.RemoveField(
            model_name='mockexam',
            name='is_scheduled',
        ),
        # --- Student: make telegram_id non-nullable ---
        migrations.AlterField(
            model_name='student',
            name='telegram_id',
            field=models.BigIntegerField(unique=True),
        ),
        # --- Student: remove deprecated fields ---
        migrations.RemoveField(
            model_name='student',
            name='email',
        ),
        migrations.RemoveField(
            model_name='student',
            name='google_id',
        ),
        # --- Delete InviteCode model ---
        migrations.DeleteModel(
            name='InviteCode',
        ),
    ]
