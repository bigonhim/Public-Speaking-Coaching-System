"""Own-topic takes: the speaker types the prompt instead of drawing one.

They are analysed and scored exactly like random takes, but they never move
levels or set the baseline, because the speaker wrote the very text relevance
(35% of the score) is measured against. Transcription and embedding are
mocked, as in test_api.py.
"""

import pytest
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile

from coach.api import CUSTOM_TOPIC_MAX_CHARS, CUSTOM_TOPIC_MIN_CHARS
from coach.models import Session, Topic, UserState
from coach.services import relevance, transcription

pytestmark = pytest.mark.django_db

PASSWORD = "orate-with-purpose-42"


@pytest.fixture
def user(db):
    return User.objects.create_user(
        username="ada@example.com", email="ada@example.com", password=PASSWORD
    )


@pytest.fixture
def client(client, user):  # noqa: A002 - shadows pytest-django's fixture
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
def seen_topics(monkeypatch):
    """Mock the models, recording which topic text relevance was scored against."""
    words = [
        {"word": w, "start": i * 0.5, "end": i * 0.5 + 0.4}
        for i, w in enumerate("chess teaches patience and planning ahead".split())
    ]
    monkeypatch.setattr(
        transcription, "transcribe",
        lambda path: {"transcript": "chess teaches patience and planning ahead",
                      "words": words, "word_count": len(words)},
    )
    seen = []

    def fake_similarity(transcript, topic_text):
        seen.append(topic_text)
        return 0.5

    monkeypatch.setattr(relevance, "similarity", fake_similarity)
    return seen


def _post(client, duration=60.0, **fields):
    audio = SimpleUploadedFile("take.webm", b"\x00\x01\x02", content_type="audio/webm")
    return client.post("/api/sessions", {"audio": audio, "duration_sec": duration, **fields})


def test_own_topic_is_analysed_against_the_speakers_text(client, user, media_tmp, seen_topics):
    resp = _post(client, topic_text="  Why chess   makes you patient ")
    assert resp.status_code == 201

    s = Session.objects.get(id=resp.json()["session_id"])
    assert s.user == user
    assert s.topic is None
    assert s.topic_source == Session.SOURCE_CUSTOM
    # Trimmed and whitespace-collapsed, and that exact text is what relevance saw.
    assert s.topic_text == "Why chess makes you patient"
    assert seen_topics == ["Why chess makes you patient"]
    assert s.overall_score is not None and s.relevance_score is not None
    assert s.feedback_json

    detail = client.get(f"/api/sessions/{s.id}").json()
    assert detail["topic_source"] == "custom"
    assert detail["topic_text"] == "Why chess makes you patient"


def test_random_topic_take_is_marked_random(client, topic, media_tmp, seen_topics):
    resp = _post(client, topic_id=topic.id)
    assert resp.status_code == 201
    s = Session.objects.get(id=resp.json()["session_id"])
    assert s.topic_source == Session.SOURCE_RANDOM
    assert s.topic == topic
    assert seen_topics == [topic.text]


def test_both_topic_id_and_text_is_rejected(client, topic, media_tmp, seen_topics):
    resp = _post(client, topic_id=topic.id, topic_text="Why chess makes you patient")
    assert resp.status_code == 400
    assert Session.objects.count() == 0


@pytest.mark.parametrize("fields", [{}, {"topic_text": ""}, {"topic_text": "     "}])
def test_no_topic_at_all_is_rejected(client, media_tmp, seen_topics, fields):
    resp = _post(client, **fields)
    assert resp.status_code == 400
    assert Session.objects.count() == 0


@pytest.mark.parametrize(
    "text",
    ["x" * (CUSTOM_TOPIC_MIN_CHARS - 1), "x" * (CUSTOM_TOPIC_MAX_CHARS + 1)],
    ids=["too-short", "too-long"],
)
def test_own_topic_length_is_bounded(client, media_tmp, seen_topics, text):
    resp = _post(client, topic_text=text)
    assert resp.status_code == 400
    assert Session.objects.count() == 0


@pytest.mark.parametrize(
    "text", ["x" * CUSTOM_TOPIC_MIN_CHARS, "x" * CUSTOM_TOPIC_MAX_CHARS], ids=["min", "max"]
)
def test_own_topic_length_bounds_are_inclusive(client, media_tmp, seen_topics, text):
    assert _post(client, topic_text=text).status_code == 201


def test_own_topic_take_unlocks_level_one_but_never_sets_the_baseline(
    client, user, topic, media_tmp, seen_topics
):
    # Level 1 is a delivery level (one 45s+ take), so an own topic counts.
    _post(client, topic_text="Why chess makes you patient")
    state = UserState.for_user(user)
    assert state.current_level == 1
    # The baseline contains relevance, so only a random take may set it.
    assert state.baseline_overall is None

    random_id = _post(client, topic_id=topic.id).json()["session_id"]
    state.refresh_from_db()
    assert state.baseline_overall == pytest.approx(
        Session.objects.get(id=random_id).overall_score
    )


def test_own_topics_reach_the_delivery_levels_and_stop_there(
    client, user, media_tmp, seen_topics
):
    """The mocked take is excellent: pace in band, no fillers, relevance 87.5,
    overall ~94. On own topics that must stop at Level 4 (the highest delivery
    level), because Levels 5-7 depend on relevance."""
    for _ in range(4):
        _post(client, topic_text="Why chess makes you patient")
    assert UserState.for_user(user).current_level == 4

    level = client.get("/api/level").json()
    assert level["current_level"] == 4
    # Progress towards 5 counts random takes only, and there are none.
    assert level["next_level"] == 5
    assert level["progress_fraction"] == 0.0


def test_the_same_takes_on_random_topics_climb_to_the_top(
    client, user, topic, media_tmp, seen_topics
):
    """Control for the test above: identical takes, random topics, Level 7."""
    for _ in range(4):
        _post(client, topic_id=topic.id)
    assert UserState.for_user(user).current_level == 7


def test_own_topics_help_with_pace_alongside_random_takes(
    client, user, topic, media_tmp, seen_topics
):
    # Level 3 needs 3 of the last 5 takes in the pace band. One random take
    # plus two own-topic takes gets there; random takes alone could not yet.
    _post(client, topic_id=topic.id)
    _post(client, topic_text="Why chess makes you patient")
    _post(client, topic_text="My favourite holiday")
    assert UserState.for_user(user).current_level >= 3


def test_own_topic_takes_still_appear_in_history_and_progress(
    client, topic, media_tmp, seen_topics
):
    _post(client, topic_id=topic.id)
    _post(client, topic_text="Why chess makes you patient")

    items = client.get("/api/sessions").json()
    assert sorted(i["topic_source"] for i in items) == ["custom", "random"]

    progress = client.get("/api/progress").json()
    assert progress["session_count"] == 2
    assert [p["topic_source"] for p in progress["sessions"]] == ["random", "custom"]


def test_scoring_config_publishes_the_topic_limits(client, db):
    body = client.get("/api/scoring").json()
    assert body["custom_topic_min_chars"] == CUSTOM_TOPIC_MIN_CHARS
    assert body["custom_topic_max_chars"] == CUSTOM_TOPIC_MAX_CHARS


def test_another_account_cannot_read_an_own_topic_take(client, media_tmp, seen_topics):
    session_id = _post(client, topic_text="My private topic").json()["session_id"]

    other = User.objects.create_user(
        username="grace@example.com", email="grace@example.com", password=PASSWORD
    )
    client.force_login(other)
    assert client.get(f"/api/sessions/{session_id}").status_code == 404
    assert client.get("/api/sessions").json() == []
