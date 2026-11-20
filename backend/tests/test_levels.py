"""Unit tests for levels.py — unlock rules, monotonicity, progress.

Sessions are passed NEWEST FIRST. A "null" session meets nothing; each test
flips only the fields that should unlock its target level, so `evaluate`'s
"highest met" behaviour is exercised in isolation.
"""

import pytest

from coach.services.config_loader import load_scoring
from coach.services import levels

CFG = load_scoring()


def sess(**overrides) -> dict:
    """A session that satisfies no level; override to unlock specific rules."""
    base = {
        "duration_sec": 30.0, "overall_score": 40.0, "wpm": 175.0,
        "filler_per_min": 5.0, "relevance_score": 40.0,
        "pace_score": 40.0, "filler_score": 40.0, "pause_score": 40.0,
    }
    base.update(overrides)
    return base


def test_no_sessions_is_level_zero():
    assert levels.evaluate([], None, CFG) == 0


def test_level1_requires_a_take_of_the_minimum_length():
    need = CFG["levels"]["min_session_sec"]
    assert levels.evaluate([sess(duration_sec=need)], None, CFG) == 1
    assert levels.evaluate([sess(duration_sec=need - 1)], None, CFG) == 0


def test_level1_bar_is_not_below_the_graded_minimum():
    """Every scored take must be able to reach level 1; a level-1 bar below the
    graded minimum would be meaningless, one above it is a deliberate choice."""
    assert CFG["levels"]["min_session_sec"] >= CFG["session"]["min_graded_sec"]


def test_level2_needs_three_sessions_and_improvement():
    baseline = 40.0
    newest_first = [sess(overall_score=46.0), sess(), sess()]  # latest >= 40 + 5
    assert levels.evaluate(newest_first, baseline, CFG) == 2
    # Only two sessions -> not yet
    assert levels.evaluate([sess(overall_score=46.0), sess()], baseline, CFG) in (0, 1)
    # Improvement too small
    assert levels.evaluate([sess(overall_score=44.0), sess(), sess()], baseline, CFG) in (0, 1)


def test_level3_pace_in_range_three_of_last_five():
    good = sess(wpm=135.0)  # in [120, 150]
    assert levels.evaluate([good, good, good, sess(), sess()], None, CFG) == 3
    assert levels.evaluate([good, good, sess(), sess(), sess()], None, CFG) == 0


def test_level4_low_fillers_three_of_last_five():
    good = sess(filler_per_min=1.0)
    assert levels.evaluate([good, good, good, sess(), sess()], None, CFG) == 4


def test_level5_high_relevance_three_of_last_five():
    good = sess(relevance_score=85.0)
    assert levels.evaluate([good, good, good, sess(), sess()], None, CFG) == 5


def test_level6_all_round_strength_two_sessions():
    strong = sess(overall_score=82.0, pace_score=90.0, filler_score=85.0,
                  pause_score=75.0, relevance_score=88.0)
    assert levels.evaluate([strong, strong], None, CFG) == 6
    # Drop one component below 70 -> only one qualifies -> not L6
    weak = sess(overall_score=82.0, pace_score=90.0, filler_score=85.0,
                pause_score=65.0, relevance_score=88.0, duration_sec=60.0)
    assert levels.evaluate([strong, weak], None, CFG) < 6


def test_level7_master_four_of_last_five():
    great = sess(overall_score=88.0)
    assert levels.evaluate([great, great, great, great, sess()], None, CFG) == 7
    assert levels.evaluate([great, great, great, sess(), sess()], None, CFG) != 7


def test_monotonic_never_regresses():
    # Caller pattern: current stays even if a fresh evaluation is lower.
    current = 5
    weak_history = [sess(overall_score=46.0), sess(), sess()]  # evaluates to 2
    candidate = levels.evaluate(weak_history, 40.0, CFG)
    assert candidate <= 2
    assert max(current, candidate) == 5


def test_progress_to_next_level3():
    two_in_range = [sess(wpm=135.0), sess(wpm=135.0), sess(), sess()]
    prog = levels.progress_to_next(two_in_range, None, current_level=2, cfg=CFG)
    assert prog["next_level"] == 3
    assert prog["progress_fraction"] == pytest.approx(2 / 3)
    assert "of 3" in prog["progress_text"]


def test_progress_capped_at_master():
    prog = levels.progress_to_next([], None, current_level=7, cfg=CFG)
    assert prog["next_level"] is None
    assert prog["progress_fraction"] == 1.0


def test_describe_names_and_awards():
    assert levels.describe(1) == {"level": 1, "name": "The Novice", "award": "First Voice"}
    assert levels.describe(7)["name"] == "The Master Orator"
    assert levels.describe(0)["level"] == 0


# --- two pools: delivery levels may use a wider set of sessions ---------------
def test_delivery_levels_are_exactly_duration_pace_and_fillers():
    # These three rules read no relevance and no overall score. If a rule is
    # ever added here, it must not depend on either.
    assert levels.DELIVERY_LEVELS == {1, 3, 4}


def test_delivery_pool_unlocks_delivery_levels():
    strong = sess(duration_sec=60.0, wpm=135.0, filler_per_min=1.0)
    # Nothing in the main pool, three strong takes in the delivery pool.
    assert levels.evaluate([], None, CFG, delivery_sessions=[strong] * 3) == 4


def test_delivery_pool_never_reaches_relevance_levels():
    # Perfect on every count, including relevance and overall: in the main
    # pool this is Level 7. In the delivery pool alone it must stop at 4.
    perfect = sess(
        duration_sec=60.0, wpm=135.0, filler_per_min=0.5, overall_score=95.0,
        relevance_score=95.0, pace_score=100.0, filler_score=100.0, pause_score=100.0,
    )
    assert levels.evaluate([perfect] * 5, 40.0, CFG) == 7
    assert levels.evaluate([], 40.0, CFG, delivery_sessions=[perfect] * 5) == 4


def test_without_a_delivery_pool_behaviour_is_unchanged():
    good = sess(wpm=135.0)
    pool = [good, good, good, sess(), sess()]
    assert levels.evaluate(pool, None, CFG) == levels.evaluate(pool, None, CFG, delivery_sessions=None)


def test_progress_uses_the_delivery_pool_for_delivery_levels():
    pace_ok = sess(wpm=135.0)
    prog = levels.progress_to_next([], None, 2, CFG, delivery_sessions=[pace_ok, pace_ok])
    assert prog["next_level"] == 3
    assert prog["progress_fraction"] == pytest.approx(2 / 3)
    # ...but not for relevance levels.
    high_rel = sess(relevance_score=95.0)
    prog = levels.progress_to_next([], None, 4, CFG, delivery_sessions=[high_rel] * 3)
    assert prog["next_level"] == 5
    assert prog["progress_fraction"] == 0.0
