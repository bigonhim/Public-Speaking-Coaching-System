"""Delivery metrics from word timestamps. PURE — no Django, no I/O.

Input:  words = [{"word": str, "start": float, "end": float}, ...]
        duration_sec = full length of the audio (client-reported)
        cfg = parsed scoring.yaml
        fillers = parsed fillers.yaml
Output: a flat dict of raw measurements (see compute_metrics).

Definitions (resolved in IMPLEMENTATION_PLAN.md §1):
  * speaking_time_sec = last word end - first word start (leading/trailing
    silence trimmed). Guarded against 0/1-word inputs.
  * gaps are between CONSECUTIVE words only; negative gaps (timestamp overlap)
    clamp to 0. Leading/trailing silence is not a pause.
  * silence_ratio = sum(inter-word gaps) / full duration_sec.
"""

import string

_PUNCT = string.punctuation + "…—–“”‘’"


def _normalize(token: str) -> str:
    """Lowercase and strip surrounding punctuation/whitespace."""
    return token.strip().strip(_PUNCT).lower()


def _count_fillers(tokens: list[str], fillers: dict) -> int:
    """Count single- and multi-word fillers over a normalized token list.

    The single and multi lists are disjoint by design, so no token is counted
    twice.
    """
    singles = {_normalize(w) for w in fillers.get("single", [])}
    multis = [tuple(_normalize(w) for w in phrase) for phrase in fillers.get("multi", [])]

    count = sum(1 for t in tokens if t in singles)

    for phrase in multis:
        n = len(phrase)
        if n == 0:
            continue
        for i in range(len(tokens) - n + 1):
            if tuple(tokens[i : i + n]) == phrase:
                count += 1
    return count


def compute_metrics(words: list[dict], duration_sec: float, cfg: dict, fillers: dict) -> dict:
    """Return raw delivery metrics for one attempt."""
    m_cfg = cfg["metrics"]
    pause_min = m_cfg["pause_min_sec"]
    long_pause = m_cfg["long_pause_sec"]

    word_count = len(words)

    if word_count == 0:
        return {
            "word_count": 0,
            "speaking_time_sec": 0.0,
            "wpm": 0.0,
            "filler_count": 0,
            "filler_per_min": 0.0,
            "pause_count": 0,
            "long_pause_count": 0,
            "silence_ratio": 0.0,
        }

    speaking_time_sec = max(0.0, words[-1]["end"] - words[0]["start"])
    speaking_minutes = speaking_time_sec / 60.0
    wpm = word_count / speaking_minutes if speaking_minutes > 1e-9 else 0.0

    # Inter-word gaps (clamped to non-negative).
    gaps = [max(0.0, words[i + 1]["start"] - words[i]["end"]) for i in range(word_count - 1)]
    pause_count = sum(1 for g in gaps if g >= pause_min)
    long_pause_count = sum(1 for g in gaps if g >= long_pause)
    # Clamped to [0, 1]: duration_sec is client-reported, and a take whose
    # audio runs longer than the browser claimed would otherwise report more
    # silence than there was time — which drives the pause score to zero on a
    # bad clock rather than on a bad delivery. Inter-word gaps can never really
    # exceed the recording's own length.
    silence_ratio = min(1.0, sum(gaps) / duration_sec) if duration_sec > 0 else 0.0

    tokens = [_normalize(w["word"]) for w in words]
    filler_count = _count_fillers(tokens, fillers)
    filler_per_min = filler_count / speaking_minutes if speaking_minutes > 1e-9 else 0.0

    return {
        "word_count": word_count,
        "speaking_time_sec": speaking_time_sec,
        "wpm": wpm,
        "filler_count": filler_count,
        "filler_per_min": filler_per_min,
        "pause_count": pause_count,
        "long_pause_count": long_pause_count,
        "silence_ratio": silence_ratio,
    }
