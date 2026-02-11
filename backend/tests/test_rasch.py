"""
Comprehensive unit tests for the Rasch psychometric engine.

Tests cover:
- rasch_probability: known values, symmetry, extreme inputs, monotonicity
- estimate_theta: perfect/zero scores, mixed responses, ability recovery
- estimate_item_difficulties: JMLE recovery, centering, ordering, missing data
- compute_item_fit: well-fitting data, misfitting items, edge cases
- large-scale recovery matching real exam dimensions (500 x 55)
"""

import math
import numpy as np
import pytest
from exams.rasch import (
    rasch_probability,
    estimate_theta,
    estimate_item_difficulties,
    compute_item_fit,
)


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _generate_response_matrix(true_thetas, true_betas, rng):
    """Generate a Rasch-conforming binary response matrix."""
    N = len(true_thetas)
    J = len(true_betas)
    matrix = np.zeros((N, J))
    for i in range(N):
        for j in range(J):
            p = rasch_probability(true_thetas[i], true_betas[j])
            matrix[i, j] = 1 if rng.random() < p else 0
    return matrix


# ---------------------------------------------------------------------------
# 1. rasch_probability -- known analytic values
# ---------------------------------------------------------------------------

class TestRaschProbability:

    def test_rasch_probability_known_values(self):
        """Verify P(theta, beta) against hand-computed values."""
        # Equal ability and difficulty => 0.5
        assert rasch_probability(0, 0) == pytest.approx(0.5, abs=1e-9)

        # High ability, medium difficulty
        assert rasch_probability(2, 0) == pytest.approx(
            math.exp(2) / (1 + math.exp(2)), abs=1e-4
        )
        assert rasch_probability(2, 0) == pytest.approx(0.8808, abs=1e-3)

        # Low ability, medium difficulty
        assert rasch_probability(-2, 0) == pytest.approx(0.1192, abs=1e-3)

        # Medium ability, hard item
        assert rasch_probability(0, 2) == pytest.approx(0.1192, abs=1e-3)

    def test_rasch_probability_symmetry(self):
        """P(theta, beta) + P(2*beta - theta, beta) == 1 (logistic mirror)."""
        for theta, beta in [(1, 0), (0.5, -1), (3, 1), (-2, 2)]:
            p1 = rasch_probability(theta, beta)
            p2 = rasch_probability(2 * beta - theta, beta)
            assert p1 + p2 == pytest.approx(1.0, abs=1e-9)

    def test_rasch_probability_extreme_values(self):
        """Extreme theta should not overflow or produce NaN."""
        p_high = rasch_probability(30, 0)
        p_low = rasch_probability(-30, 0)

        assert p_high == pytest.approx(1.0, abs=1e-6)
        assert p_low == pytest.approx(0.0, abs=1e-6)

        # Even more extreme -- the clamp at +/-30 protects us
        p_very_high = rasch_probability(100, 0)
        p_very_low = rasch_probability(-100, 0)
        assert not math.isnan(p_very_high)
        assert not math.isnan(p_very_low)
        assert p_very_high == pytest.approx(1.0, abs=1e-6)
        assert p_very_low == pytest.approx(0.0, abs=1e-6)

    def test_rasch_probability_monotonicity(self):
        """Higher theta (fixed beta) should yield higher probability."""
        beta = 0.0
        prev = 0.0
        for theta in np.linspace(-4, 4, 50):
            p = rasch_probability(theta, beta)
            assert p >= prev
            prev = p


# ---------------------------------------------------------------------------
# 2. estimate_theta -- edge cases and recovery
# ---------------------------------------------------------------------------

