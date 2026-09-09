"""Seed synthetic Sessions showing an improving trajectory.

For demoing the progress dashboard and level unlocks without recording ~20
real speeches. Scores are produced by the REAL scoring module so the demo data
is internally consistent and transparent. Use --reset to start clean.
"""

import random
from datetime import timedelta

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from coach.models import Session, Topic, UserState
from coach.services import feedback as feedback_mod
from coach.services import levels as levels_mod
from coach.services import scoring as scoring_mod
from coach.services.config_loader import load_scoring


def _lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


class Command(BaseCommand):
    help = "Create synthetic sessions with an improving trajectory (for demos)."

    def add_arguments(self, parser):
        parser.add_argument("--count", type=int, default=12)
        parser.add_argument("--reset", action="store_true", help="Delete existing sessions/state first.")
        parser.add_argument("--seed", type=int, default=42)
        parser.add_argument(
            "--email",
            help="Account to seed. Omit to fill the pre-accounts 'legacy' bucket.",
        )

    def handle(self, *args, **options):
        count = options["count"]
        rng = random.Random(options["seed"])
        cfg = load_scoring()

        # Resolve the owner first: --reset should only ever wipe their data, not
        # everyone's.
        user = None
        if options["email"]:
            email = options["email"].strip().lower()
            user = User.objects.filter(username=email).first()
            if user is None:
                raise CommandError(f"No account for {email}. Register in the app first.")

        if options["reset"]:
            Session.objects.filter(user=user).delete()
            UserState.objects.filter(user=user).delete()

        topic = Topic.objects.first()
        if topic is None:
            self.stderr.write(self.style.ERROR("No topics found — run `seed_topics` first."))
            return

        state = UserState.for_user(user)
        now = timezone.now()

        for i in range(count):
            t = i / max(1, count - 1)  # 0 -> 1 over the run
            metrics = self._synthetic_metrics(t, rng)
            similarity = _lerp(0.25, 0.52, t) + rng.uniform(-0.02, 0.02)
            scores = scoring_mod.score_all(metrics, similarity, cfg)
            notes = feedback_mod.build_feedback(metrics, scores, cfg)

            session = Session.objects.create(
                user=user,
                topic=topic,
                topic_text=topic.text,
                audio="",  # synthetic — no audio file
                duration_sec=60.0,
                transcript="(synthetic demo session)",
                word_count=metrics["word_count"],
                words_json=[],
                wpm=metrics["wpm"],
                filler_count=metrics["filler_count"],
                filler_per_min=metrics["filler_per_min"],
                pause_count=metrics["pause_count"],
                long_pause_count=metrics["long_pause_count"],
                silence_ratio=metrics["silence_ratio"],
                relevance_similarity=similarity,
                pace_score=scores["pace"],
                filler_score=scores["filler"],
                pause_score=scores["pause"],
                relevance_score=scores["relevance"],
                overall_score=scores["overall"],
                feedback_json=notes,
            )
            # Space sessions out over recent days (auto_now_add ignores assignment).
            Session.objects.filter(pk=session.pk).update(
                created_at=now - timedelta(days=(count - 1 - i))
            )

            if state.baseline_overall is None:
                state.baseline_overall = scores["overall"]

        # Advance the (monotonic) level against this account's full, freshly-dated history.
        sessions = list(
            Session.objects.filter(user=user).order_by("-created_at").values(
                "duration_sec", "overall_score", "wpm", "filler_per_min",
                "relevance_score", "pace_score", "filler_score", "pause_score",
            )
        )
        candidate = levels_mod.evaluate(sessions, state.baseline_overall, cfg)
        state.current_level = max(state.current_level, candidate)
        state.save()

        owner = user.username if user else "the legacy (pre-accounts) bucket"
        self.stdout.write(
            self.style.SUCCESS(
                f"Created {count} synthetic sessions for {owner}. "
                f"Level is now {state.current_level} "
                f"({levels_mod.describe(state.current_level)['name']})."
            )
        )

    def _synthetic_metrics(self, t: float, rng: random.Random) -> dict:
        """A believable improving take at progress fraction t in [0, 1]."""
        wpm = _lerp(172, 134, t) + rng.uniform(-4, 4)          # too fast -> in band
        filler_per_min = max(0.0, _lerp(6.0, 0.6, t) + rng.uniform(-0.3, 0.3))
        long_pause_count = max(0, round(_lerp(3, 0, t) + rng.uniform(-0.4, 0.4)))
        silence_ratio = max(0.05, _lerp(0.40, 0.20, t) + rng.uniform(-0.02, 0.02))
        speaking_min = 60.0 / 60.0
        word_count = round(wpm * speaking_min)
        return {
            "word_count": word_count,
            "speaking_time_sec": 60.0,
            "wpm": wpm,
            "filler_count": round(filler_per_min * speaking_min),
            "filler_per_min": filler_per_min,
            "pause_count": rng.randint(3, 6),
            "long_pause_count": long_pause_count,
            "silence_ratio": silence_ratio,
        }
