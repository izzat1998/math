# Rasch Model Validation & Calibration Pipeline

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Validate the Rasch (1PL IRT) implementation with a comprehensive Jupyter notebook that proves parameter recovery, fit statistics, and scoring accuracy using synthetic data — preparing for production deployment with 1000+ participants.

**Architecture:** Create a Jupyter notebook that imports the project's actual `rasch.py` module, generates synthetic response data with known parameters, runs calibration, and produces statistical evidence (ICC plots, fit stats, parameter recovery correlations, sample size analysis). Also add unit tests for the Rasch math functions.

**Tech Stack:** Python, NumPy, SciPy, Matplotlib, Jupyter, Django (for future integration)

---

## Task 1: Unit Tests for Rasch Math Functions

**Files:**
- Create: `backend/tests/test_rasch.py`

**Purpose:** Validate each function in `rasch.py` individually before running full simulations.

**Tests to write:**
1. `test_rasch_probability_known_values` — P(θ=0, β=0) = 0.5, P(θ=2, β=0) ≈ 0.88
2. `test_rasch_probability_symmetry` — P(θ, β) + P(β, θ-mirrored) properties
3. `test_estimate_theta_perfect_score` — all correct → θ > max(β)
4. `test_estimate_theta_zero_score` — all wrong → θ < min(β)
5. `test_estimate_theta_known_ability` — synthetic responses from known θ, recovered θ close
6. `test_estimate_item_difficulties_recovery` — JMLE recovers known betas within tolerance
7. `test_compute_item_fit_well_fitting` — infit/outfit ≈ 1.0 for Rasch-conforming data

---

## Task 2: Jupyter Notebook — Synthetic Data & Parameter Recovery

**Files:**
- Create: `notebooks/rasch_validation.ipynb`

**Sections:**

### Cell 1: Setup & Imports
Import rasch.py from the project, configure matplotlib.

### Cell 2: Synthetic Data Generator
Function to generate binary response matrix from known θ and β arrays using `rasch_probability`.

### Cell 3: Parameter Recovery — Small Scale (20 students × 10 items)
Generate data, run JMLE, scatter plot estimated vs true betas. Compute correlation.

### Cell 4: Parameter Recovery — Medium Scale (100 students × 55 items)
Same but matching the actual exam structure. Show convergence.

### Cell 5: Parameter Recovery — Large Scale (1000 students × 55 items)
Demonstrate accuracy at the target production scale.

---

## Task 3: Jupyter Notebook — ICC Curves & Fit Statistics

**Sections continuing the notebook:**

### Cell 6: Item Characteristic Curves
Plot ICC for 6-8 representative items (easy, medium, hard). Show probability vs ability.

### Cell 7: Fit Statistics Analysis
Compute infit/outfit for all items. Create table + flagging rule (0.7–1.3 acceptable range). Bar chart of fit values.

### Cell 8: Person Fit
Estimate theta for each synthetic student, plot estimated vs true theta. Compute RMSE and correlation.

---

## Task 4: Jupyter Notebook — Sample Size Analysis & Conclusions

**Sections continuing the notebook:**

### Cell 9: Sample Size Sensitivity
Run calibration at N=30, 50, 100, 200, 500, 1000. Plot RMSE of beta estimates vs sample size. Show the "elbow" where accuracy stabilizes.

### Cell 10: Realistic Exam Simulation
Simulate a realistic math exam: β ~ N(0, 1.2) for varying difficulty. 500 students with θ ~ N(0, 1). Full analysis.

### Cell 11: Summary & Conclusions
Print key metrics: correlation, RMSE, fit stats. State whether the model is validated for production use.

---

## Execution Order

Tasks 1-4 are mostly independent (unit tests vs notebook cells), but the notebook is sequential.

**Parallel execution strategy:**
- Agent A: Task 1 (unit tests for rasch.py)
- Agent B: Tasks 2-4 (full Jupyter notebook)
