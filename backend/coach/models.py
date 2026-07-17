"""Data model for the speaking coach.

Three tables only, matching the single-user scope:
  * Topic     — the prompt bank (category kept pluggable, never hardcoded)
  * Session   — one recorded attempt plus its metrics, scores and feedback
  * UserState — exactly one row (pk=1): the monotonic level and the baseline

All scoring columns are nullable because a freshly captured Session exists
briefly before the analysis pipeline fills them in.
"""

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
    topic = models.ForeignKey(Topic, on_delete=models.PROTECT, related_name="sessions")
    topic_text = models.TextField()  # denormalised snapshot (topic text may change)
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
    """Single-user progression state. Exactly one row, pk=1.

    `current_level` is monotonic (it only ever increases). `baseline_overall`
    is captured from the very first session and never overwritten.
    """

    current_level = models.IntegerField(default=0)
    baseline_overall = models.FloatField(null=True)

    SINGLETON_PK = 1

    @classmethod
    def load(cls) -> "UserState":
        obj, _ = cls.objects.get_or_create(pk=cls.SINGLETON_PK)
        return obj

    def __str__(self) -> str:
        return f"UserState(level={self.current_level}, baseline={self.baseline_overall})"
