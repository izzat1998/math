"""Data migration: copy open_at -> scheduled_start, close_at -> scheduled_end
for any MockExam rows where the scheduled fields are still NULL."""

from django.db import migrations


def copy_dates_forward(apps, schema_editor):
    from django.db.models import F
    MockExam = apps.get_model('exams', 'MockExam')
    MockExam.objects.filter(scheduled_start__isnull=True).update(
        scheduled_start=F('open_at'),
    )
    MockExam.objects.filter(scheduled_end__isnull=True).update(
        scheduled_end=F('close_at'),
    )


class Migration(migrations.Migration):

    dependencies = [
        ('exams', '0009_add_indexes_and_upload_path'),
    ]

    operations = [
        migrations.RunPython(copy_dates_forward, migrations.RunPython.noop),
    ]
