"""Comprehensive tests for the practice mode subsystem.

Covers: start (light/medium), invalid mode, save answer, answer validation,
submit with scoring, results breakdown, time expiry auto-submit,
double submit prevention, and student isolation.
"""

import uuid
from datetime import timedelta

from django.test import TestCase, override_settings
from django.utils import timezone

from exams.models import Question, PracticeSession
from tests.helpers import make_student, authenticated_client


def _make_questions(count=12, topic='algebra'):
    """Create `count` Question objects and return the list."""
    questions = []
    for i in range(count):
        q = Question.objects.create(
            text=f"Savol {i + 1}: 2 + {i} = ?",
            topic=topic,
            difficulty=3,
            answer_type='multiple_choice',
            choices=['A', 'B', 'C', 'D'],
            correct_answer='A',
        )
        questions.append(q)
    return questions


@override_settings(SECURE_SSL_REDIRECT=False)
class TestStartPractice(TestCase):
    """Starting a practice session in light and medium modes."""

    def setUp(self):
        self.client, self.student = authenticated_client()
        _make_questions(count=12)

    def test_start_light_mode(self):
        resp = self.client.post('/api/practice/start/', {'mode': 'light'})
        self.assertEqual(resp.status_code, 201)
        data = resp.json()
        self.assertEqual(data['mode'], 'light')
        self.assertEqual(data['duration'], 30)
        self.assertEqual(len(data['questions']), 6)
        self.assertEqual(data['status'], 'in_progress')
        self.assertIn('id', data)
        self.assertIn('started_at', data)

    def test_start_medium_mode(self):
        resp = self.client.post('/api/practice/start/', {'mode': 'medium'})
        self.assertEqual(resp.status_code, 201)
        data = resp.json()
        self.assertEqual(data['mode'], 'medium')
        self.assertEqual(data['duration'], 60)
        self.assertEqual(len(data['questions']), 10)
        self.assertEqual(data['status'], 'in_progress')

    def test_light_mode_creates_session_in_db(self):
        resp = self.client.post('/api/practice/start/', {'mode': 'light'})
        session_id = resp.json()['id']
        session = PracticeSession.objects.get(id=session_id)
        self.assertEqual(session.student, self.student)
        self.assertEqual(session.mode, 'light')
        self.assertEqual(session.duration, 30)
        self.assertEqual(session.questions.count(), 6)
        self.assertEqual(session.status, PracticeSession.Status.IN_PROGRESS)

    def test_medium_mode_creates_session_in_db(self):
        resp = self.client.post('/api/practice/start/', {'mode': 'medium'})
        session_id = resp.json()['id']
        session = PracticeSession.objects.get(id=session_id)
        self.assertEqual(session.mode, 'medium')
        self.assertEqual(session.duration, 60)
        self.assertEqual(session.questions.count(), 10)

    def test_multiple_practice_sessions_allowed(self):
        """Unlike real exams, students can start multiple practice sessions."""
        resp1 = self.client.post('/api/practice/start/', {'mode': 'light'})
        resp2 = self.client.post('/api/practice/start/', {'mode': 'light'})
        self.assertEqual(resp1.status_code, 201)
        self.assertEqual(resp2.status_code, 201)
        self.assertNotEqual(resp1.json()['id'], resp2.json()['id'])


@override_settings(SECURE_SSL_REDIRECT=False)
class TestStartPracticeInvalidMode(TestCase):
    """Requesting an invalid practice mode should return 400."""

    def setUp(self):
        self.client, self.student = authenticated_client()
        _make_questions(count=6)

    def test_invalid_mode_returns_400(self):
        resp = self.client.post('/api/practice/start/', {'mode': 'hard'})
        self.assertEqual(resp.status_code, 400)
        self.assertIn('error', resp.json())

    def test_missing_mode_returns_400(self):
        resp = self.client.post('/api/practice/start/', {})
        self.assertEqual(resp.status_code, 400)

    def test_empty_mode_returns_400(self):
        resp = self.client.post('/api/practice/start/', {'mode': ''})
        self.assertEqual(resp.status_code, 400)


