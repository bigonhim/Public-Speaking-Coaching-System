"""Django Ninja API. Base path /api (mounted in config/urls.py).

Every operation here requires a signed-in account (the NinjaAPI is constructed
with `auth=django_auth`) and reads/writes only that account's rows. There is no
"all sessions" query in this module on purpose: practice recordings are voice
data, and one missing `.filter(user=...)` would leak them across accounts.

The POST /sessions handler is the only integration seam: it wires the pure
analysis modules to the ORM. Keep it thin — load config, call pure functions,
persist fields.
"""

import logging
import math
import mimetypes
import os

from django.http import FileResponse
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
    ScoringConfigOut,
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

# `duration_sec` is client-reported: it is the denominator of silence_ratio and
# the gate on the level-1 unlock, so it is not something to take on trust.
MAX_DURATION_SEC = 60 * 60  # an hour is already absurd for a practice take

# Containers MediaRecorder can produce. Anything else is served as a download
# rather than guessed at.
_AUDIO_TYPES = {
    ".webm": "audio/webm",
    ".ogg": "audio/ogg",
    ".oga": "audio/ogg",
    ".mp4": "audio/mp4",
    ".m4a": "audio/mp4",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
}


def _sessions_of(request):
    """This account's sessions — the only entry point to the Session table."""
    return Session.objects.filter(user=request.user)


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

    if not math.isfinite(duration_sec) or duration_sec <= 0:
        raise HttpError(400, "Recording duration must be a positive number of seconds.")
    if duration_sec > MAX_DURATION_SEC:
        raise HttpError(400, "That recording is too long to analyse.")

    session = Session.objects.create(
        user=request.user,
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
    """Capture the baseline on the account's first session and advance its
    (monotonic) level. Scoped to session.user so one speaker's history never
    moves another's level."""
    cfg = load_scoring()
    state = UserState.for_user(session.user)

    if state.baseline_overall is None:
        state.baseline_overall = session.overall_score

    sessions = list(
        Session.objects.filter(user=session.user)
        .order_by("-created_at")
        .values(*_LEVEL_FIELDS)
    )
    candidate = levels_mod.evaluate(sessions, state.baseline_overall, cfg)
    state.current_level = max(state.current_level, candidate)
    state.save()


@router.get("/sessions/{session_id}", response=SessionDetailOut)
def get_session(request, session_id: int):
    # 404 rather than 403 for someone else's id — a 403 would confirm the row
    # exists, which is itself a leak.
    session = _sessions_of(request).filter(id=session_id).first()
    if session is None:
        raise HttpError(404, f"Session {session_id} does not exist.")

    cfg = load_scoring()
    # Point at our own guarded streamer, never at MEDIA_URL: /media is a plain
    # static mount with no notion of who owns a file.
    audio_url = f"/api/sessions/{session.id}/audio" if session.audio else None
    return {
        "id": session.id,
        "created_at": session.created_at,
        "topic_text": session.topic_text,
        "duration_sec": session.duration_sec,
        "transcript": session.transcript,
        "audio_url": audio_url,
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


def _audio_content_type(name: str) -> str:
    """Content type for a stored take, from its extension.

    Hardcoding audio/webm here mislabelled every recording made by a browser
    that negotiated ogg or mp4 instead — and a player handed the wrong type
    refuses the track rather than sniffing it, so playback just silently died.
    """
    ext = os.path.splitext(name or "")[1].lower()
    if ext in _AUDIO_TYPES:
        return _AUDIO_TYPES[ext]
    guessed, _ = mimetypes.guess_type(name or "")
    return guessed or "application/octet-stream"


@router.get("/sessions/{session_id}/audio")
def get_session_audio(request, session_id: int):
    """Stream a take's audio, but only to the account that recorded it.

    A recording of your own voice is about as personal as this app's data gets,
    so it never travels over the unauthenticated /media mount.
    """
    session = _sessions_of(request).filter(id=session_id).first()
    if session is None or not session.audio:
        raise HttpError(404, f"No audio for session {session_id}.")
    try:
        handle = session.audio.open("rb")
    except FileNotFoundError:  # row survived, file did not (e.g. cleared data/)
        raise HttpError(404, f"No audio for session {session_id}.")
    return FileResponse(handle, content_type=_audio_content_type(session.audio.name))


@router.get("/sessions", response=list[SessionListItemOut])
def list_sessions(request, limit: int = 20, offset: int = 0):
    limit = max(1, min(limit, 100))
    offset = max(0, offset)
    qs = _sessions_of(request).order_by("-created_at")[offset : offset + limit]
    return list(qs)


@router.delete("/sessions/{session_id}")
def delete_session(request, session_id: int):
    session = _sessions_of(request).filter(id=session_id).first()
    if session is None:
        raise HttpError(404, f"Session {session_id} does not exist.")
    session.delete()
    return {"ok": True}


# --- Scoring config --------------------------------------------------------
@router.get("/scoring", response=ScoringConfigOut)
def get_scoring_config(request):
    cfg = load_scoring()
    fillers = load_fillers()
    return {
        "weights": cfg["weights"],
        "min_session_sec": cfg.get("min_session_sec", 45),
        # What the results replay needs to mark a take the same way the scorer
        # measured it, without the frontend keeping its own copy of the lists.
        "pace_target_min": cfg["pace"]["target_min"],
        "pace_target_max": cfg["pace"]["target_max"],
        "pause_min_sec": cfg["metrics"]["pause_min_sec"],
        "long_pause_sec": cfg["metrics"]["long_pause_sec"],
        "fillers": {
            "single": fillers.get("single", []),
            "multi": fillers.get("multi", []),
        },
    }


# --- Progress & level -------------------------------------------------------
@router.get("/progress", response=ProgressOut)
def progress(request):
    state = UserState.for_user(request.user)
    rows = _sessions_of(request).order_by("created_at").values(
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
    state = UserState.for_user(request.user)
    sessions = list(_sessions_of(request).order_by("-created_at").values(*_LEVEL_FIELDS))

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