class TestEstimateTheta:

    def test_estimate_theta_perfect_score(self):
        """Perfect score should yield theta > max(betas)."""
        betas = [-1, 0, 1, 2]
        responses = [1, 1, 1, 1]
        theta = estimate_theta(responses, betas)
        assert theta > max(betas), (
            f"Perfect score theta ({theta}) should exceed max beta ({max(betas)})"
        )

    def test_estimate_theta_zero_score(self):
        """Zero score should yield theta < min(betas)."""
        betas = [-1, 0, 1, 2]
        responses = [0, 0, 0, 0]
        theta = estimate_theta(responses, betas)
        assert theta < min(betas), (
            f"Zero score theta ({theta}) should be below min beta ({min(betas)})"
        )

    def test_estimate_theta_mixed_responses(self):
        """Easy items right, hard items wrong => moderate theta."""
        betas = np.array([-2.0, -1.0, 0.0, 1.0, 2.0])
        responses = np.array([1, 1, 0, 0, 0])
        theta = estimate_theta(responses, betas)
        assert -3.0 < theta < 1.0

    def test_estimate_theta_recovery(self):
        """Generate responses from a known theta; recovered theta should be close."""
        rng = np.random.default_rng(42)
        true_theta = 1.0
        betas = np.linspace(-2, 2, 20)

        responses = np.array([
            1 if rng.random() < rasch_probability(true_theta, b) else 0
            for b in betas
        ])

        estimated = estimate_theta(responses, betas)
        assert abs(estimated - true_theta) < 0.5, (
            f"Recovered theta {estimated:.3f} too far from true theta {true_theta}"
        )

    def test_estimate_theta_recovery_multiple_seeds(self):
        """Recovery should work across several random seeds."""
        betas = np.linspace(-2, 2, 40)
        true_theta = -0.5
        errors = []

        for seed in range(10):
            rng = np.random.default_rng(seed + 100)
            responses = np.array([
                1 if rng.random() < rasch_probability(true_theta, b) else 0
                for b in betas
            ])
            est = estimate_theta(responses, betas)
            errors.append(abs(est - true_theta))

        mean_error = np.mean(errors)
        assert mean_error < 0.6, (
            f"Mean absolute error {mean_error:.3f} across seeds is too large"
        )


# ---------------------------------------------------------------------------
# 3. estimate_item_difficulties -- JMLE recovery and centering
# ---------------------------------------------------------------------------

class TestEstimateItemDifficulties:

    def test_estimate_item_difficulties_recovery(self):
        """JMLE should recover true item difficulties with high correlation."""
        rng = np.random.default_rng(123)
        true_betas = np.array([-2.0, -1.0, 0.0, 1.0, 2.0])
        true_thetas = np.linspace(-3, 3, 500)

        matrix = _generate_response_matrix(true_thetas, true_betas, rng)
        est_betas, est_thetas = estimate_item_difficulties(matrix)

        # Center true_betas for fair comparison (JMLE centers betas)
        true_centered = true_betas - true_betas.mean()

        corr = np.corrcoef(true_centered, est_betas)[0, 1]
        assert corr > 0.95, f"Correlation {corr:.4f} below 0.95"

        # JMLE with theta clamped to [-5,5] causes scale shrinkage, so compare
        # on the standardized scale.
        est_std = est_betas / np.std(est_betas) if np.std(est_betas) > 0 else est_betas
        true_std = true_centered / np.std(true_centered) if np.std(true_centered) > 0 else true_centered
        rmse_std = np.sqrt(np.mean((est_std - true_std) ** 2))
        assert rmse_std < 0.5, f"Standardized RMSE {rmse_std:.4f} exceeds 0.5"

    def test_estimate_item_difficulties_centering(self):
        """After JMLE, estimated betas should be mean-centered."""
        rng = np.random.default_rng(456)
        true_betas = np.array([-1.5, -0.5, 0.5, 1.5])
        true_thetas = np.linspace(-2, 2, 100)

        matrix = _generate_response_matrix(true_thetas, true_betas, rng)
        est_betas, _ = estimate_item_difficulties(matrix)

        assert abs(np.mean(est_betas)) < 0.05, (
            f"Mean of estimated betas ({np.mean(est_betas):.4f}) is not near zero"
        )

    def test_estimate_item_difficulties_ordering(self):
        """Estimated betas should preserve the rank-order of true difficulties."""
        rng = np.random.default_rng(789)
        true_betas = np.array([-2.0, -1.0, 0.0, 1.0, 2.0])
        true_thetas = np.linspace(-3, 3, 300)

        matrix = _generate_response_matrix(true_thetas, true_betas, rng)
        est_betas, _ = estimate_item_difficulties(matrix)

        # Spearman rank correlation
        true_rank = np.argsort(np.argsort(true_betas))
        est_rank = np.argsort(np.argsort(est_betas))
        rank_corr = np.corrcoef(true_rank, est_rank)[0, 1]
        assert rank_corr > 0.9, f"Rank correlation {rank_corr:.4f} below 0.9"

    def test_estimate_item_difficulties_with_missing_data(self):
        """JMLE should handle NaN (missing responses) gracefully."""
        rng = np.random.default_rng(321)
        true_betas = np.array([-1.0, 0.0, 1.0])
        true_thetas = np.linspace(-2, 2, 100)

        matrix = _generate_response_matrix(true_thetas, true_betas, rng)

        # Introduce 10% missing data
        mask = rng.random(matrix.shape) < 0.10
        matrix[mask] = np.nan

        est_betas, est_thetas = estimate_item_difficulties(matrix)

        assert np.all(np.isfinite(est_betas)), "Betas contain non-finite values"
        assert np.all(np.isfinite(est_thetas)), "Thetas contain non-finite values"


# ---------------------------------------------------------------------------
# 4. compute_item_fit -- infit/outfit MNSQ
# ---------------------------------------------------------------------------

