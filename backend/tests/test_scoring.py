"""Unit tests for scoring.py — boundaries and clamping.

Expected values are hand-computed from IMPLEMENTATION_PLAN.md §4.
"""

import pytest

from coach.services.config_loader import load_scoring
from coach.services.scoring import (
    score_all,
    score_filler,
    score_pace,
    score_pause,
    score_relevance,
)

CFG = load_scoring()


# --- Pace -------------------------------------------------------------------
@pytest.mark.parametrize("wpm,expected", [
    (120, 100.0), (150, 100.0), (135, 100.0),
    (168, 73.0),   # 100 - 1.5*18
    (100, 70.0),   # 100 - 1.5*20
    (60, 10.0),    # 100 - 1.5*60
    (20, 0.0),     # clamped
])
def test_score_pace(wpm, expected):
    assert score_pace(wpm, CFG) == pytest.approx(expected)


# --- Filler -----------------------------------------------------------------
@pytest.mark.parametrize("fpm,expected", [
    (1.0, 100.0), (0.5, 100.0),
    (8.0, 0.0), (10.0, 0.0),
    (3.0, 100.0 * (5.0 / 7.0)),
])
def test_score_filler(fpm, expected):
    assert score_filler(fpm, CFG) == pytest.approx(expected)


# --- Pause ------------------------------------------------------------------
@pytest.mark.parametrize("pause_count,long,ratio,expected", [
    (4, 0, 0.20, 100.0),
    (5, 2, 0.35, 70.0),    # 100 - 2*15; ratio==ceiling -> no silence penalty
    (3, 0, 0.45, 90.0),    # 100 - (0.45-0.35)*100
    (0, 0, 0.10, 90.0),    # 100 - no_pause_penalty
    (0, 3, 0.50, 30.0),    # 100 - 45 - 15 - 10
])
def test_score_pause(pause_count, long, ratio, expected):
    assert score_pause(pause_count, long, ratio, CFG) == pytest.approx(expected)


# --- Relevance --------------------------------------------------------------
@pytest.mark.parametrize("sim,expected", [
    (0.15, 0.0), (0.10, 0.0),
    (0.55, 100.0), (0.60, 100.0),
    (0.35, 50.0),
])
def test_score_relevance(sim, expected):
    assert score_relevance(sim, CFG) == pytest.approx(expected)


# --- Clamping (never <0 or >100) --------------------------------------------
@pytest.mark.parametrize("wpm", [0, 20, 300, 1000])
def test_pace_clamped(wpm):
    assert 0.0 <= score_pace(wpm, CFG) <= 100.0


def test_pause_clamped_floor():
    assert score_pause(0, 10, 0.9, CFG) == 0.0  # would be deeply negative


# --- Overall ----------------------------------------------------------------
def test_score_all_perfect():
    metrics = {"wpm": 135, "filler_per_min": 0.5, "pause_count": 4,
               "long_pause_count": 0, "silence_ratio": 0.10}
    result = score_all(metrics, similarity=0.60, cfg=CFG)
    assert result == {"pace": 100.0, "filler": 100.0, "pause": 100.0,
                      "relevance": 100.0, "overall": 100.0}


def test_score_all_mixed_overall():
    # pace(168)=73, filler(3.0)=71.4286, pause(0.45,pauses=1)=90, relevance(0.35)=50
    metrics = {"wpm": 168, "filler_per_min": 3.0, "pause_count": 1,
               "long_pause_count": 0, "silence_ratio": 0.45}
    result = score_all(metrics, similarity=0.35, cfg=CFG)
    assert result["pace"] == pytest.approx(73.0)
    assert result["filler"] == pytest.approx(71.4)
    assert result["pause"] == pytest.approx(90.0)
    assert result["relevance"] == pytest.approx(50.0)
    # 0.25*73 + 0.25*71.42857 + 0.15*90 + 0.35*50 = 67.107 -> 67.1
    assert result["overall"] == pytest.approx(67.1)
