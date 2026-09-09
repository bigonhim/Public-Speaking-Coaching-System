"""Account endpoints, mounted at /api/auth.

Session-cookie auth (no tokens in localStorage): Django issues an HttpOnly
session cookie and the SPA sends it automatically. Unsafe requests carry the
double-submit CSRF token in X-CSRFToken.

django-ninja marks its views csrf_exempt and delegates the check to the auth
class, so `django_auth` covers every authenticated endpoint — but the three
public ones here (csrf/register/login) have no auth class and must check
explicitly. Skipping that on /login is a real hole: it lets an attacker force a
victim's browser into the *attacker's* account and quietly record their practice.
"""

import logging

from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import IntegrityError, transaction
from django.middleware.csrf import get_token
from ninja import Router
from ninja.errors import HttpError
from ninja.security import django_auth
from ninja.utils import check_csrf

from .models import Session, UserState
from .schemas import LoginIn, OkOut, RegisterIn, UserOut

log = logging.getLogger(__name__)

# The API sets auth=django_auth globally, so each public operation below opts
# out with an explicit `auth=None`. Router(auth=None) would NOT be enough:
# ninja applies the API default first and a router-level None never clears it.
router = Router()

MODEL_BACKEND = "django.contrib.auth.backends.ModelBackend"

# `username` is a CharField(max_length=150) and we store the email in it.
EMAIL_MAX_LEN = 150
NAME_MAX_LEN = 80

# Login throttle: brute-force protection, deliberately generous so a person
# fat-fingering their password a few times is never locked out.
FAILURE_LIMIT = 8
FAILURE_WINDOW_SEC = 15 * 60


# --- helpers ----------------------------------------------------------------
def _require_csrf(request) -> None:
    """Enforce CSRF on an endpoint that has no auth class to do it for us."""
    if check_csrf(request) is not None:
        raise HttpError(403, "Session expired. Refresh the page and try again.")


def _client_ip(request) -> str:
    """Best-effort client address for throttling.

    REMOTE_ADDR only — X-Forwarded-For is trivially spoofed, and trusting it
    here would let an attacker sidestep the throttle with a header. Behind a
    real proxy, terminate the header there and set REMOTE_ADDR.
    """
    return request.META.get("REMOTE_ADDR") or "unknown"


def _throttle_key(request, email: str) -> str:
    return f"coach:login-fail:{_client_ip(request)}:{email}"


def _check_not_locked(request, email: str) -> None:
    if cache.get(_throttle_key(request, email), 0) >= FAILURE_LIMIT:
        raise HttpError(
            429, "Too many sign-in attempts. Please wait 15 minutes and try again."
        )


def _record_failure(request, email: str) -> None:
    key = _throttle_key(request, email)
    # Sliding window: each failure re-arms the full timeout.
    cache.set(key, cache.get(key, 0) + 1, FAILURE_WINDOW_SEC)


def _normalize_email(raw: str) -> str:
    email = (raw or "").strip().lower()
    if not email:
        raise HttpError(400, "Please enter your email address.")
    if len(email) > EMAIL_MAX_LEN:
        raise HttpError(400, "That email address is too long.")
    try:
        validate_email(email)
    except ValidationError:
        raise HttpError(400, "That doesn't look like a valid email address.")
    return email


def _initials(name: str, email: str) -> str:
    parts = [p for p in (name or "").split() if p]
    if parts:
        return "".join(p[0] for p in parts[:2]).upper()
    return (email[:1] or "?").upper()


def user_payload(user: User) -> dict:
    """The shape every auth endpoint returns — one definition, one contract."""
    name = (user.first_name or "").strip() or user.email.split("@")[0]
    count = Session.objects.filter(user=user).count()
    return {
        "id": user.id,
        "name": name,
        "email": user.email,
        "initials": _initials(name, user.email),
        "joined_at": user.date_joined,
        "session_count": count,
        "is_new": count == 0,
    }


# --- endpoints --------------------------------------------------------------
@router.get("/csrf", response=OkOut, auth=None)
def issue_csrf(request):
    """Prime the csrftoken cookie before the first unsafe request.

    get_token() flags the request so CsrfViewMiddleware writes the cookie on
    the way out; the SPA then mirrors it into the X-CSRFToken header.
    """
    get_token(request)
    return {"ok": True}


@router.post("/register", response={201: UserOut}, auth=None)
def register(request, payload: RegisterIn):
    _require_csrf(request)

    name = (payload.name or "").strip()
    if not name:
        raise HttpError(400, "Please tell us what to call you.")
    if len(name) > NAME_MAX_LEN:
        raise HttpError(400, f"Please keep your name under {NAME_MAX_LEN} characters.")

    email = _normalize_email(payload.email)

    # Check before hashing so the common "already registered" path stays cheap.
    if User.objects.filter(username=email).exists():
        raise HttpError(409, "An account already uses that email. Try signing in.")

    # Validate against the real password policy (settings.AUTH_PASSWORD_VALIDATORS)
    # with an unsaved user attached, so similarity-to-email is caught too.
    candidate = User(username=email, email=email, first_name=name)
    try:
        validate_password(payload.password, candidate)
    except ValidationError as exc:
        raise HttpError(400, " ".join(exc.messages))

    try:
        with transaction.atomic():
            user = User.objects.create_user(
                username=email, email=email, first_name=name, password=payload.password
            )
            UserState.for_user(user)
    except IntegrityError:
        # Lost a race against a concurrent signup with the same email.
        raise HttpError(409, "An account already uses that email. Try signing in.")

    login(request, user, backend=MODEL_BACKEND)
    request.session.set_expiry(None)  # honour SESSION_COOKIE_AGE
    log.info("Registered account %s", email)
    return 201, user_payload(user)


@router.post("/login", response=UserOut, auth=None)
def sign_in(request, payload: LoginIn):
    _require_csrf(request)

    email = (payload.email or "").strip().lower()
    if not email or not payload.password:
        raise HttpError(400, "Please enter your email and password.")

    _check_not_locked(request, email)

    user = authenticate(request, username=email, password=payload.password)
    if user is None:
        _record_failure(request, email)
        # One message for both "no such account" and "wrong password" — telling
        # them apart hands an attacker a free account-enumeration oracle.
        raise HttpError(401, "That email and password don't match. Please try again.")
    if not user.is_active:
        raise HttpError(403, "This account has been deactivated.")

    cache.delete(_throttle_key(request, email))
    login(request, user, backend=MODEL_BACKEND)
    # Unchecked "remember me" => cookie dies with the browser session.
    request.session.set_expiry(None if payload.remember else 0)
    UserState.for_user(user)
    return user_payload(user)


@router.post("/logout", auth=django_auth, response=OkOut)
def sign_out(request):
    logout(request)  # flushes the session and rotates the CSRF token
    return {"ok": True}


@router.get("/me", auth=django_auth, response=UserOut)
def me(request):
    # Refresh the CSRF cookie on every bootstrap so a long-idle tab can still
    # POST without a round trip to /csrf first.
    get_token(request)
    return user_payload(request.auth)
