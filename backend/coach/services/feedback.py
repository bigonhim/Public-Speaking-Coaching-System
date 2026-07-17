"""Rule-driven feedback. PURE — no Django, no I/O, no ML.

Produces up to `feedback.max_notes` short, specific, encouraging strings, each
derived transparently from a metric and prioritised by the largest component
score deficit (100 - score). Never generic: every note names a real number.
"""


def build_feedback(metrics: dict, scores: dict, cfg: dict) -> list[str]:
    fb = cfg["feedback"]
    max_notes = fb["max_notes"]

    # No audible speech — say so plainly instead of scoring silence.
    if metrics["word_count"] == 0:
        return ["We couldn't hear clear speech. Check your mic and try again in a quiet spot."]

    wpm = metrics["wpm"]
    fpm = metrics["filler_per_min"]
    long_pauses = metrics["long_pause_count"]

    # (deficit, message) — larger deficit = higher priority.
    notes: list[tuple[float, str]] = []

    if wpm > fb["fast_wpm"]:
        notes.append((
            100.0 - scores["pace"],
            f"You spoke quite fast ({wpm:.0f} wpm). Aim for 120–150 — try pausing at full stops.",
        ))
    elif 0 < wpm < fb["slow_wpm"]:
        notes.append((
            100.0 - scores["pace"],
            f"Your pace was a little slow ({wpm:.0f} wpm). A touch more energy keeps the room with you.",
        ))

    if fpm > fb["filler_per_min_warn"]:
        notes.append((
            100.0 - scores["filler"],
            f"You used fillers about {fpm:.0f}× a minute. A short silent pause is stronger than an 'um'.",
        ))

    if long_pauses > fb["long_pause_warn"]:
        notes.append((
            100.0 - scores["pause"],
            f"You had {long_pauses} pauses over 3 seconds. Brief pauses are good; long ones lose the room.",
        ))

    if scores["relevance"] < fb["relevance_score_warn"]:
        notes.append((
            100.0 - scores["relevance"],
            "Your speech drifted from the topic. Name its key terms early and keep returning to them.",
        ))

    if not notes:
        return [_praise(metrics, scores)]

    notes.sort(key=lambda n: n[0], reverse=True)
    return [msg for _, msg in notes[:max_notes]]


def _praise(metrics: dict, scores: dict) -> str:
    """Specific praise for a strong take — names the strongest component."""
    best = max(("pace", "filler", "pause", "relevance"), key=lambda k: scores[k])
    wpm = metrics["wpm"]
    if best == "pace":
        return f"Great pace ({wpm:.0f} wpm) and controlled delivery — that's a confident take."
    if best == "relevance":
        return "You stayed tightly on topic throughout — clear, focused and persuasive."
    if best == "filler":
        return f"Very few fillers and a steady {wpm:.0f} wpm — your delivery sounded polished."
    return f"Well-placed pauses and a steady {wpm:.0f} wpm — poised and easy to follow."
