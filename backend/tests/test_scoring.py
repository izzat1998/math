from django.test import TestCase
from exams.scoring import compute_letter_grade, compute_rasch_scaled_score


class TestLetterGrades(TestCase):
    def test_a_plus_at_70(self):
        self.assertEqual(compute_letter_grade(70), 'A+')

    def test_a_plus_at_75(self):
        self.assertEqual(compute_letter_grade(75), 'A+')

    def test_a_at_64(self):
        self.assertEqual(compute_letter_grade(64), 'A')

    def test_a_at_69(self):
        self.assertEqual(compute_letter_grade(69.9), 'A')

    def test_b_plus_at_60(self):
        self.assertEqual(compute_letter_grade(60), 'B+')

    def test_b_plus_at_63(self):
        self.assertEqual(compute_letter_grade(63), 'B+')

    def test_b_at_55(self):
        self.assertEqual(compute_letter_grade(55), 'B')

    def test_b_at_59(self):
        self.assertEqual(compute_letter_grade(59), 'B')

    def test_c_plus_at_50(self):
        self.assertEqual(compute_letter_grade(50), 'C+')

    def test_c_plus_at_54(self):
        self.assertEqual(compute_letter_grade(54), 'C+')

    def test_c_at_46(self):
        self.assertEqual(compute_letter_grade(46), 'C')

    def test_c_at_49(self):
        self.assertEqual(compute_letter_grade(49), 'C')

    def test_d_below_46(self):
        self.assertEqual(compute_letter_grade(45.9), 'D')

    def test_d_at_zero(self):
        self.assertEqual(compute_letter_grade(0), 'D')

    def test_none_returns_none(self):
        self.assertIsNone(compute_letter_grade(None))


class TestRaschScaledScore(TestCase):
    def test_theta_zero_maps_to_37_5(self):
        scaled = compute_rasch_scaled_score(theta=0.0)
        self.assertAlmostEqual(scaled, 37.5, delta=0.1)

    def test_high_theta_maps_high(self):
        scaled = compute_rasch_scaled_score(theta=3.0)
        self.assertGreater(scaled, 60)
        self.assertLessEqual(scaled, 75)

    def test_low_theta_maps_low(self):
        scaled = compute_rasch_scaled_score(theta=-3.0)
        self.assertLess(scaled, 15)
        self.assertGreaterEqual(scaled, 0)

    def test_clamps_to_0_75(self):
        self.assertEqual(compute_rasch_scaled_score(theta=10.0), 75.0)
        self.assertEqual(compute_rasch_scaled_score(theta=-10.0), 0.0)

    def test_max_theta_maps_to_75(self):
        self.assertEqual(compute_rasch_scaled_score(theta=4.0), 75.0)

    def test_min_theta_maps_to_0(self):
        self.assertEqual(compute_rasch_scaled_score(theta=-4.0), 0.0)
