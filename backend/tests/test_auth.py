"""Account endpoint tests: /api/auth/{csrf,register,login,logout,me}.

Django's test client sets `_dont_enforce_csrf_checks`, so CSRF is waived unless
a test explicitly builds `Client(enforce_csrf_checks=True)` — which the CSRF
tests below do, because "login is CSRF-protected" is exactly the kind of claim
that is worth proving rather than assuming.
"""

import pytest
from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import Client

from coach.auth_api import FAILURE_LIMIT
from coach.models import UserState

pytestmark = pytest.mark.django_db

GOOD_PASSWORD = "orate-with-purpose-42"


@pytest.fixture(autouse=True)
def clear_throttle():
    """The login throttle lives in a process-wide cache; isolate the tests."""
    cache.clear()
    yield
    cache.clear()


def _register(client, **overrides):
    payload = {
        "name": "Ada Lovelace",
        "email": "ada@example.com",
        "password": GOOD_PASSWORD,
    } | overrides
    return client.post("/api/auth/register", payload, content_type="application/json")


def _login(client, **overrides):
    payload = {"email": "ada@example.com", "password": GOOD_PASSWORD} | overrides
    return client.post("/api/auth/login", payload, content_type="application/json")


# --- Registration -----------------------------------------------------------
def test_register_creates_account_and_signs_in(client):
    resp = _register(client)
    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "Ada Lovelace"
    assert body["email"] == "ada@example.com"
    assert body["initials"] == "AL"
    assert body["session_count"] == 0
    assert body["is_new"] is True

    user = User.objects.get(username="ada@example.com")
    assert user.check_password(GOOD_PASSWORD)
    assert UserState.objects.filter(user=user).exists()
    # The response cookie is a live session: a follow-up call is authenticated.
    assert client.get("/api/auth/me").status_code == 200


def test_register_normalizes_email_case_and_whitespace(client):
    assert _register(client, email="  Ada@Example.COM  ").status_code == 201
    assert User.objects.filter(username="ada@example.com").exists()


def test_register_rejects_duplicate_email_case_insensitively(client):
    assert _register(client).status_code == 201
    client.logout()
    resp = _register(Client(), email="ADA@example.com")
    assert resp.status_code == 409
    assert User.objects.filter(email__iexact="ada@example.com").count() == 1


@pytest.mark.parametrize(
    "field,value",
    [
        ("email", "not-an-email"),
        ("email", ""),
        ("name", "   "),
        ("password", "short"),          # under MinimumLengthValidator's 8
        ("password", "password"),       # CommonPasswordValidator
        ("password", "858585858585"),   # NumericPasswordValidator
    ],
)
def test_register_rejects_bad_input(client, field, value):
    resp = _register(client, **{field: value})
    assert resp.status_code == 400
    assert resp.json()["detail"]  # a human-readable reason, not an empty body
    assert not User.objects.exists()


def test_register_rejects_password_resembling_the_email(client):
    resp = _register(client, email="lovelace@example.com", password="lovelace@example")
    assert resp.status_code == 400
    assert not User.objects.exists()


# --- Login ------------------------------------------------------------------
def test_login_succeeds_and_is_case_insensitive(client):
    _register(client)
    client.logout()
    resp = _login(client, email="ADA@Example.com")
    assert resp.status_code == 200
    assert resp.json()["email"] == "ada@example.com"
    assert client.get("/api/auth/me").status_code == 200


def test_login_rejects_wrong_password(client):
    _register(client)
    client.logout()
    resp = _login(client, password="not-the-right-passphrase")
    assert resp.status_code == 401
    assert client.get("/api/auth/me").status_code == 401


def test_login_error_does_not_reveal_whether_the_account_exists(client):
    _register(client)
    client.logout()
    unknown = _login(Client(), email="nobody@example.com")
    wrong_password = _login(Client(), password="not-the-right-passphrase")
    assert unknown.status_code == wrong_password.status_code == 401
    assert unknown.json()["detail"] == wrong_password.json()["detail"]


def test_login_throttles_repeated_failures(client):
    _register(client)
    client.logout()
    for _ in range(FAILURE_LIMIT):
        assert _login(client, password="wrong-passphrase-here").status_code == 401
    # Locked out now — and the *correct* password is refused too, so the lock
    # cannot be probed away by guessing until something works.
    assert _login(client, password="wrong-passphrase-here").status_code == 429
    assert _login(client).status_code == 429


def test_successful_login_clears_the_failure_counter(client):
    _register(client)
    client.logout()
    for _ in range(FAILURE_LIMIT - 1):
        _login(client, password="wrong-passphrase-here")
    assert _login(client).status_code == 200

    client.logout()
    for _ in range(FAILURE_LIMIT - 1):
        assert _login(client, password="wrong-passphrase-here").status_code == 401


def test_login_rejects_deactivated_account(client):
    _register(client)
    client.logout()
    User.objects.filter(username="ada@example.com").update(is_active=False)
    assert _login(client).status_code in (401, 403)


# --- Session lifecycle ------------------------------------------------------
def test_me_requires_authentication(client):
    assert client.get("/api/auth/me").status_code == 401


def test_me_reports_session_count(client, django_user_model):
    _register(client)
    assert client.get("/api/auth/me").json()["session_count"] == 0


def test_logout_ends_the_session(client):
    _register(client)
    assert client.post("/api/auth/logout").status_code == 200
    assert client.get("/api/auth/me").status_code == 401


def test_logout_requires_authentication(client):
    assert client.post("/api/auth/logout").status_code == 401


# --- CSRF -------------------------------------------------------------------
def test_csrf_endpoint_sets_the_cookie():
    csrf_client = Client(enforce_csrf_checks=True)
    resp = csrf_client.get("/api/auth/csrf")
    assert resp.status_code == 200
    assert "csrftoken" in resp.cookies


@pytest.mark.parametrize(
    "path,payload",
    [
        (
            "/api/auth/register",
            {"name": "Ada", "email": "ada@example.com", "password": GOOD_PASSWORD},
        ),
        ("/api/auth/login", {"email": "ada@example.com", "password": GOOD_PASSWORD}),
    ],
)
def test_public_auth_endpoints_reject_missing_csrf_token(path, payload):
    """Login CSRF is not pedantry: without it an attacker can silently sign a
    victim into the attacker's account and harvest their practice.

    The payloads are deliberately *valid* — ninja validates the body before the
    handler runs, so an invalid one would 422 and never prove anything.
    """
    csrf_client = Client(enforce_csrf_checks=True)
    resp = csrf_client.post(path, payload, content_type="application/json")
    assert resp.status_code == 403
    assert not User.objects.exists()


def test_register_succeeds_with_a_csrf_token():
    csrf_client = Client(enforce_csrf_checks=True)
    csrf_client.get("/api/auth/csrf")
    token = csrf_client.cookies["csrftoken"].value
    resp = csrf_client.post(
        "/api/auth/register",
        {"name": "Ada", "email": "ada@example.com", "password": GOOD_PASSWORD},
        content_type="application/json",
        headers={"x-csrftoken": token},
    )
    assert resp.status_code == 201
