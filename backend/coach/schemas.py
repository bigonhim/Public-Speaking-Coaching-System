"""Django Ninja response schemas.

Field names match the API contract in HANDOFF.md §7 exactly, so the
auto-generated docs at /api/docs are an accurate specification.
"""

from datetime import datetime

from ninja import Schema


# --- Auth -------------------------------------------------------------------
class RegisterIn(Schema):
    name: str
    email: str
    password: str


class LoginIn(Schema):
    email: str
    password: str
    remember: bool = True


class UserOut(Schema):
    id: int
    name: str
    email: str
    initials: str
    joined_at: datetime
    session_count: int
    #: True until the account has analysed its first take — the client uses this
    #: to tailor the welcome cinematic's closing card.
    is_new: bool


class OkOut(Schema):
    ok: bool


class TopicOut(Schema):
    id: int
    text: str
    category: str


class SessionCreateOut(Schema):
    session_id: int


class MetricsOut(Schema):
    wpm: float | None
    filler_count: int | None
    filler_per_min: float | None
    pause_count: int | None
    long_pause_count: int | None
    silence_ratio: float | None
    relevance_similarity: float | None


class ScoresOut(Schema):
    pace: float | None
    filler: float | None
    pause: float | None
    relevance: float | None
    overall: float | None


class WeightsOut(Schema):
    pace: float
    filler: float
    pause: float
    relevance: float


class WordOut(Schema):
    word: str
    start: float
    end: float


class SessionDetailOut(Schema):
    id: int
    created_at: datetime
    topic_text: str
    topic_source: str  # "random" | "custom"
    duration_sec: float
    transcript: str
    audio_url: str | None
    metrics: MetricsOut
    scores: ScoresOut
    weights: WeightsOut
    feedback: list[str]
    words: list[WordOut]


class SessionListItemOut(Schema):
    id: int
    created_at: datetime
    topic_text: str
    topic_source: str
    overall_score: float | None


class ProgressPointOut(Schema):
    created_at: datetime
    overall: float | None
    pace: float | None
    filler: float | None
    pause: float | None
    relevance: float | None
    topic_source: str


class ProgressOut(Schema):
    sessions: list[ProgressPointOut]
    baseline_overall: float | None
    session_count: int


class LevelBadgeOut(Schema):
    level: int
    name: str
    award: str


class LevelOut(Schema):
    current_level: int
    name: str
    award: str
    next_level: int | None
    next_name: str | None
    progress_fraction: float
    progress_text: str
    unlocked: list[LevelBadgeOut]


class FillersOut(Schema):
    single: list[str]
    multi: list[list[str]]


class ScoringConfigOut(Schema):
    weights: dict
    min_session_sec: int
    max_session_sec: int
    custom_topic_min_chars: int
    custom_topic_max_chars: int
    pace_target_min: float
    pace_target_max: float
    pause_min_sec: float
    long_pause_sec: float
    fillers: FillersOut
