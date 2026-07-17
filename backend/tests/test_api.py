"""API tests via the Django test client.

Transcription and embedding are MOCKED — no ML models load, so these run fast
and deterministically. Verifies the POST pipeline persists correct fields and
that every endpoint returns the contracted shape.
"""

import json

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from coach.models import Session, Topic, UserState
from coach.services import relevance, transcription

pytestmark = pytest.mark.django_db


@pytest.fixture
def topic(db):
    return Topic.objects.create(text="What makes a good leader?", category="general")


@pytest.fixture
def media_tmp(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path / "media"
    return settings.MEDIA_ROOT


@pytest.fixture
def mock_analysis(monkeypatch):
    """Deterministic transcription + similarity, no models loaded."""
    words = [
        {"word": "A", "start": 0.0, "end": 0.4},
        {"word": "good", "start": 0.5, "end": 0.9},
        {"word": "leader", "start": 1.0, "end": 1.5},
        {"word": "listens", "start": 2.0, "end": 2.6},
        {"word": "carefully", "start": 2.7, "end": 3.4},
        {"word": "always", "start": 3.5, "end": 4.0},
    ]
    monkeypatch.setattr(
        transcription, "transcribe",
        lambda path: {"transcript": "A good leader listens carefully always",
                      "words": words, "word_count": len(words)},
    )
    monkeypatch.setattr(relevance, "similarity", lambda transcript, topic_text: 0.42)


def _post_session(client, topic, duration=60.0):
    audio = SimpleUploadedFile("take.webm", b"\x00\x01\x02", content_type="audio/webm")
    return client.post(
        "/api/sessions",
        {"audio": audio, "topic_id": topic.id, "duration_sec": duration},
    )


def test_random_topic(client, topic):
    resp = client.get("/api/topics/random?category=general")
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == topic.id
    assert body["text"] == topic.text
    assert body["category"] == "general"


def test_random_topic_missing_category_404(client, db):
    resp = client.get("/api/topics/random?category=interview")
    assert resp.status_code == 404


def test_create_session_runs_pipeline(client, topic, media_tmp, mock_analysis):
    resp = _post_session(client, topic)
    assert resp.status_code == 201
    session_id = resp.json()["session_id"]

    s = Session.objects.get(id=session_id)
    assert s.transcript == "A good leader listens carefully always"
    assert s.word_count == 6
    assert s.wpm is not None and s.wpm > 0
    assert s.relevance_similarity == pytest.approx(0.42)
    assert s.overall_score is not None
    for field in ("pace_score", "filler_score", "pause_score", "relevance_score"):
        assert getattr(s, field) is not None
    assert isinstance(s.feedback_json, list) and s.feedback_json

    # Baseline captured; level advanced monotonically from 0.
    state = UserState.objects.get(pk=1)
    assert state.baseline_overall == pytest.approx(s.overall_score)
    assert state.current_level >= 1  # 60s take unlocks at least L1


def test_get_session_detail_shape(client, topic, media_tmp, mock_analysis):
    session_id = _post_session(client, topic).json()["session_id"]
    resp = client.get(f"/api/sessions/{session_id}")
    assert resp.status_code == 200
    body = resp.json()
    assert set(body) >= {"id", "created_at", "topic_text", "duration_sec",
                         "transcript", "metrics", "scores", "weights",
                         "feedback", "words"}
    assert set(body["weights"]) == {"pace", "filler", "pause", "relevance"}
    assert body["weights"]["relevance"] == pytest.approx(0.35)
    assert len(body["words"]) == 6


def test_get_missing_session_404(client, db):
    assert client.get("/api/sessions/999").status_code == 404


def test_list_sessions(client, topic, media_tmp, mock_analysis):
    _post_session(client, topic)
    _post_session(client, topic)
    resp = client.get("/api/sessions?limit=20&offset=0")
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == 2
    assert set(items[0]) == {"id", "created_at", "topic_text", "overall_score"}


def test_progress_endpoint(client, topic, media_tmp, mock_analysis):
    _post_session(client, topic)
    resp = client.get("/api/progress")
    assert resp.status_code == 200
    body = resp.json()
    assert body["session_count"] == 1
    assert body["baseline_overall"] is not None
    assert len(body["sessions"]) == 1
    assert set(body["sessions"][0]) == {"created_at", "overall", "pace",
                                        "filler", "pause", "relevance"}


def test_level_endpoint(client, topic, media_tmp, mock_analysis):
    _post_session(client, topic)
    resp = client.get("/api/level")
    assert resp.status_code == 200
    body = resp.json()
    assert set(body) >= {"current_level", "name", "award", "next_level",
                        "next_name", "progress_fraction", "progress_text", "unlocked"}
    assert body["current_level"] >= 1
    assert isinstance(body["unlocked"], list)
    assert 0.0 <= body["progress_fraction"] <= 1.0


def test_level_empty_state(client, db):
    resp = client.get("/api/level")
    assert resp.status_code == 200
    body = resp.json()
    assert body["current_level"] == 0
    assert body["unlocked"] == []
