"""Seven-level progression. PURE — no Django, no I/O.

`evaluate` takes plain session dicts (NEWEST FIRST) and returns the highest
level whose unlock condition holds. The caller applies monotonicity
(current_level = max(current, evaluate(...))) — levels never regress.

Session dict fields consumed:
  duration_sec, overall_score, wpm, filler_per_min, relevance_score,
  pace_score, filler_score, pause_score

Two pools of sessions. `sessions` holds the takes every level may use (in the
app: random-topic takes). The optional `delivery_sessions` holds a wider pool
(in the app: every take, own topics included) that only DELIVERY_LEVELS read.
This module never learns where a topic came from; the caller picks the pools.
"""

# level -> (name, award)
_LEVELS = {
    0: ("Getting Started", ""),
    1: ("The Novice", "First Voice"),
    2: ("The Apprentice", "Finding Your Voice"),
    3: ("The Speaker", "Steady Pace"),
    4: ("The Communicator", "Clear Voice"),
    5: ("The Persuader", "On Point"),
    6: ("The Orator", "Commanding Presence"),
    7: ("The Master Orator", "Master Orator"),
}
MAX_LEVEL = 7

# Levels whose rule reads only HOW you spoke: duration (1), pace (3) and
# fillers (4). None of them touch relevance or the overall score (which
# contains relevance), so they can't be gamed by choosing your own topic, and
# own-topic takes may count towards them. Levels 2, 5, 6 and 7 all depend on
# relevance, directly or through the overall score.
DELIVERY_LEVELS = frozenset({1, 3, 4})


def _pool_for(level: int, sessions: list[dict], delivery_sessions: list[dict] | None) -> list[dict]:
    """The sessions a level's rule is judged on."""
    if level in DELIVERY_LEVELS and delivery_sessions is not None:
        return delivery_sessions
    return sessions


# --- small null-safe helpers ------------------------------------------------
def _ge(v, t) -> bool:
    return v is not None and v >= t


def _lt(v, t) -> bool:
    return v is not None and v < t


def _in_band(v, lo, hi) -> bool:
    return v is not None and lo <= v <= hi


def _window(sessions: list[dict], n: int) -> list[dict]:
    """The n most recent sessions (sessions are newest-first)."""
    return sessions[:n]


# --- per-level conditions (sessions are NEWEST-FIRST) -----------------------
def _pace_in_range(s: dict, cfg: dict) -> bool:
    p = cfg["pace"]
    return _in_band(s.get("wpm"), p["target_min"], p["target_max"])


def _orator_qualifies(s: dict, cfg: dict) -> bool:
    o = cfg["levels"]["orator"]
    cmin = o["component_score_min"]
    return (
        _ge(s.get("overall_score"), o["overall_min"])
        and _ge(s.get("pace_score"), cmin)
        and _ge(s.get("filler_score"), cmin)
        and _ge(s.get("pause_score"), cmin)
        and _ge(s.get("relevance_score"), cmin)
    )


def _condition(level: int, sessions: list[dict], baseline: float | None, cfg: dict) -> bool:
    lv = cfg["levels"]
    window = lv["window"]
    recent = _window(sessions, window)
    latest = sessions[0] if sessions else None

    if level == 1:
        return any(_ge(s.get("duration_sec"), lv["min_session_sec"]) for s in sessions)

    if level == 2:
        return (
            len(sessions) >= lv["l2_min_sessions"]
            and baseline is not None
            and latest is not None
            and _ge(latest.get("overall_score"), baseline + lv["l2_improvement"])
        )

    if level == 3:
        return sum(_pace_in_range(s, cfg) for s in recent) >= lv["pace_in_range_needed"]

    if level == 4:
        return (
            sum(_lt(s.get("filler_per_min"), lv["filler_ok_threshold"]) for s in recent)
            >= lv["filler_ok_needed"]
        )

    if level == 5:
        return (
            sum(_ge(s.get("relevance_score"), lv["relevance_high_threshold"]) for s in recent)
            >= lv["relevance_high_needed"]
        )

    if level == 6:
        return sum(_orator_qualifies(s, cfg) for s in sessions) >= lv["orator"]["sessions_needed"]

    if level == 7:
        m = lv["master"]
        last = _window(sessions, m["of_last"])
        return sum(_ge(s.get("overall_score"), m["overall_min"]) for s in last) >= m["needed"]

    return False


