"""Django Ninja API. Base path /api (mounted in config/urls.py).

The POST /sessions handler is the only integration seam: it wires the pure
analysis modules to the ORM. Keep it thin — load config, call pure functions,
persist fields.
"""

import logging

from ninja import File, Form, Router, UploadedFile
from ninja.errors import HttpError

from .models import Session, Topic, UserState
from .schemas import (
    LevelOut,
    ProgressOut,
    SessionCreateOut,
    SessionDetailOut,
    SessionListItemOut,
    TopicOut,
)
from .services import feedback as feedback_mod
from .services import levels as levels_mod
from .services import metrics as metrics_mod
from .services import scoring as scoring_mod
from .services import transcription, relevance
from .services.config_loader import load_fillers, load_scoring

log = logging.getLogger(__name__)
router = Router()

# Fields, newest-first, that levels.evaluate / progress_to_next consume.
_LEVEL_FIELDS = (
    "duration_sec", "overall_score", "wpm", "filler_per_min",
    "relevance_score", "pace_score", "filler_score", "pause_score",
)


# --- Topics -----------------------------------------------------------------
@router.get("/topics/random", response=TopicOut)
def random_topic(request, category: str = "general"):
    topic = Topic.objects.filter(category=category).order_by("?").first()
    if topic is None:
        raise HttpError(404, f"No topics found for category '{category}'.")
    return topic


# --- Sessions ---------------------------------------------------------------
@router.post("/sessions", response={201: SessionCreateOut})
def create_session(
    request,
    audio: UploadedFile = File(...),
    topic_id: int = Form(...),
    duration_sec: float = Form(...),
):
    """Capture a recording and run the full synchronous analysis pipeline:
    transcribe -> metrics -> relevance -> score -> feedback -> level update."""
    topic = Topic.objects.filter(id=topic_id).first()
    if topic is None:
        raise HttpError(404, f"Topic {topic_id} does not exist.")

    session = Session.objects.create(
        topic=topic,
        topic_text=topic.text,
        audio=audio,
        duration_sec=duration_sec,
    )

    _analyze(session)
    _update_progression(session)
    return 201, {"session_id": session.id}


def _analyze(session: Session) -> None:
    """Fill transcription, metrics, scores and feedback on a saved session."""
    cfg = load_scoring()
    fillers = load_fillers()

    try:
        trans = transcription.transcribe(session.audio.path)
    except Exception:  # decode failure etc. — degrade gracefully, never 500
        log.exception("Transcription failed for session %s", session.id)
        trans = {"transcript": "", "words": [], "word_count": 0}

    metrics = metrics_mod.compute_metrics(trans["words"], session.duration_sec, cfg, fillers)

    try:
        sim = relevance.similarity(trans["transcript"], session.topic_text)
    except Exception:
        log.exception("Relevance embedding failed for session %s", session.id)
        sim = 0.0

    scores = scoring_mod.score_all(metrics, sim, cfg)
    notes = feedback_mod.build_feedback(metrics, scores, cfg)

    session.transcript = trans["transcript"]
    session.word_count = trans["word_count"]
    session.words_json = trans["words"]
    session.wpm = metrics["wpm"]
    session.filler_count = metrics["filler_count"]
    session.filler_per_min = metrics["filler_per_min"]
    session.pause_count = metrics["pause_count"]
    session.long_pause_count = metrics["long_pause_count"]
    session.silence_ratio = metrics["silence_ratio"]
    session.relevance_similarity = sim
    session.pace_score = scores["pace"]
    session.filler_score = scores["filler"]
    session.pause_score = scores["pause"]
    session.relevance_score = scores["relevance"]
    session.overall_score = scores["overall"]
    session.feedback_json = notes
    session.save()


def _update_progression(session: Session) -> None:
    """Capture the baseline on the first session and advance the (monotonic) level."""
    cfg = load_scoring()
    state = UserState.load()

    if state.baseline_overall is None:
        state.baseline_overall = session.overall_score

    sessions = list(Session.objects.order_by("-created_at").values(*_LEVEL_FIELDS))
    candidate = levels_mod.evaluate(sessions, state.baseline_overall, cfg)
    state.current_level = max(state.current_level, candidate)
    state.save()


@router.get("/sessions/{session_id}", response=SessionDetailOut)
def get_session(request, session_id: int):
    session = Session.objects.filter(id=session_id).first()
    if session is None:
        raise HttpError(404, f"Session {session_id} does not exist.")

    cfg = load_scoring()
    return {
        "id": session.id,
        "created_at": session.created_at,
        "topic_text": session.topic_text,
        "duration_sec": session.duration_sec,
        "transcript": session.transcript,
        "metrics": {
            "wpm": session.wpm,
            "filler_count": session.filler_count,
            "filler_per_min": session.filler_per_min,
            "pause_count": session.pause_count,
            "long_pause_count": session.long_pause_count,
            "silence_ratio": session.silence_ratio,
            "relevance_similarity": session.relevance_similarity,
        },
        "scores": {
            "pace": session.pace_score,
            "filler": session.filler_score,
            "pause": session.pause_score,
            "relevance": session.relevance_score,
            "overall": session.overall_score,
        },
        "weights": cfg["weights"],
        "feedback": session.feedback_json,
        "words": session.words_json,
    }


@router.get("/sessions", response=list[SessionListItemOut])
def list_sessions(request, limit: int = 20, offset: int = 0):
    limit = max(1, min(limit, 100))
    offset = max(0, offset)
    qs = Session.objects.order_by("-created_at")[offset : offset + limit]
    return list(qs)


# --- Progress & level -------------------------------------------------------
@router.get("/progress", response=ProgressOut)
def progress(request):
    state = UserState.load()
    rows = Session.objects.order_by("created_at").values(
        "created_at", "overall_score", "pace_score", "filler_score",
        "pause_score", "relevance_score",
    )
    points = [
        {
            "created_at": r["created_at"],
            "overall": r["overall_score"],
            "pace": r["pace_score"],
            "filler": r["filler_score"],
            "pause": r["pause_score"],
            "relevance": r["relevance_score"],
        }
        for r in rows
    ]
    return {
        "sessions": points,
        "baseline_overall": state.baseline_overall,
        "session_count": len(points),
    }


@router.get("/level", response=LevelOut)
def level(request):
    cfg = load_scoring()
    state = UserState.load()
    sessions = list(Session.objects.order_by("-created_at").values(*_LEVEL_FIELDS))

    current = levels_mod.describe(state.current_level)
    prog = levels_mod.progress_to_next(sessions, state.baseline_overall, state.current_level, cfg)
    next_level = prog["next_level"]
    unlocked = [levels_mod.describe(lvl) for lvl in range(1, state.current_level + 1)]

    return {
        "current_level": state.current_level,
        "name": current["name"],
        "award": current["award"],
        "next_level": next_level,
        "next_name": levels_mod.describe(next_level)["name"] if next_level else None,
        "progress_fraction": prog["progress_fraction"],
        "progress_text": prog["progress_text"],
        "unlocked": unlocked,
    }
