import random
import math
import numpy as np
from django.core.management.base import BaseCommand
from django.utils import timezone

from exams.models import (
    MockExam, CorrectAnswer, Student, ExamSession,
    StudentAnswer, ItemDifficulty,
)
from exams.rasch import (
    rasch_probability, estimate_theta,
    estimate_item_difficulties, compute_item_fit,
)

FIRST_NAMES = [
    "Aziz", "Bobur", "Doniyor", "Eldor", "Firdavs", "Gʻayrat", "Husan",
    "Islom", "Jahongir", "Kamol", "Laziz", "Mirzo", "Nodir", "Otabek",
    "Parviz", "Rustam", "Sardor", "Temur", "Ulugbek", "Vohid",
    "Abdulla", "Behruz", "Davron", "Erkin", "Farxod", "Dilshod", "Hamid",
    "Ibrohim", "Jasur", "Komil", "Lochin", "Mansur", "Nozim", "Obid",
    "Ravshan", "Sanjar", "Tohir", "Umid", "Xurshid", "Zafar",
    "Malika", "Nilufar", "Ozoda", "Parizod", "Qunduz", "Rohila",
    "Sevara", "Tamara", "Umida", "Venera", "Yulduz", "Zulfiya",
    "Adolat", "Barno", "Charos", "Dilfuza", "Elmira", "Feruza",
    "Gulnora", "Hilola", "Iroda", "Jamila",
]

LAST_NAMES = [
    "Karimov", "Rahimov", "Toshmatov", "Umarov", "Abdullayev",
    "Ismoilov", "Xolmatov", "Nurmatov", "Saidov", "Ergashev",
    "Mirzayev", "Haydarov", "Salimov", "Yusupov", "Aliyev",
    "Baxtiyorov", "Nazarov", "Olimov", "Ruziyev", "Sharipov",
    "Qodirov", "Jumayev", "Mahmudov", "Xasanov", "Tillayev",
    "Bobojonov", "Choriyev", "Dustov", "Fayzullayev", "Ganiyev",
]

DUMMY_PREFIX = "[RASCH-SIM]"


