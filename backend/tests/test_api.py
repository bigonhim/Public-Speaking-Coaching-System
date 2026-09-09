"""API tests via the Django test client.

Transcription and embedding are MOCKED — no ML models load, so these run fast
and deterministically. Verifies the POST pipeline persists correct fields and
that every endpoint returns the contracted shape.

Every coach endpoint requires a signed-in account, so the module-level `client`
fixture below shadows pytest-django's and arrives already authenticated. Tests
that care about the unauthenticated case ask for `anon_client` instead.
"""

import pytest
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client

from coach.models import Session, Topic, UserState
from coach.services import relevance, transcription

pytestmark = pytest.mark.django_db


@pytest.fixture
def user(db):
    return User.objects.create_user(
        username="ada@example.com",
        email="ada@example.com",
        first_name="Ada",
        password="orate-with-purpose-42",
    )


@pytest.fixture
def other_user(db):
    return User.objects.create_user(
        username="grace@example.com",
        email="grace@example.com",
        first_name="Grace",
        password="orate-with-purpose-42",
    )


@pytest.fixture
def anon_client(db):
    """A deliberately signed-out client.

    Built directly rather than from pytest-django's `client` fixture, which the
    module-level `client` below shadows with an authenticated one.
    """
    return Client()


@pytest.fixture
def client(client, user):  # noqa: A002 - intentionally shadows pytest-django's fixture
    client.force_login(user)
    return client


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


def test_create_session_runs_pipeline(client, user, topic, media_tmp, mock_analysis):
    resp = _post_session(client, topic)
    assert resp.status_code == 201
    session_id = resp.json()["session_id"]

    s = Session.objects.get(id=session_id)
    assert s.user == user
    assert s.transcript == "A good leader listens carefully always"
    assert s.word_count == 6
    assert s.wpm is not None and s.wpm > 0
    assert s.relevance_similarity == pytest.approx(0.42)
    assert s.overall_score is not None
    for field in ("pace_score", "filler_score", "pause_score", "relevance_score"):
        assert getattr(s, field) is not None
    assert isinstance(s.feedback_json, list) and s.feedback_json

    # Baseline captured on THIS account; level advanced monotonically from 0.
    state = UserState.for_user(user)
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
    # Audio is served by the guarded endpoint, never a raw /media path.
    assert body["audio_url"] == f"/api/sessions/{session_id}/audio"


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


# --- Authentication ---------------------------------------------------------
@pytest.mark.parametrize(
    "method,path",
    [
        ("get", "/api/topics/random"),
        ("get", "/api/sessions"),
        ("get", "/api/sessions/1"),
        ("get", "/api/sessions/1/audio"),
        ("get", "/api/progress"),
        ("get", "/api/level"),
        ("get", "/api/scoring"),
        ("delete", "/api/sessions/1"),
    ],
)
def test_endpoints_require_authentication(anon_client, db, method, path):
    assert getattr(anon_client, method)(path).status_code == 401


def test_create_session_requires_authentication(anon_client, topic, media_tmp):
    assert _post_session(anon_client, topic).status_code == 401


# --- Per-account isolation --------------------------------------------------
# The whole point of adding accounts: one speaker's recordings must be
# completely invisible to another's.
def test_sessions_are_not_visible_across_accounts(
    client, other_user, topic, media_tmp, mock_analysis
):
    mine = _post_session(client, topic).json()["session_id"]

    client.force_login(other_user)
    assert client.get("/api/sessions").json() == []
    assert client.get(f"/api/sessions/{mine}").status_code == 404
    assert client.get(f"/api/sessions/{mine}/audio").status_code == 404
    # 404, not 403 — a 403 would confirm the row exists.
    assert client.delete(f"/api/sessions/{mine}").status_code == 404
    assert Session.objects.filter(id=mine).exists()


def test_progress_and_level_are_per_account(
    client, other_user, topic, media_tmp, mock_analysis
):
    _post_session(client, topic)
    assert client.get("/api/progress").json()["session_count"] == 1
    assert client.get("/api/level").json()["current_level"] >= 1

    client.force_login(other_user)
    progress = client.get("/api/progress").json()
    assert progress["session_count"] == 0
    assert progress["baseline_overall"] is None
    assert client.get("/api/level").json()["current_level"] == 0


def test_audio_streams_to_its_owner(client, topic, media_tmp, mock_analysis):
    session_id = _post_session(client, topic).json()["session_id"]
    resp = client.get(f"/api/sessions/{session_id}/audio")
    assert resp.status_code == 200
    assert resp["Content-Type"] == "audio/webm"
    assert b"".join(resp.streaming_content) == b"\x00\x01\x02"


@pytest.mark.parametrize(
    "filename, expected",
    [
        ("take.webm", "audio/webm"),
        ("take.ogg", "audio/ogg"),
        ("take.mp4", "audio/mp4"),
        ("take.m4a", "audio/mp4"),
    ],
)
def test_audio_served_with_its_real_content_type(
    client, topic, media_tmp, mock_analysis, filename, expected
):
    """A take is streamed back as the container it was actually recorded in.

    Every recording used to be labelled audio/webm regardless of what the
    browser negotiated, and a player handed a type it cannot decode refuses the
    track outright rather than sniffing the bytes — so playback silently died
    for anyone whose browser chose ogg or mp4.
    """
    audio = SimpleUploadedFile(filename, b"\x00\x01\x02", content_type=expected)
    resp = client.post(
        "/api/sessions",
        {"audio": audio, "topic_id": topic.id, "duration_sec": 60.0},
    )
    assert resp.status_code == 201
    session_id = resp.json()["session_id"]

    streamed = client.get(f"/api/sessions/{session_id}/audio")
    assert streamed.status_code == 200
    assert streamed["Content-Type"] == expected


@pytest.mark.parametrize("duration", [0.0, -5.0, 60 * 60 * 2])
def test_create_session_rejects_impossible_duration(
    client, topic, media_tmp, mock_analysis, duration
):
    """duration_sec is client-reported and load-bearing.

    It is the denominator of silence_ratio and the gate on the level-1 unlock,
    so a zero, a negative or an absurd value must be refused rather than
    persisted and scored.
    """
    resp = _post_session(client, topic, duration=duration)
    assert resp.status_code == 400
    assert Session.objects.count() == 0
