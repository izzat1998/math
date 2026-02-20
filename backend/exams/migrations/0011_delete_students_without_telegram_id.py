"""Data migration: delete Student rows that have no telegram_id,
since telegram_id is about to become required (non-nullable)."""

from django.db import migrations


def delete_students_without_telegram(apps, schema_editor):
    Student = apps.get_model('exams', 'Student')
    count = Student.objects.filter(telegram_id__isnull=True).count()
    if count:
        Student.objects.filter(telegram_id__isnull=True).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('exams', '0010_copy_open_close_to_scheduled'),
    ]

    operations = [
        migrations.RunPython(delete_students_without_telegram, migrations.RunPython.noop),
    ]
