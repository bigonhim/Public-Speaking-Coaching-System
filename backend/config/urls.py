"""Root URL configuration.

Mounts the Django admin and the Ninja API at /api (docs at /api/docs).

The API is constructed with `auth=django_auth`, so authentication is the
default and every new endpoint is private unless it explicitly opts out with
`auth=None` (only /api/auth/csrf, /register and /login do). django_auth also
enforces CSRF on unsafe methods for everything it guards.

MEDIA_ROOT is deliberately NOT mounted. django.conf.urls.static.static() has no
concept of ownership, so it would hand any visitor another account's recording
from a guessable URL. Audio is served instead by the ownership-checked
GET /api/sessions/{id}/audio.
"""

from django.contrib import admin
from django.urls import path
from ninja import NinjaAPI
from ninja.security import django_auth

from coach.api import router as coach_router
from coach.auth_api import router as auth_router

api = NinjaAPI(title="Speaking Coach API", version="1.0.0", auth=django_auth)
api.add_router("/auth/", auth_router)
api.add_router("/", coach_router)

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", api.urls),
]
