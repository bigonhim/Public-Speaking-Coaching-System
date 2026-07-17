"""Unit tests for metrics.py — hand-computed synthetic fixtures.

Never tests against live Whisper output. Every expected value is derived by
hand from the definitions in IMPLEMENTATION_PLAN.md §4.6.
"""

import pytest

from coach.services.config_loader import load_fillers, load_scoring
from coach.services.metrics import compute_metrics

CFG = load_scoring()
FILLERS = load_fillers()


def _words(specs):
    """specs = [(word, start, end), ...] -> list of metric dicts."""
    return [{"word": w, "start": s, "end": e} for (w, s, e) in specs]


def test_wpm_contiguous_words():
    # 10 words, each 0.5s, no gaps: speaking_time = 5.0s -> wpm = 10 / (5/60) = 120
    words = _words([(f"w{i}", i * 0.5, i * 0.5 + 0.5) for i in range(10)])
    m = compute_metrics(words, duration_sec=6.0, cfg=CFG, fillers=FILLERS)
    assert m["word_count"] == 10
    assert m["speaking_time_sec"] == pytest.approx(5.0)
    assert m["wpm"] == pytest.approx(120.0)
    assert m["pause_count"] == 0
    assert m["long_pause_count"] == 0
    assert m["silence_ratio"] == pytest.approx(0.0)
    assert m["filler_count"] == 0
    assert m["filler_per_min"] == pytest.approx(0.0)


def test_pauses_and_silence_ratio():
    words = _words([
        ("one", 0.0, 1.0),
        ("two", 1.6, 2.0),   # gap 0.6 -> pause (not long)
        ("three", 5.2, 6.0), # gap 3.2 -> pause + long
        ("four", 6.0, 6.5),  # gap 0.0
    ])
    m = compute_metrics(words, duration_sec=8.0, cfg=CFG, fillers=FILLERS)
    assert m["pause_count"] == 2
    assert m["long_pause_count"] == 1
    # (0.6 + 3.2 + 0.0) / 8.0
    assert m["silence_ratio"] == pytest.approx(3.8 / 8.0)
    assert m["speaking_time_sec"] == pytest.approx(6.5)


def test_pause_threshold_is_inclusive():
    # a gap of exactly 0.5 counts as a pause; exactly 3.0 counts as long
    words = _words([("a", 0.0, 1.0), ("b", 1.5, 2.0), ("c", 5.0, 6.0)])
    m = compute_metrics(words, duration_sec=6.0, cfg=CFG, fillers=FILLERS)
    assert m["pause_count"] == 2      # 0.5 and 3.0 both >= 0.5
    assert m["long_pause_count"] == 1  # only 3.0 >= 3.0


def test_fillers_single_and_multiword():
    # tokens: so, um (single) + "you know" (multi) = 3
    specs = [("So", 0.0, 5.0), ("um", 8.0, 12.0), ("the", 15.0, 20.0),
             ("point", 22.0, 28.0), ("is", 30.0, 35.0), ("you", 40.0, 45.0),
             ("know", 46.0, 50.0), ("clear", 55.0, 60.0)]
    words = _words(specs)
    m = compute_metrics(words, duration_sec=60.0, cfg=CFG, fillers=FILLERS)
    assert m["filler_count"] == 3
    # speaking_time = 60 - 0 = 60s -> 1 min -> filler_per_min = 3.0
    assert m["filler_per_min"] == pytest.approx(3.0)


def test_filler_punctuation_and_case_stripped():
    words = _words([("Um,", 0.0, 0.5), ("hello.", 1.0, 1.5), ("SO", 2.0, 2.5)])
    m = compute_metrics(words, duration_sec=3.0, cfg=CFG, fillers=FILLERS)
    assert m["filler_count"] == 2  # "Um," -> um, "SO" -> so; "hello." not a filler


def test_negative_gap_clamped():
    # overlapping timestamps must not produce negative silence
    words = _words([("a", 0.0, 2.0), ("b", 1.5, 3.0)])
    m = compute_metrics(words, duration_sec=3.0, cfg=CFG, fillers=FILLERS)
    assert m["silence_ratio"] == pytest.approx(0.0)
    assert m["pause_count"] == 0


def test_empty_words_returns_zeros():
    m = compute_metrics([], duration_sec=10.0, cfg=CFG, fillers=FILLERS)
    assert m == {
        "word_count": 0, "speaking_time_sec": 0.0, "wpm": 0.0,
        "filler_count": 0, "filler_per_min": 0.0,
        "pause_count": 0, "long_pause_count": 0, "silence_ratio": 0.0,
    }


def test_single_word_no_divide_by_zero():
    m = compute_metrics(_words([("hi", 0.0, 0.0)]), duration_sec=5.0, cfg=CFG, fillers=FILLERS)
    assert m["word_count"] == 1
    assert m["wpm"] == 0.0            # speaking_time == 0 -> guarded
    assert m["filler_per_min"] == 0.0