def evaluate(
    sessions: list[dict],
    baseline: float | None,
    cfg: dict,
    delivery_sessions: list[dict] | None = None,
) -> int:
    """Return the HIGHEST level (1..7) whose condition holds, else 0.

    Lower conditions need not hold simultaneously. Monotonicity is the caller's
    responsibility. DELIVERY_LEVELS are judged on `delivery_sessions` when it
    is given; every other level on `sessions`.
    """
    met = [
        lvl
        for lvl in range(1, MAX_LEVEL + 1)
        if _condition(lvl, _pool_for(lvl, sessions, delivery_sessions), baseline, cfg)
    ]
    return max(met) if met else 0


def describe(level: int) -> dict:
    name, award = _LEVELS.get(level, _LEVELS[0])
    return {"level": level, "name": name, "award": award}


def _fraction(count: int, needed: int) -> float:
    return min(count, needed) / needed if needed else 1.0


def progress_to_next(
    sessions: list[dict],
    baseline: float | None,
    current_level: int,
    cfg: dict,
    delivery_sessions: list[dict] | None = None,
) -> dict:
    """Progress toward `current_level + 1`: a 0..1 fraction plus a human string.

    Judged on the same pool `evaluate` would use for that level."""
    lv = cfg["levels"]
    nxt = current_level + 1
    sessions = _pool_for(nxt, sessions, delivery_sessions)

    if current_level >= MAX_LEVEL:
        return {"next_level": None, "progress_fraction": 1.0,
                "progress_text": "Master Orator — you've reached the top rung."}

    recent = _window(sessions, lv["window"])

    if nxt == 1:
        best = max((s.get("duration_sec") or 0.0 for s in sessions), default=0.0)
        need = lv["min_session_sec"]
        return {"next_level": 1, "progress_fraction": _fraction(best, need),
                "progress_text": f"Record one {need:.0f}s+ take (best so far: {best:.0f}s)."}

    if nxt == 2:
        sessions_frac = _fraction(len(sessions), lv["l2_min_sessions"])
        latest = sessions[0].get("overall_score") if sessions else None
        if baseline is None or latest is None:
            improvement_frac = 0.0
        else:
            improvement_frac = max(0.0, min(1.0, (latest - baseline) / lv["l2_improvement"]))
        if sessions_frac <= improvement_frac:
            text = f"{min(len(sessions), lv['l2_min_sessions'])} of {lv['l2_min_sessions']} sessions recorded."
        else:
            text = f"Beat your baseline by {lv['l2_improvement']} points on your latest take."
        return {"next_level": 2, "progress_fraction": min(sessions_frac, improvement_frac),
                "progress_text": text}

    if nxt == 3:
        c, need = sum(_pace_in_range(s, cfg) for s in recent), lv["pace_in_range_needed"]
        return {"next_level": 3, "progress_fraction": _fraction(c, need),
                "progress_text": f"{c} of {need} recent sessions with pace in range."}

    if nxt == 4:
        c = sum(_lt(s.get("filler_per_min"), lv["filler_ok_threshold"]) for s in recent)
        need = lv["filler_ok_needed"]
        return {"next_level": 4, "progress_fraction": _fraction(c, need),
                "progress_text": f"{c} of {need} recent sessions with few fillers."}

    if nxt == 5:
        c = sum(_ge(s.get("relevance_score"), lv["relevance_high_threshold"]) for s in recent)
        need = lv["relevance_high_needed"]
        return {"next_level": 5, "progress_fraction": _fraction(c, need),
                "progress_text": f"{c} of {need} recent sessions strongly on topic."}

    if nxt == 6:
        c = sum(_orator_qualifies(s, cfg) for s in sessions)
        need = lv["orator"]["sessions_needed"]
        return {"next_level": 6, "progress_fraction": _fraction(c, need),
                "progress_text": f"{c} of {need} all-round strong sessions (80+ overall, every area 70+)."}

    # nxt == 7
    m = lv["master"]
    c = sum(_ge(s.get("overall_score"), m["overall_min"]) for s in _window(sessions, m["of_last"]))
    return {"next_level": 7, "progress_fraction": _fraction(c, m["needed"]),
            "progress_text": f"{c} of {m['needed']} recent sessions at {m['overall_min']:.0f}+."}
