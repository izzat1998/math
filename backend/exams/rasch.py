"""
Rasch psychometric engine.

Pure math module for Item Response Theory (IRT) 1-parameter logistic model.
Calibrates item difficulties from a response matrix and estimates student abilities.
"""

import math
import numpy as np


def rasch_probability(theta, beta):
    """P(correct | theta, beta) = exp(theta - beta) / (1 + exp(theta - beta))"""
    x = theta - beta
    x = max(-30, min(30, x))
    return math.exp(x) / (1 + math.exp(x))


def estimate_theta(responses, betas, max_iter=50, tol=0.001):
    """Estimate ability theta via Newton-Raphson MLE for a single student.

    Args:
        responses: binary array (1=correct, 0=incorrect) matching betas
        betas: array of item difficulties

    Returns:
        float: estimated theta
    """
    responses = np.asarray(responses, dtype=float)
    betas = np.asarray(betas, dtype=float)

    total = responses.sum()
    if total == 0:
        return float(betas.min() - 2.0)
    if total == len(responses):
        return float(betas.max() + 2.0)

    p = np.clip(total / len(responses), 0.01, 0.99)
    theta = math.log(p / (1 - p))

    for _ in range(max_iter):
        probs = np.array([rasch_probability(theta, b) for b in betas])
        d1 = float(np.sum(responses - probs))
        d2 = float(-np.sum(probs * (1 - probs)))

        if abs(d2) < 1e-10:
            break

        delta = d1 / d2
        theta -= delta
        theta = max(-5.0, min(5.0, theta))

        if abs(delta) < tol:
            break

    return float(theta)


def estimate_item_difficulties(matrix, max_iter=100, tol=0.01):
    """Joint Maximum Likelihood Estimation (JMLE) for item difficulties.

    Args:
        matrix: NxJ binary numpy array (students x items), NaN for missing

    Returns:
        tuple: (betas, thetas) — calibrated item difficulties and student abilities
    """
    matrix = np.asarray(matrix, dtype=float)
    N, J = matrix.shape

    valid = ~np.isnan(matrix)
    matrix_filled = np.where(valid, matrix, 0)

    prop_correct = np.nansum(matrix_filled, axis=0) / np.maximum(valid.sum(axis=0), 1)
    prop_correct = np.clip(prop_correct, 0.01, 0.99)
    betas = -np.log(prop_correct / (1 - prop_correct))

    student_prop = np.nansum(matrix_filled, axis=1) / np.maximum(valid.sum(axis=1), 1)
    student_prop = np.clip(student_prop, 0.01, 0.99)
    thetas = np.log(student_prop / (1 - student_prop))

    for iteration in range(max_iter):
        for n in range(N):
            mask = valid[n]
            if mask.sum() == 0:
                continue
            thetas[n] = estimate_theta(matrix_filled[n, mask], betas[mask])

        old_betas = betas.copy()
        for j in range(J):
            mask = valid[:, j]
            if mask.sum() == 0:
                continue
            betas[j] = _estimate_single_beta(
                matrix_filled[mask, j], thetas[mask]
            )

        betas -= betas.mean()

        max_change = np.max(np.abs(betas - old_betas))
        if max_change < tol:
            break

    return betas, thetas


def _estimate_single_beta(responses, thetas, max_iter=30, tol=0.001):
    """Newton-Raphson MLE for a single item's difficulty given thetas."""
    responses = np.asarray(responses, dtype=float)
    thetas = np.asarray(thetas, dtype=float)

    total_correct = responses.sum()
    n = len(responses)

    if total_correct == 0:
        return float(thetas.max() + 2.0)
    if total_correct == n:
        return float(thetas.min() - 2.0)

    p = np.clip(total_correct / n, 0.01, 0.99)
    beta = -math.log(p / (1 - p))

    for _ in range(max_iter):
        probs = np.array([rasch_probability(t, beta) for t in thetas])
        d1 = float(np.sum(probs - responses))
        d2 = float(-np.sum(probs * (1 - probs)))

        if abs(d2) < 1e-10:
            break

        delta = d1 / d2
        beta -= delta
        beta = max(-5.0, min(5.0, beta))

        if abs(delta) < tol:
            break

    return float(beta)


def compute_item_fit(item_idx, matrix, thetas, betas):
    """Compute infit and outfit mean-square statistics for an item.

    Returns:
        dict with 'infit' and 'outfit' MNSQ values
    """
    matrix = np.asarray(matrix, dtype=float)
    thetas = np.asarray(thetas, dtype=float)
    beta = float(betas[item_idx])

    valid = ~np.isnan(matrix[:, item_idx])
    responses = matrix[valid, item_idx]
    student_thetas = thetas[valid]

    n = len(responses)
    if n == 0:
        return {'infit': 1.0, 'outfit': 1.0}

    probs = np.array([rasch_probability(t, beta) for t in student_thetas])
    variances = probs * (1 - probs)

    residuals = responses - probs
    sq_residuals = residuals ** 2

    with np.errstate(divide='ignore', invalid='ignore'):
        outfit_terms = np.where(variances > 1e-10, sq_residuals / variances, 0)
    outfit = float(np.mean(outfit_terms)) if n > 0 else 1.0

    sum_var = float(np.sum(variances))
    infit = float(np.sum(sq_residuals) / sum_var) if sum_var > 1e-10 else 1.0

    return {'infit': infit, 'outfit': outfit}