class TestComputeItemFit:

    def test_compute_item_fit_well_fitting(self):
        """Rasch-conforming data should produce infit/outfit near 1.0."""
        rng = np.random.default_rng(555)
        true_betas = np.array([-1.0, -0.3, 0.3, 1.0])
        true_thetas = np.linspace(-3, 3, 500)

        matrix = _generate_response_matrix(true_thetas, true_betas, rng)
        est_betas, est_thetas = estimate_item_difficulties(matrix)

        for j in range(len(true_betas)):
            fit = compute_item_fit(j, matrix, est_thetas, est_betas)
            assert 0.5 <= fit['infit'] <= 1.3, (
                f"Item {j} infit {fit['infit']:.3f} out of [0.5, 1.3]"
            )
            assert 0.5 <= fit['outfit'] <= 1.3, (
                f"Item {j} outfit {fit['outfit']:.3f} out of [0.5, 1.3]"
            )

    def test_compute_item_fit_misfitting(self):
        """A trick item (reverse pattern) should have elevated outfit."""
        rng = np.random.default_rng(666)
        true_betas = np.array([-1.0, 0.0, 1.0, 0.0])
        true_thetas = np.linspace(-3, 3, 300)

        matrix = _generate_response_matrix(true_thetas, true_betas, rng)

        # Reverse responses for item 3: high-ability wrong, low-ability right
        n = len(true_thetas)
        sorted_idx = np.argsort(true_thetas)
        bottom = sorted_idx[: int(0.3 * n)]
        matrix[bottom, 3] = 1
        top = sorted_idx[int(0.7 * n) :]
        matrix[top, 3] = 0

        est_betas, est_thetas = estimate_item_difficulties(matrix)
        fit_trick = compute_item_fit(3, matrix, est_thetas, est_betas)

        assert fit_trick['outfit'] > 1.3, (
            f"Trick item outfit {fit_trick['outfit']:.3f} should exceed 1.3"
        )

    def test_compute_item_fit_returns_dict_keys(self):
        """compute_item_fit should return a dict with 'infit' and 'outfit'."""
        rng = np.random.default_rng(777)
        matrix = _generate_response_matrix(
            np.array([0.0, 1.0]), np.array([0.0]), rng
        )
        thetas = np.array([0.0, 1.0])
        betas = np.array([0.0])

        result = compute_item_fit(0, matrix, thetas, betas)
        assert isinstance(result, dict)
        assert 'infit' in result
        assert 'outfit' in result

    def test_compute_item_fit_empty_column(self):
        """An all-NaN column should return default fit of 1.0."""
        matrix = np.full((5, 2), np.nan)
        matrix[:, 0] = [1, 0, 1, 0, 1]

        thetas = np.zeros(5)
        betas = np.array([0.0, 0.0])

        fit = compute_item_fit(1, matrix, thetas, betas)
        assert fit['infit'] == pytest.approx(1.0)
        assert fit['outfit'] == pytest.approx(1.0)


# ---------------------------------------------------------------------------
# 5. Large-scale recovery (realistic exam dimensions)
# ---------------------------------------------------------------------------

class TestLargeScaleRecovery:

    def test_large_scale_recovery(self):
        """500 students x 55 items -- mimics the real exam size."""
        rng = np.random.default_rng(2024)
        J = 55
        N = 500

        true_betas = rng.normal(0, 1.2, size=J)
        true_thetas = rng.normal(0, 1.0, size=N)

        true_betas_centered = true_betas - true_betas.mean()

        matrix = _generate_response_matrix(true_thetas, true_betas, rng)

        est_betas, est_thetas = estimate_item_difficulties(matrix)

        corr = np.corrcoef(true_betas_centered, est_betas)[0, 1]
        assert corr > 0.97, (
            f"Large-scale beta correlation {corr:.4f} below 0.97"
        )

        rmse = np.sqrt(np.mean((est_betas - true_betas_centered) ** 2))
        assert rmse < 0.2, f"Large-scale beta RMSE {rmse:.4f} exceeds 0.2"

    def test_large_scale_theta_recovery(self):
        """Theta estimates should also correlate with true values."""
        rng = np.random.default_rng(2025)
        J = 55
        N = 500

        true_betas = rng.normal(0, 1.2, size=J)
        true_thetas = rng.normal(0, 1.0, size=N)

        matrix = _generate_response_matrix(true_thetas, true_betas, rng)
        est_betas, est_thetas = estimate_item_difficulties(matrix)

        corr = np.corrcoef(true_thetas, est_thetas)[0, 1]
        assert corr > 0.90, (
            f"Large-scale theta correlation {corr:.4f} below 0.90"
        )
