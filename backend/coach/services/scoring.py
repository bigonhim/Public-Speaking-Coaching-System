"""Transparent, rule-based scoring. PURE — no Django, no I/O, no ML.

Each component maps a raw metric to 0..100 via an explainable rule (see
IMPLEMENTATION_PLAN.md §4). `overall` is the weighted sum. Every number here
is traceable to scoring.yaml — which is the whole point of the project.
"""


def _clamp(x: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, x))


def score_pace(wpm: float, cfg: dict) -> float:
    """Full marks inside [target_min, target_max]; linear falloff outside."""
    p = cfg["pace"]
    lo, hi, falloff = p["target_min"], p["target_max"], p["falloff_per_wpm"]
    if lo <= wpm <= hi:
        return 100.0
    distance = (lo - wpm) if wpm < lo else (wpm - hi)
    return _clamp(100.0 - falloff * distance)


def score_filler(filler_per_min: float, cfg: dict) -> float:
    """100 at/below ideal, 0 at/above ceiling, linear between."""
    f = cfg["filler"]
    ideal, zero = f["ideal_max_per_min"], f["zero_score_per_min"]
    if filler_per_min <= ideal:
        return 100.0
    if filler_per_min >= zero:
        return 0.0
    return _clamp(100.0 * (zero - filler_per_min) / (zero - ideal))


def score_pause(pause_count: int, long_pause_count: int, silence_ratio: float, cfg: dict) -> float:
    """Start at 100 and subtract penalties for long pauses, excess silence,
    and a total absence of pauses (a wall of speech)."""
    p = cfg["pause"]
    score = 100.0
    score -= p["long_pause_penalty"] * long_pause_count
    if silence_ratio > p["silence_ratio_ceiling"]:
        score -= (silence_ratio - p["silence_ratio_ceiling"]) * p["silence_penalty_per_point"]
    if pause_count == 0:
        score -= p["no_pause_penalty"]
    return _clamp(score)


def score_relevance(similarity: float, cfg: dict) -> float:
    """Linear map of raw cosine similarity from [sim_floor, sim_ceiling] to 0..100."""
    r = cfg["relevance"]
    floor, ceiling = r["sim_floor"], r["sim_ceiling"]
    if similarity <= floor:
        return 0.0
    if similarity >= ceiling:
        return 100.0
    return _clamp(100.0 * (similarity - floor) / (ceiling - floor))


def score_all(metrics: dict, similarity: float, cfg: dict) -> dict:
    """Compute the four component scores and the weighted overall.

    All values rounded to 1dp at the boundary; internal math is full precision.
    """
    w = cfg["weights"]
    pace = score_pace(metrics["wpm"], cfg)
    filler = score_filler(metrics["filler_per_min"], cfg)
    pause = score_pause(
        metrics["pause_count"], metrics["long_pause_count"], metrics["silence_ratio"], cfg
    )
    relevance = score_relevance(similarity, cfg)

    overall = (
        w["pace"] * pace
        + w["filler"] * filler
        + w["pause"] * pause
        + w["relevance"] * relevance
    )

    return {
        "pace": round(pace, 1),
        "filler": round(filler, 1),
        "pause": round(pause, 1),
        "relevance": round(relevance, 1),
        "overall": round(overall, 1),
    }
