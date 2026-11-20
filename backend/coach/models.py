"""Data model for the speaking coach.

Three tables only:
  * Topic     — the prompt bank, shared by everyone (category kept pluggable)
  * Session   — one recorded attempt plus its metrics, scores and feedback
  * UserState — per-account progression: the monotonic level and the baseline

Both Session and UserState hang off django.contrib.auth's User. The FK is
NULLable on purpose: rows created before accounts existed belong to the
"legacy" bucket (user=None) and stay readable/claimable rather than orphaned.
See coach/management/commands/claim_legacy_data.py.

All scoring columns are nullable because a freshly captured Session exists
briefly before the analysis pipeline fills them in.
"""

from django.conf import settings
from django.db import models


class Topic(models.Model):
    """A speaking prompt. `category` stays a free CharField so new prompt
    types (e.g. interview) could be added later without a schema change —
    but interview mode itself is explicitly out of scope."""

    text = models.TextField()
    category = models.CharField(max_length=50, default="general", db_index=True)

    def __str__(self) -> str:
        return f"[{self.category}] {self.text[:60]}"


class Session(models.Model):
    """One recorded attempt and everything derived from it."""

    created_at = models.DateTimeField(auto_now_add=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="speaking_sessions",
        null=True,
        blank=True,
        db_index=True,
    )
    # Where the prompt came from. A RANDOM take answers a seeded Topic; a CUSTOM
    # take answers a prompt the speaker typed, so it has no Topic row. Custom
    # takes are scored the same way but only count towards the delivery levels
    # (levels.DELIVERY_LEVELS): the speaker wrote the very text relevance is
    # measured against, so relevance-based levels could be gamed.
    SOURCE_RANDOM = "random"
    SOURCE_CUSTOM = "custom"
    SOURCE_CHOICES = [(SOURCE_RANDOM, "Random topic"), (SOURCE_CUSTOM, "Own topic")]

    topic = models.ForeignKey(
        Topic, on_delete=models.PROTECT, related_name="sessions", null=True, blank=True
    )
    topic_source = models.CharField(
        max_length=10, choices=SOURCE_CHOICES, default=SOURCE_RANDOM, db_index=True
    )
    topic_text = models.TextField()  # snapshot; the only topic a CUSTOM take has
    audio = models.FileField(upload_to="audio/")
    duration_sec = models.FloatField()

    # transcription
    transcript = models.TextField(blank=True)
    word_count = models.IntegerField(default=0)
    words_json = models.JSONField(default=list)  # [{word, start, end}, ...]

    # metrics (raw measurements)
    wpm = models.FloatField(null=True)
    filler_count = models.IntegerField(null=True)
    filler_per_min = models.FloatField(null=True)
    pause_count = models.IntegerField(null=True)
    long_pause_count = models.IntegerField(null=True)
    silence_ratio = models.FloatField(null=True)
    relevance_similarity = models.FloatField(null=True)  # raw cosine, always stored

    # scores (0..100)
    pace_score = models.FloatField(null=True)
    filler_score = models.FloatField(null=True)
    pause_score = models.FloatField(null=True)
    relevance_score = models.FloatField(null=True)
    overall_score = models.FloatField(null=True, db_index=True)

    feedback_json = models.JSONField(default=list)  # list[str]

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        score = "—" if self.overall_score is None else f"{self.overall_score:.1f}"
        return f"Session #{self.pk} ({score})"


class UserState(models.Model):
    """Progression state — exactly one row per account, plus one legacy row
    (user=None) holding progress made before accounts existed.

    `current_level` is monotonic (it only ever increases). `baseline_overall`
    is captured from that account's very first session and never overwritten.
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="coach_state",
        null=True,
        blank=True,
    )
    current_level = models.IntegerField(default=0)
    baseline_overall = models.FloatField(null=True)

    @classmethod
    def for_user(cls, user) -> "UserState":
        """The state row for `user`, creating it on first touch.

        An anonymous (or None) user maps to the single legacy row, which keeps
        pre-accounts data and the local-only mode working unchanged.
        """
        owner = user if (user is not None and user.is_authenticated) else None
        # Not get_or_create: the OneToOne unique index does not constrain NULLs,
        # so the legacy bucket could in principle hold more than one row.
        obj = cls.objects.filter(user=owner).order_by("pk").first()
        return obj or cls.objects.create(user=owner)

    def __str__(self) -> str:
        who = self.user.get_username() if self.user_id else "legacy"
        return f"UserState({who}, level={self.current_level}, baseline={self.baseline_overall})"
