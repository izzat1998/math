from django.core.management.base import BaseCommand
from exams.models import InviteCode, MockExam


class Command(BaseCommand):
    help = 'Create a reusable invite code for development/testing'

    def add_arguments(self, parser):
        parser.add_argument('--exam-id', type=str, help='Exam UUID (uses latest exam if omitted)')
        parser.add_argument('--code', type=str, default='DEV12345', help='Code string (default: DEV12345)')

    def handle(self, *args, **options):
        code_str = options['code']
        exam_id = options.get('exam_id')

        if exam_id:
            exam = MockExam.objects.get(id=exam_id)
        else:
            exam = MockExam.objects.order_by('-created_at').first()
            if not exam:
                self.stderr.write(self.style.ERROR('No exams found. Create an exam first.'))
                return

        invite, created = InviteCode.objects.get_or_create(
            code=code_str,
            defaults={'exam': exam, 'reusable': True},
        )

        if not created:
            invite.reusable = True
            invite.is_used = False
            invite.exam = exam
            invite.save()
            self.stdout.write(self.style.WARNING(f'Updated existing code: {code_str}'))
        else:
            self.stdout.write(self.style.SUCCESS(f'Created reusable code: {code_str}'))

        self.stdout.write(f'  Exam: {exam.title} ({exam.id})')
        self.stdout.write(f'  Code: {code_str}')
        self.stdout.write(f'  Reusable: Yes')
