from math import exp

# ---------------------------------------------------------------------------
# DEFAULT BKT PARAMETERS
# ---------------------------------------------------------------------------
# p_init    : probability the student already knows the concept before any attempts
# p_transit : probability of learning the concept after a single attempt (if not yet mastered)
# p_slip    : probability of answering WRONG even if the student KNOWS the concept
# p_guess   : probability of answering RIGHT even if the student does NOT know the concept

DEFAULT_PARAMS = {
    "p_init": 0.3,
    "p_transit": 0.1,
    "p_slip": 0.1,
    "p_guess": 0.2,
}


def update_mastery(prior_p_mastery: float, correct: bool, params: dict = None) -> float:
    """
    Run one full BKT update cycle. Two steps:

    STEP 1 — BAYES UPDATE (evidence from this answer)
    We have a prior belief: P(knows) = prior_p_mastery.
    We observed an answer (correct or incorrect). We update using Bayes' theorem.

    If the answer was CORRECT:
        P(knows | correct) = P(correct | knows) * P(knows)
                             ------------------------------------
                             P(correct)

        P(correct | knows)     = 1 - p_slip   (knows it but might slip)
        P(correct | not knows) = p_guess       (doesn't know but might guess)
        P(correct)             = P(correct|knows)*P(knows) + P(correct|not knows)*P(not knows)

    If the answer was INCORRECT:
        P(knows | wrong) = P(wrong | knows) * P(knows)
                           ------------------------------------
                           P(wrong)

        P(wrong | knows)     = p_slip
        P(wrong | not knows) = 1 - p_guess
        P(wrong)             = P(wrong|knows)*P(knows) + P(wrong|not knows)*P(not knows)

    STEP 2 — TRANSITION (chance of learning from this attempt)
    Even after updating for this answer, the student might have JUST learned
    the concept during this attempt. We apply p_transit:

        posterior = P(knows | evidence) from Step 1
        final = posterior + (1 - posterior) * p_transit

    This means: "already knew it" + "didn't know it but just learned it".
    Result is always in [0, 1] and monotonically increases with p_transit > 0.
    """
    if params is None:
        params = DEFAULT_PARAMS

    p_slip = params["p_slip"]
    p_guess = params["p_guess"]
    p_transit = params["p_transit"]

    # ---- Step 1: Bayes update ----
    if correct:
        numerator = (1 - p_slip) * prior_p_mastery
        denominator = (1 - p_slip) * prior_p_mastery + p_guess * (1 - prior_p_mastery)
    else:
        numerator = p_slip * prior_p_mastery
        denominator = p_slip * prior_p_mastery + (1 - p_guess) * (1 - prior_p_mastery)

    # Guard against division by zero (shouldn't happen with valid params)
    if denominator == 0:
        posterior = prior_p_mastery
    else:
        posterior = numerator / denominator

    # ---- Step 2: Transition (learning) ----
    final = posterior + (1 - posterior) * p_transit

    # Clamp to [0, 1] as a safety net
    return max(0.0, min(1.0, final))


def apply_decay(p_mastery: float, days_since_update: float, decay_rate: float = 0.05) -> float:
    """
    Forgetting curve: mastery decays exponentially if the concept hasn't
    been practiced recently. Floor at 0.05 so it never drops to zero.
    """
    effective = p_mastery * exp(-decay_rate * days_since_update)
    return max(0.05, effective)