@override_settings(SECURE_SSL_REDIRECT=False)
class TestStartPracticeNoQuestions(TestCase):
    """Starting practice when question bank is empty should return 404."""

    def setUp(self):
        self.client, self.student = authenticated_client()
        Question.objects.all().delete()  # Clear seeded questions

    def test_empty_question_bank_returns_404(self):
        resp = self.client.post('/api/practice/start/', {'mode': 'light'})
        self.assertEqual(resp.status_code, 404)
        self.assertIn('error', resp.json())


@override_settings(SECURE_SSL_REDIRECT=False)
class TestPracticeDetail(TestCase):
    """Fetching a practice session's details."""

    def setUp(self):
        self.client, self.student = authenticated_client()
        _make_questions(count=6)
        resp = self.client.post('/api/practice/start/', {'mode': 'light'})
        self.session_id = resp.json()['id']

    def test_get_session_detail(self):
        resp = self.client.get(f'/api/practice/{self.session_id}/')
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data['id'], self.session_id)
        self.assertEqual(data['mode'], 'light')
        self.assertEqual(len(data['questions']), 6)

    def test_nonexistent_session_returns_404(self):
        fake_id = uuid.uuid4()
        resp = self.client.get(f'/api/practice/{fake_id}/')
        self.assertEqual(resp.status_code, 404)


@override_settings(SECURE_SSL_REDIRECT=False)
class TestSaveAnswer(TestCase):
    """Saving answers to practice questions."""

    def setUp(self):
        self.client, self.student = authenticated_client()
        self.questions = _make_questions(count=6)
        resp = self.client.post('/api/practice/start/', {'mode': 'light'})
        data = resp.json()
        self.session_id = data['id']
        # Grab the actual question IDs assigned to this session
        self.session_question_ids = [q['id'] for q in data['questions']]

    def test_save_valid_answer(self):
        qid = self.session_question_ids[0]
        resp = self.client.post(
            f'/api/practice/{self.session_id}/answer/',
            {'question_id': qid, 'answer': 'A'},
        )
        self.assertEqual(resp.status_code, 200)
        # Verify answer persisted in the DB
        session = PracticeSession.objects.get(id=self.session_id)
        self.assertEqual(session.answers[str(qid)], 'A')

    def test_overwrite_answer(self):
        """A student can change their answer before submitting."""
        qid = self.session_question_ids[0]
        self.client.post(
            f'/api/practice/{self.session_id}/answer/',
            {'question_id': qid, 'answer': 'A'},
        )
        self.client.post(
            f'/api/practice/{self.session_id}/answer/',
            {'question_id': qid, 'answer': 'B'},
        )
        session = PracticeSession.objects.get(id=self.session_id)
        self.assertEqual(session.answers[str(qid)], 'B')

    def test_save_multiple_answers(self):
        for i, qid in enumerate(self.session_question_ids[:3]):
            resp = self.client.post(
                f'/api/practice/{self.session_id}/answer/',
                {'question_id': qid, 'answer': chr(ord('A') + i)},
            )
            self.assertEqual(resp.status_code, 200)
        session = PracticeSession.objects.get(id=self.session_id)
        self.assertEqual(len(session.answers), 3)


@override_settings(SECURE_SSL_REDIRECT=False)
class TestAnswerNormalization(TestCase):
    """Answers are compared using normalize_answer for scoring, so unicode symbols should match."""

    def setUp(self):
        self.client, self.student = authenticated_client()
        # Create a question with a specific correct answer using standard characters
        self.question = Question.objects.create(
            text="Hisoblang: 3 * 4 - 2",
            topic='algebra',
            difficulty=2,
            answer_type='free_response',
            correct_answer='10',
        )
        # Need enough questions for light mode (6)
        for i in range(5):
            Question.objects.create(
                text=f"Extra {i}",
                topic='algebra',
                difficulty=3,
                answer_type='multiple_choice',
                choices=['A', 'B', 'C', 'D'],
                correct_answer='B',
            )

    def test_unicode_minus_normalized_on_scoring(self):
        """Unicode minus sign (U+2212) should match regular hyphen in scoring."""
        resp = self.client.post('/api/practice/start/', {'mode': 'light'})
        session_id = resp.json()['id']
        session = PracticeSession.objects.get(id=session_id)

        # Manually set up a question with answer that uses unicode minus
        q = Question.objects.create(
            text="Hisoblang: 3 - 5",
            topic='algebra',
            difficulty=2,
            answer_type='free_response',
            correct_answer='-2',  # standard hyphen-minus
        )
        session.questions.add(q)

        # Save answer with unicode minus
        self.client.post(
            f'/api/practice/{session_id}/answer/',
            {'question_id': str(q.id), 'answer': '\u22122'},  # unicode minus
        )

        # Submit and check the score accounts for normalization
        self.client.post(f'/api/practice/{session_id}/submit/')
        resp = self.client.get(f'/api/practice/{session_id}/results/')
        self.assertEqual(resp.status_code, 200)
        breakdown = resp.json()['breakdown']
        # Find the question we care about
        for item in breakdown:
            if item['question']['id'] == str(q.id):
                self.assertTrue(item['is_correct'],
                                "Unicode minus answer should match standard hyphen in correct_answer")
                break


