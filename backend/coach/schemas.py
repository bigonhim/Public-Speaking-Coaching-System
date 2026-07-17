"""Django Ninja response schemas.

Field names match the API contract in HANDOFF.md §7 exactly, so the
auto-generated docs at /api/docs are an accurate specification.
"""

from datetime import datetime

from ninja import Schema


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
    duration_sec: float
    transcript: str
    metrics: MetricsOut
    scores: ScoresOut
    weights: WeightsOut
    feedback: list[str]
    words: list[WordOut]


class SessionListItemOut(Schema):
    id: int
    created_at: datetime
    topic_text: str
    overall_score: float | None


class ProgressPointOut(Schema):
    created_at: datetime
    overall: float | None
    pace: float | None
    filler: float | None
    pause: float | None
    relevance: float | None


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
