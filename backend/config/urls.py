"""Root URL configuration.

Mounts the Django admin, the Ninja API at /api (docs at /api/docs), and — in
DEBUG only — serves uploaded audio from MEDIA_ROOT.
"""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import path
from ninja import NinjaAPI

from coach.api import router as coach_router

api = NinjaAPI(title="Speaking Coach API", version="1.0.0")
api.add_router("/", coach_router)

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", api.urls),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