@override_settings(SECURE_SSL_REDIRECT=False)
class TestAnswerValidation(TestCase):
    """Edge cases for answer saving: invalid question ID, too-long answer, already submitted."""

    def setUp(self):
        self.client, self.student = authenticated_client()
        self.questions = _make_questions(count=6)
        resp = self.client.post('/api/practice/start/', {'mode': 'light'})
        data = resp.json()
        self.session_id = data['id']
        self.session_question_ids = [q['id'] for q in data['questions']]

    def test_invalid_question_id_returns_400(self):
        fake_qid = str(uuid.uuid4())
        resp = self.client.post(
            f'/api/practice/{self.session_id}/answer/',
            {'question_id': fake_qid, 'answer': 'A'},
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('error', resp.json())

    def test_question_not_in_session_returns_400(self):
        """A valid question that was not assigned to this session should be rejected."""
        # Create a question not in this session
        extra_q = Question.objects.create(
            text="Not in session",
            topic='geometry',
            difficulty=1,
            answer_type='multiple_choice',
            choices=['A', 'B', 'C', 'D'],
            correct_answer='C',
        )
        resp = self.client.post(
            f'/api/practice/{self.session_id}/answer/',
            {'question_id': str(extra_q.id), 'answer': 'C'},
        )
        self.assertEqual(resp.status_code, 400)

    def test_too_long_answer_returns_400(self):
        qid = self.session_question_ids[0]
        resp = self.client.post(
            f'/api/practice/{self.session_id}/answer/',
            {'question_id': qid, 'answer': 'A' * 501},
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('error', resp.json())

    def test_answer_exactly_500_chars_accepted(self):
        qid = self.session_question_ids[0]
        resp = self.client.post(
            f'/api/practice/{self.session_id}/answer/',
            {'question_id': qid, 'answer': 'A' * 500},
        )
        self.assertEqual(resp.status_code, 200)

    def test_missing_question_id_returns_400(self):
        resp = self.client.post(
            f'/api/practice/{self.session_id}/answer/',
            {'answer': 'A'},
        )
        self.assertEqual(resp.status_code, 400)

    def test_missing_answer_returns_400(self):
        qid = self.session_question_ids[0]
        resp = self.client.post(
            f'/api/practice/{self.session_id}/answer/',
            {'question_id': qid},
        )
        self.assertEqual(resp.status_code, 400)

    def test_answer_to_submitted_session_returns_403(self):
        # Submit first
        self.client.post(f'/api/practice/{self.session_id}/submit/')
        # Then try to save an answer
        qid = self.session_question_ids[0]
        resp = self.client.post(
            f'/api/practice/{self.session_id}/answer/',
            {'question_id': qid, 'answer': 'A'},
        )
        self.assertEqual(resp.status_code, 403)
        self.assertIn('error', resp.json())


@override_settings(SECURE_SSL_REDIRECT=False)
class TestSubmitPractice(TestCase):
    """Submitting a practice session: scoring, status change, submitted_at."""

    def setUp(self):
        self.client, self.student = authenticated_client()
        # Create questions with known correct answers
        self.questions = []
        answers = ['A', 'B', 'C', 'D', 'A', 'B']
        for i, ans in enumerate(answers):
            q = Question.objects.create(
                text=f"Savol {i + 1}",
                topic='algebra',
                difficulty=3,
                answer_type='multiple_choice',
                choices=['A', 'B', 'C', 'D'],
                correct_answer=ans,
            )
            self.questions.append(q)

        resp = self.client.post('/api/practice/start/', {'mode': 'light'})
        data = resp.json()
        self.session_id = data['id']
        self.session_questions = data['questions']

    def test_submit_with_all_correct_answers(self):
        # Save correct answers for each question in the session
        session = PracticeSession.objects.get(id=self.session_id)
        session_qs = {str(q.id): q for q in session.questions.all()}

        for qid, q in session_qs.items():
            self.client.post(
                f'/api/practice/{self.session_id}/answer/',
                {'question_id': qid, 'answer': q.correct_answer},
            )

        resp = self.client.post(f'/api/practice/{self.session_id}/submit/')
        self.assertEqual(resp.status_code, 200)

        session.refresh_from_db()
        self.assertEqual(session.status, PracticeSession.Status.SUBMITTED)
        self.assertEqual(session.score, len(session_qs))
        self.assertIsNotNone(session.submitted_at)

    def test_submit_with_no_answers(self):
        resp = self.client.post(f'/api/practice/{self.session_id}/submit/')
        self.assertEqual(resp.status_code, 200)

        session = PracticeSession.objects.get(id=self.session_id)
        self.assertEqual(session.score, 0)
        self.assertEqual(session.status, PracticeSession.Status.SUBMITTED)
        self.assertIsNotNone(session.submitted_at)

    def test_submit_with_partial_correct(self):
        session = PracticeSession.objects.get(id=self.session_id)
        session_qs = list(session.questions.all())
        correct_count = 0

        # Answer first half correctly, second half incorrectly
        for i, q in enumerate(session_qs):
            if i < len(session_qs) // 2:
                answer = q.correct_answer
                correct_count += 1
            else:
                answer = 'Z'  # deliberately wrong
            self.client.post(
                f'/api/practice/{self.session_id}/answer/',
                {'question_id': str(q.id), 'answer': answer},
            )

        self.client.post(f'/api/practice/{self.session_id}/submit/')
        session.refresh_from_db()
        self.assertEqual(session.score, correct_count)

    def test_submit_sets_submitted_at(self):
        before = timezone.now()
        self.client.post(f'/api/practice/{self.session_id}/submit/')
        after = timezone.now()

        session = PracticeSession.objects.get(id=self.session_id)
        self.assertIsNotNone(session.submitted_at)
        self.assertGreaterEqual(session.submitted_at, before)
        self.assertLessEqual(session.submitted_at, after)


@override_settings(SECURE_SSL_REDIRECT=False)
class TestPracticeResults(TestCase):
    """Fetching results for a submitted practice session."""

    def setUp(self):
        self.client, self.student = authenticated_client()
        # Create questions with known answers
        self.q1 = Question.objects.create(
            text="2 + 2 = ?", topic='algebra', difficulty=1,
            answer_type='free_response', correct_answer='4',
        )
        self.q2 = Question.objects.create(
            text="3 * 3 = ?", topic='algebra', difficulty=2,
            answer_type='free_response', correct_answer='9',
        )
        self.q3 = Question.objects.create(
            text="Uchburchak tomonlari", topic='geometry', difficulty=3,
            answer_type='multiple_choice', choices=['A', 'B', 'C', 'D'],
            correct_answer='B',
        )
        # Extra questions to fill the 6 needed for light mode
        for i in range(3):
            Question.objects.create(
                text=f"Filler {i}", topic='algebra', difficulty=1,
                answer_type='multiple_choice', choices=['A', 'B', 'C', 'D'],
                correct_answer='D',
            )

        resp = self.client.post('/api/practice/start/', {'mode': 'light'})
        data = resp.json()
        self.session_id = data['id']

    def test_results_before_submit_returns_403(self):
        resp = self.client.get(f'/api/practice/{self.session_id}/results/')
        self.assertEqual(resp.status_code, 403)
        self.assertIn('error', resp.json())

    def test_results_after_submit(self):
        # Save some answers
        session = PracticeSession.objects.get(id=self.session_id)
        session_qs = list(session.questions.all())

        # Answer first question correctly
        q_first = session_qs[0]
        self.client.post(
            f'/api/practice/{self.session_id}/answer/',
            {'question_id': str(q_first.id), 'answer': q_first.correct_answer},
        )

        # Submit
        self.client.post(f'/api/practice/{self.session_id}/submit/')

        # Get results
        resp = self.client.get(f'/api/practice/{self.session_id}/results/')
        self.assertEqual(resp.status_code, 200)
        data = resp.json()

        self.assertEqual(data['session_id'], self.session_id)
        self.assertEqual(data['mode'], 'light')
        self.assertIsNotNone(data['score'])
        self.assertEqual(data['total'], 6)
        self.assertEqual(data['duration'], 30)
        self.assertIsNotNone(data['started_at'])
        self.assertIsNotNone(data['submitted_at'])

        # Verify breakdown structure
        self.assertEqual(len(data['breakdown']), 6)
        for item in data['breakdown']:
            self.assertIn('question', item)
            self.assertIn('student_answer', item)
            self.assertIn('is_correct', item)
            # Question should include correct_answer and explanation (QuestionResultSerializer)
            self.assertIn('correct_answer', item['question'])
            self.assertIn('explanation', item['question'])

    def test_results_breakdown_correctness(self):
        """Verify that the breakdown accurately marks correct/incorrect answers."""
        session = PracticeSession.objects.get(id=self.session_id)
        session_qs = list(session.questions.all())

        # Answer first question correctly, rest wrong
        self.client.post(
            f'/api/practice/{self.session_id}/answer/',
            {'question_id': str(session_qs[0].id), 'answer': session_qs[0].correct_answer},
        )
        for q in session_qs[1:]:
            self.client.post(
                f'/api/practice/{self.session_id}/answer/',
                {'question_id': str(q.id), 'answer': 'WRONG_ANSWER'},
            )

        self.client.post(f'/api/practice/{self.session_id}/submit/')
        resp = self.client.get(f'/api/practice/{self.session_id}/results/')
        data = resp.json()

        self.assertEqual(data['score'], 1)
        correct_items = [b for b in data['breakdown'] if b['is_correct']]
        wrong_items = [b for b in data['breakdown'] if not b['is_correct']]
        self.assertEqual(len(correct_items), 1)
        self.assertEqual(len(wrong_items), 5)

    def test_unanswered_questions_in_breakdown(self):
        """Questions the student did not answer should appear with empty string and is_correct=False."""
        self.client.post(f'/api/practice/{self.session_id}/submit/')
        resp = self.client.get(f'/api/practice/{self.session_id}/results/')
        data = resp.json()

        for item in data['breakdown']:
            self.assertEqual(item['student_answer'], '')
            self.assertFalse(item['is_correct'])


@override_settings(SECURE_SSL_REDIRECT=False)
class TestTimeExpiry(TestCase):
    """Answering after the time limit should auto-submit the session."""

    def setUp(self):
        self.client, self.student = authenticated_client()
        self.questions = _make_questions(count=6)
        resp = self.client.post('/api/practice/start/', {'mode': 'light'})
        data = resp.json()
        self.session_id = data['id']
        self.session_question_ids = [q['id'] for q in data['questions']]

    def test_answer_after_time_expires_auto_submits(self):
        # Manually backdate started_at to simulate expired time
        session = PracticeSession.objects.get(id=self.session_id)
        session.started_at = timezone.now() - timedelta(minutes=31)
        # auto_now_add prevents normal save from changing started_at,
        # so use update() to bypass
        PracticeSession.objects.filter(id=self.session_id).update(
            started_at=timezone.now() - timedelta(minutes=31)
        )

        qid = self.session_question_ids[0]
        resp = self.client.post(
            f'/api/practice/{self.session_id}/answer/',
            {'question_id': qid, 'answer': 'A'},
        )
        self.assertEqual(resp.status_code, 403)
        self.assertIn('error', resp.json())

        # Session should now be submitted
        session.refresh_from_db()
        self.assertEqual(session.status, PracticeSession.Status.SUBMITTED)
        self.assertIsNotNone(session.submitted_at)

    def test_submit_still_works_when_time_just_expired(self):
        """Even if time has expired, explicit submit should work (it scores whatever is there)."""
        PracticeSession.objects.filter(id=self.session_id).update(
            started_at=timezone.now() - timedelta(minutes=31)
        )
        resp = self.client.post(f'/api/practice/{self.session_id}/submit/')
        self.assertEqual(resp.status_code, 200)

        session = PracticeSession.objects.get(id=self.session_id)
        self.assertEqual(session.status, PracticeSession.Status.SUBMITTED)

    def test_medium_mode_expiry_at_60_minutes(self):
        """Medium mode has a 60-minute duration."""
        _make_questions(count=10, topic='geometry')
        resp = self.client.post('/api/practice/start/', {'mode': 'medium'})
        med_session_id = resp.json()['id']
        med_question_ids = [q['id'] for q in resp.json()['questions']]

        # Set started_at to 61 minutes ago
        PracticeSession.objects.filter(id=med_session_id).update(
            started_at=timezone.now() - timedelta(minutes=61)
        )

        qid = med_question_ids[0]
        resp = self.client.post(
            f'/api/practice/{med_session_id}/answer/',
            {'question_id': qid, 'answer': 'A'},
        )
        self.assertEqual(resp.status_code, 403)

        session = PracticeSession.objects.get(id=med_session_id)
        self.assertEqual(session.status, PracticeSession.Status.SUBMITTED)

    def test_answer_within_time_accepted(self):
        """Answer within the time limit should succeed normally."""
        # started_at is just now, so 30 minutes remain
        qid = self.session_question_ids[0]
        resp = self.client.post(
            f'/api/practice/{self.session_id}/answer/',
            {'question_id': qid, 'answer': 'A'},
        )
        self.assertEqual(resp.status_code, 200)


@override_settings(SECURE_SSL_REDIRECT=False)
class TestDoubleSubmit(TestCase):
    """Submitting a practice session that was already submitted should return 403."""

    def setUp(self):
        self.client, self.student = authenticated_client()
        _make_questions(count=6)
        resp = self.client.post('/api/practice/start/', {'mode': 'light'})
        self.session_id = resp.json()['id']

    def test_double_submit_returns_403(self):
        resp1 = self.client.post(f'/api/practice/{self.session_id}/submit/')
        self.assertEqual(resp1.status_code, 200)

        resp2 = self.client.post(f'/api/practice/{self.session_id}/submit/')
        self.assertEqual(resp2.status_code, 403)
        self.assertIn('error', resp2.json())

    def test_score_unchanged_after_double_submit(self):
        session = PracticeSession.objects.get(id=self.session_id)
        session_qs = list(session.questions.all())

        # Answer one question correctly
        self.client.post(
            f'/api/practice/{self.session_id}/answer/',
            {'question_id': str(session_qs[0].id), 'answer': session_qs[0].correct_answer},
        )

        self.client.post(f'/api/practice/{self.session_id}/submit/')
        session.refresh_from_db()
        original_score = session.score
        original_submitted_at = session.submitted_at

        # Second submit should be rejected, score unchanged
        self.client.post(f'/api/practice/{self.session_id}/submit/')
        session.refresh_from_db()
        self.assertEqual(session.score, original_score)
        self.assertEqual(session.submitted_at, original_submitted_at)


@override_settings(SECURE_SSL_REDIRECT=False)
class TestStudentIsolation(TestCase):
    """One student cannot access or modify another student's practice session."""

    def setUp(self):
        # Student A creates a session
        self.client_a, self.student_a = authenticated_client(
            make_student(telegram_id=200001, full_name="Student A")
        )
        # Student B
        self.client_b, self.student_b = authenticated_client(
            make_student(telegram_id=200002, full_name="Student B")
        )
        _make_questions(count=6)
        resp = self.client_a.post('/api/practice/start/', {'mode': 'light'})
        data = resp.json()
        self.session_id_a = data['id']
        self.session_question_ids = [q['id'] for q in data['questions']]

    def test_other_student_cannot_view_session(self):
        resp = self.client_b.get(f'/api/practice/{self.session_id_a}/')
        self.assertEqual(resp.status_code, 404)

    def test_other_student_cannot_save_answer(self):
        qid = self.session_question_ids[0]
        resp = self.client_b.post(
            f'/api/practice/{self.session_id_a}/answer/',
            {'question_id': qid, 'answer': 'A'},
        )
        self.assertEqual(resp.status_code, 404)

    def test_other_student_cannot_submit(self):
        resp = self.client_b.post(f'/api/practice/{self.session_id_a}/submit/')
        self.assertEqual(resp.status_code, 404)

    def test_other_student_cannot_view_results(self):
        # Submit as student A first
        self.client_a.post(f'/api/practice/{self.session_id_a}/submit/')
        # Student B tries to view results
        resp = self.client_b.get(f'/api/practice/{self.session_id_a}/results/')
        self.assertEqual(resp.status_code, 404)

    def test_student_can_access_own_session(self):
        """Sanity check: the owning student CAN access their own session."""
        resp = self.client_a.get(f'/api/practice/{self.session_id_a}/')
        self.assertEqual(resp.status_code, 200)

    def test_student_b_has_own_sessions(self):
        """Student B's own practice sessions should be accessible to them."""
        resp = self.client_b.post('/api/practice/start/', {'mode': 'light'})
        self.assertEqual(resp.status_code, 201)
        session_id_b = resp.json()['id']

        resp = self.client_b.get(f'/api/practice/{session_id_b}/')
        self.assertEqual(resp.status_code, 200)

        # Student A cannot access student B's session
        resp = self.client_a.get(f'/api/practice/{session_id_b}/')
        self.assertEqual(resp.status_code, 404)


@override_settings(SECURE_SSL_REDIRECT=False)
class TestUnauthenticatedAccess(TestCase):
    """Practice endpoints should reject unauthenticated requests."""

    def setUp(self):
        from rest_framework.test import APIClient
        self.client = APIClient()
        _make_questions(count=6)

    def test_start_practice_requires_auth(self):
        resp = self.client.post('/api/practice/start/', {'mode': 'light'})
        self.assertEqual(resp.status_code, 401)

    def test_practice_detail_requires_auth(self):
        fake_id = uuid.uuid4()
        resp = self.client.get(f'/api/practice/{fake_id}/')
        self.assertEqual(resp.status_code, 401)

    def test_practice_answer_requires_auth(self):
        fake_id = uuid.uuid4()
        resp = self.client.post(
            f'/api/practice/{fake_id}/answer/',
            {'question_id': str(uuid.uuid4()), 'answer': 'A'},
        )
        self.assertEqual(resp.status_code, 401)

    def test_practice_submit_requires_auth(self):
        fake_id = uuid.uuid4()
        resp = self.client.post(f'/api/practice/{fake_id}/submit/')
        self.assertEqual(resp.status_code, 401)

    def test_practice_results_requires_auth(self):
        fake_id = uuid.uuid4()
        resp = self.client.get(f'/api/practice/{fake_id}/results/')
        self.assertEqual(resp.status_code, 401)


@override_settings(SECURE_SSL_REDIRECT=False)
class TestQuestionBalancing(TestCase):
    """_assemble_questions should try to pick from diverse topics."""

    def setUp(self):
        self.client, self.student = authenticated_client()

    def test_questions_from_multiple_topics(self):
        """When questions span multiple topics, the selection should cover them."""
        topics = ['algebra', 'geometry', 'probability', 'calculus', 'trigonometry', 'number_theory']
        for topic in topics:
            for i in range(3):
                Question.objects.create(
                    text=f"{topic} q{i}", topic=topic, difficulty=2,
                    answer_type='multiple_choice', choices=['A', 'B', 'C', 'D'],
                    correct_answer='A',
                )

        resp = self.client.post('/api/practice/start/', {'mode': 'light'})
        self.assertEqual(resp.status_code, 201)
        data = resp.json()
        self.assertEqual(len(data['questions']), 6)
        # With 6 topics and 6 questions, we expect at least a few different topics
        topics_in_session = {q['topic'] for q in data['questions']}
        self.assertGreaterEqual(len(topics_in_session), 3,
                                "Expected at least 3 different topics in a light practice session")

    def test_fewer_questions_than_requested(self):
        """If the bank has fewer questions than the mode requests, use all available."""
        Question.objects.all().delete()  # Clear seeded questions
        for i in range(4):
            Question.objects.create(
                text=f"Q{i}", topic='algebra', difficulty=1,
                answer_type='multiple_choice', choices=['A', 'B', 'C', 'D'],
                correct_answer='A',
            )

        resp = self.client.post('/api/practice/start/', {'mode': 'light'})
        self.assertEqual(resp.status_code, 201)
        data = resp.json()
        # Only 4 questions available, light mode asks for 6
        self.assertEqual(len(data['questions']), 4)


@override_settings(SECURE_SSL_REDIRECT=False)
class TestScoringAccuracy(TestCase):
    """Verify that _submit_practice scores answers correctly with edge cases."""

    def setUp(self):
        self.client, self.student = authenticated_client()

    def test_case_insensitive_scoring(self):
        """Answers should be compared case-insensitively (normalize_answer lowercases)."""
        q = Question.objects.create(
            text="Upper or lower?", topic='algebra', difficulty=1,
            answer_type='multiple_choice', choices=['A', 'B', 'C', 'D'],
            correct_answer='a',
        )
        # Fill the rest of the slots
        for i in range(5):
            Question.objects.create(
                text=f"Filler {i}", topic='algebra', difficulty=1,
                answer_type='multiple_choice', choices=['A', 'B', 'C', 'D'],
                correct_answer='X',
            )

        resp = self.client.post('/api/practice/start/', {'mode': 'light'})
        session_id = resp.json()['id']

        session = PracticeSession.objects.get(id=session_id)
        if q in session.questions.all():
            self.client.post(
                f'/api/practice/{session_id}/answer/',
                {'question_id': str(q.id), 'answer': 'A'},  # uppercase
            )

        self.client.post(f'/api/practice/{session_id}/submit/')
        session.refresh_from_db()
        # If q was in the session and answered 'A' (uppercase) for correct 'a' (lowercase),
        # normalize_answer should make them match
        if q in session.questions.all():
            self.assertGreaterEqual(session.score, 1)

    def test_whitespace_stripped_in_scoring(self):
        """Leading/trailing whitespace should not affect scoring."""
        q = Question.objects.create(
            text="Spaces?", topic='algebra', difficulty=1,
            answer_type='free_response', correct_answer='42',
        )
        for i in range(5):
            Question.objects.create(
                text=f"Pad {i}", topic='algebra', difficulty=1,
                answer_type='free_response', correct_answer='99',
            )

        resp = self.client.post('/api/practice/start/', {'mode': 'light'})
        session_id = resp.json()['id']
        session = PracticeSession.objects.get(id=session_id)

        if q in session.questions.all():
            self.client.post(
                f'/api/practice/{session_id}/answer/',
                {'question_id': str(q.id), 'answer': '  42  '},  # with spaces
            )

        self.client.post(f'/api/practice/{session_id}/submit/')
        resp = self.client.get(f'/api/practice/{session_id}/results/')
        data = resp.json()

        if q in session.questions.all():
            for item in data['breakdown']:
                if item['question']['id'] == str(q.id):
                    self.assertTrue(item['is_correct'],
                                    "'  42  ' should match '42' after normalization")

    def test_perfect_score(self):
        """All correct answers should yield score == total questions."""
        Question.objects.all().delete()  # Clear seeded questions
        for i in range(6):
            Question.objects.create(
                text=f"Perfect {i}", topic='algebra', difficulty=1,
                answer_type='multiple_choice', choices=['A', 'B', 'C', 'D'],
                correct_answer='A',
            )

        resp = self.client.post('/api/practice/start/', {'mode': 'light'})
        session_id = resp.json()['id']
        session = PracticeSession.objects.get(id=session_id)

        for q in session.questions.all():
            self.client.post(
                f'/api/practice/{session_id}/answer/',
                {'question_id': str(q.id), 'answer': q.correct_answer},
            )

        self.client.post(f'/api/practice/{session_id}/submit/')
        session.refresh_from_db()
        self.assertEqual(session.score, session.questions.count())

    def test_zero_score(self):
        """All wrong answers should yield score == 0."""
        for i in range(6):
            Question.objects.create(
                text=f"Zero {i}", topic='algebra', difficulty=1,
                answer_type='multiple_choice', choices=['A', 'B', 'C', 'D'],
                correct_answer='A',
            )

        resp = self.client.post('/api/practice/start/', {'mode': 'light'})
        session_id = resp.json()['id']
        session = PracticeSession.objects.get(id=session_id)

        for q in session.questions.all():
            self.client.post(
                f'/api/practice/{session_id}/answer/',
                {'question_id': str(q.id), 'answer': 'Z'},
            )

        self.client.post(f'/api/practice/{session_id}/submit/')
        session.refresh_from_db()
        self.assertEqual(session.score, 0)