class Command(BaseCommand):
    help = "Generate dummy students, simulate Rasch responses, calibrate items, and print a scoring report."

    def add_arguments(self, parser):
        parser.add_argument('--exam-id', type=str, default=None,
                            help='Exam UUID (uses latest exam if omitted)')
        parser.add_argument('--count', type=int, default=120,
                            help='Number of dummy students to generate (default: 120)')
        parser.add_argument('--clear', action='store_true',
                            help='Delete previously generated dummy students before running')

    def handle(self, *args, **options):
        exam = self._get_exam(options['exam_id'])
        if not exam:
            return
        count = options['count']

        correct_answers = list(
            CorrectAnswer.objects.filter(exam=exam)
            .order_by('question_number', 'sub_part')
        )
        if not correct_answers:
            self.stderr.write(self.style.ERROR(
                f"Exam '{exam.title}' has no correct answers. Add them first."
            ))
            return

        if options['clear']:
            self._clear_dummies(exam)

        self.stdout.write(self.style.MIGRATE_HEADING(
            f"\n{'='*60}\n  RASCH SIMULATION — {exam.title}\n{'='*60}"
        ))
        self.stdout.write(f"  Items: {len(correct_answers)}  |  Students: {count}\n")

        # 1. Assign initial item difficulties
        item_keys = [(ca.question_number, ca.sub_part) for ca in correct_answers]
        initial_betas = self._assign_initial_betas(correct_answers)
        self.stdout.write(f"  Initial β range: [{min(initial_betas):.2f}, {max(initial_betas):.2f}]")

        # 2. Generate student abilities
        abilities = self._generate_abilities(count)
        self.stdout.write(f"  θ range: [{min(abilities):.2f}, {max(abilities):.2f}]")

        # 3. Generate students and simulate responses
        self.stdout.write(self.style.MIGRATE_HEADING("\n  Generating students and responses..."))
        students_data = self._create_students_and_responses(
            exam, correct_answers, initial_betas, abilities
        )

        # 4. Build response matrix and run JMLE
        self.stdout.write(self.style.MIGRATE_HEADING("  Running JMLE calibration..."))
        matrix = np.array([sd['responses'] for sd in students_data])
        betas, thetas = estimate_item_difficulties(matrix)

        # 5. Compute fit statistics
        fit_stats = []
        for j in range(len(correct_answers)):
            fit = compute_item_fit(j, matrix, thetas, betas)
            fit_stats.append(fit)

        # 6. Save ItemDifficulty records
        ItemDifficulty.objects.filter(exam=exam).delete()
        difficulties = []
        for j, ca in enumerate(correct_answers):
            difficulties.append(ItemDifficulty(
                exam=exam,
                question_number=ca.question_number,
                sub_part=ca.sub_part,
                beta=float(betas[j]),
                infit=fit_stats[j]['infit'],
                outfit=fit_stats[j]['outfit'],
            ))
        ItemDifficulty.objects.bulk_create(difficulties)

        # 7. Final theta estimates for each student
        for i, sd in enumerate(students_data):
            sd['theta'] = float(thetas[i])
            responses_arr = np.array(sd['responses'])
            sd['raw_pct'] = float(responses_arr.sum() / len(responses_arr) * 100)
            expected = sum(rasch_probability(sd['theta'], betas[j]) for j in range(len(betas)))
            sd['rasch_pct'] = expected / len(betas) * 100

        # 8. Print report
        self._print_item_report(correct_answers, betas, fit_stats)
        self._print_student_report(students_data)
        self._print_summary(students_data, betas)

        self.stdout.write(self.style.SUCCESS(
            f"\n  Done. {count} students created, {len(betas)} items calibrated.\n"
        ))

    def _get_exam(self, exam_id):
        if exam_id:
            try:
                return MockExam.objects.get(id=exam_id)
            except MockExam.DoesNotExist:
                self.stderr.write(self.style.ERROR(f"Exam {exam_id} not found."))
                return None
        exam = MockExam.objects.order_by('-created_at').first()
        if not exam:
            self.stderr.write(self.style.ERROR("No exams found."))
            return None
        return exam

    def _clear_dummies(self, exam):
        dummy_students = Student.objects.filter(full_name__startswith=DUMMY_PREFIX)
        sessions = ExamSession.objects.filter(student__in=dummy_students, exam=exam)
        StudentAnswer.objects.filter(session__in=sessions).delete()
        sessions.delete()
        count = dummy_students.count()
        dummy_students.delete()
        self.stdout.write(self.style.WARNING(f"  Cleared {count} dummy students."))

    def _assign_initial_betas(self, correct_answers):
        """Assign initial β: MCQ items ~ [-2, 2], exercise items ~ [0, 3]."""
        betas = []
        for ca in correct_answers:
            if ca.question_number <= 35 and not ca.sub_part:
                beta = random.uniform(-2.0, 2.0)
            else:
                beta = random.uniform(0.0, 3.0)
            betas.append(beta)
        return betas

    def _generate_abilities(self, count):
        """Generate θ ~ N(0, 1.2) truncated to [-3.5, 3.5]."""
        abilities = []
        while len(abilities) < count:
            theta = random.gauss(0, 1.2)
            if -3.5 <= theta <= 3.5:
                abilities.append(theta)
        return abilities

    def _create_students_and_responses(self, exam, correct_answers, betas, abilities):
        students_data = []
        used_names = set()
        now = timezone.now()

        for i, theta in enumerate(abilities):
            name = self._generate_name(used_names)
            student = Student.objects.create(full_name=f"{DUMMY_PREFIX} {name}")
            session = ExamSession.objects.create(
                student=student, exam=exam,
                status=ExamSession.Status.SUBMITTED,
                submitted_at=now,
            )

            responses = []
            answer_objects = []
            for j, ca in enumerate(correct_answers):
                prob = rasch_probability(theta, betas[j])
                is_correct = random.random() < prob
                responses.append(1.0 if is_correct else 0.0)
                answer_objects.append(StudentAnswer(
                    session=session,
                    question_number=ca.question_number,
                    sub_part=ca.sub_part,
                    answer=ca.correct_answer if is_correct else "X",
                    is_correct=is_correct,
                ))
            StudentAnswer.objects.bulk_create(answer_objects)

            students_data.append({
                'name': name,
                'student': student,
                'session': session,
                'true_theta': theta,
                'responses': responses,
            })

        return students_data

    def _generate_name(self, used_names):
        for _ in range(500):
            name = f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"
            if name not in used_names:
                used_names.add(name)
                return name
        # Fallback with number suffix
        name = f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}-{random.randint(1,999)}"
        used_names.add(name)
        return name

    def _print_item_report(self, correct_answers, betas, fit_stats):
        self.stdout.write(self.style.MIGRATE_HEADING(
            f"\n  {'─'*60}\n  ITEM CALIBRATION\n  {'─'*60}"
        ))
        self.stdout.write(f"  {'#':<6}{'Part':<6}{'β':>8}{'Infit':>8}{'Outfit':>8}  {'Flag'}")
        self.stdout.write(f"  {'─'*46}")

        flagged = 0
        for j, ca in enumerate(correct_answers):
            beta = betas[j]
            infit = fit_stats[j]['infit']
            outfit = fit_stats[j]['outfit']
            part = ca.sub_part or "—"
            flag = ""
            if infit < 0.5 or infit > 1.5 or outfit < 0.5 or outfit > 1.5:
                flag = "⚠"
                flagged += 1
            self.stdout.write(
                f"  {ca.question_number:<6}{part:<6}{beta:>8.2f}{infit:>8.2f}{outfit:>8.2f}  {flag}"
            )

        self.stdout.write(f"\n  Flagged items (outside [0.5, 1.5]): {flagged}/{len(correct_answers)}")

    def _print_student_report(self, students_data):
        self.stdout.write(self.style.MIGRATE_HEADING(
            f"\n  {'─'*60}\n  STUDENT SCORING (top 20 + bottom 5)\n  {'─'*60}"
        ))

        # Sort by raw percentage for raw ranking
        by_raw = sorted(students_data, key=lambda s: -s['raw_pct'])
        for i, sd in enumerate(by_raw):
            sd['raw_rank'] = i + 1

        # Sort by Rasch percentage for Rasch ranking
        by_rasch = sorted(students_data, key=lambda s: -s['rasch_pct'])
        for i, sd in enumerate(by_rasch):
            sd['rasch_rank'] = i + 1

        self.stdout.write(
            f"  {'Name':<28}{'θ':>6}{'Raw%':>7}{'Rasch%':>8}"
            f"{'R-Rank':>8}{'Rw-Rank':>9}{'Δ':>5}"
        )
        self.stdout.write(f"  {'─'*71}")

        display = by_rasch[:20] + by_rasch[-5:]
        for sd in display:
            delta = sd['raw_rank'] - sd['rasch_rank']
            delta_str = f"{delta:+d}" if delta != 0 else "="
            self.stdout.write(
                f"  {sd['name']:<28}{sd['theta']:>6.2f}{sd['raw_pct']:>7.1f}"
                f"{sd['rasch_pct']:>8.1f}{sd['rasch_rank']:>8}{sd['raw_rank']:>9}"
                f"  {delta_str}"
            )

    def _print_summary(self, students_data, betas):
        thetas = [sd['theta'] for sd in students_data]
        raw_pcts = [sd['raw_pct'] for sd in students_data]
        rasch_pcts = [sd['rasch_pct'] for sd in students_data]

        # Correlation between raw and Rasch percentages
        corr = float(np.corrcoef(raw_pcts, rasch_pcts)[0, 1])

        # Count ranking changes
        changes = sum(1 for sd in students_data if sd['raw_rank'] != sd['rasch_rank'])

        self.stdout.write(self.style.MIGRATE_HEADING(
            f"\n  {'─'*60}\n  DISTRIBUTION STATISTICS\n  {'─'*60}"
        ))
        self.stdout.write(f"  θ  — mean: {np.mean(thetas):.2f}, SD: {np.std(thetas):.2f}")
        self.stdout.write(f"  β  — mean: {np.mean(betas):.2f}, SD: {np.std(betas):.2f}")
        self.stdout.write(f"  Raw%  — mean: {np.mean(raw_pcts):.1f}, SD: {np.std(raw_pcts):.1f}")
        self.stdout.write(f"  Rasch% — mean: {np.mean(rasch_pcts):.1f}, SD: {np.std(rasch_pcts):.1f}")
        self.stdout.write(f"  Raw↔Rasch correlation: {corr:.4f}")
        self.stdout.write(f"  Ranking changes: {changes}/{len(students_data)}")
