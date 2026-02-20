from django.test import TestCase
from exams.scoring import compute_letter_grade, compute_rasch_scaled_score


class TestLetterGrades(TestCase):
    def test_top_10_percent_gets_a_plus(self):
        scores = [90, 85, 80, 75, 70, 65, 60, 55, 50, 45]
        grade = compute_letter_grade(score=90, all_scores=scores)
        self.assertEqual(grade, 'A+')

    def test_bottom_gets_d(self):
        scores = [90, 85, 80, 75, 70, 65, 60, 55, 50, 45]
        grade = compute_letter_grade(score=45, all_scores=scores)
        self.assertEqual(grade, 'D')

    def test_single_participant(self):
        scores = [70]
        grade = compute_letter_grade(score=70, all_scores=scores)
        self.assertEqual(grade, 'A+')

    def test_grade_boundaries(self):
        scores = list(range(1, 21))
        self.assertEqual(compute_letter_grade(20, scores), 'A+')
        self.assertEqual(compute_letter_grade(19, scores), 'A+')

    def test_empty_scores(self):
        self.assertEqual(compute_letter_grade(50, []), 'D')


class TestRaschScaledScore(TestCase):
    def test_theta_zero_maps_to_50(self):
        scaled = compute_rasch_scaled_score(theta=0.0)
        self.assertAlmostEqual(scaled, 50.0, delta=1)

    def test_high_theta_maps_high(self):
        scaled = compute_rasch_scaled_score(theta=3.0)
        self.assertGreater(scaled, 80)
        self.assertLessEqual(scaled, 100)

    def test_low_theta_maps_low(self):
        scaled = compute_rasch_scaled_score(theta=-3.0)
        self.assertLess(scaled, 20)
        self.assertGreaterEqual(scaled, 0)

    def test_clamps_to_0_100(self):
        self.assertEqual(compute_rasch_scaled_score(theta=10.0), 100.0)
        self.assertEqual(compute_rasch_scaled_score(theta=-10.0), 0.0)
