"""Admin registrations — free data inspection for calibration and demos."""

from django.contrib import admin

from .models import Session, Topic, UserState


@admin.register(Topic)
class TopicAdmin(admin.ModelAdmin):
    list_display = ("id", "category", "text")
    list_filter = ("category",)
    search_fields = ("text",)


@admin.register(Session)
class SessionAdmin(admin.ModelAdmin):
    list_display = ("id", "created_at", "user", "topic_text", "overall_score")
    list_filter = ("created_at", "user")
    date_hierarchy = "created_at"
    readonly_fields = (
        "created_at", "user", "topic", "topic_text", "audio", "duration_sec",
        "transcript", "word_count", "words_json",
        "wpm", "filler_count", "filler_per_min", "pause_count",
        "long_pause_count", "silence_ratio", "relevance_similarity",
        "pace_score", "filler_score", "pause_score", "relevance_score",
        "overall_score", "feedback_json",
    )


@admin.register(UserState)
class UserStateAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "current_level", "baseline_overall")
    list_filter = ("current_level",)
