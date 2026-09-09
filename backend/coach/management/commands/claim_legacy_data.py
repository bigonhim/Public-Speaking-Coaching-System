"""Hand practice data recorded before accounts existed to a real account.

Sessions created by the pre-auth build have user=None and are invisible to the
API once every endpoint is scoped to request.user. Rather than delete or
auto-assign them (whose are they? the API cannot know), they sit in a "legacy"
bucket until you claim them explicitly:

    python manage.py claim_legacy_data --email you@example.com

Add --dry-run to see the counts without writing anything.
"""

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from coach.models import Session, UserState
from coach.services import levels as levels_mod
from coach.services.config_loader import load_scoring

_LEVEL_FIELDS = (
    "duration_sec", "overall_score", "wpm", "filler_per_min",
    "relevance_score", "pace_score", "filler_score", "pause_score",
)


class Command(BaseCommand):
    help = "Assign pre-accounts sessions (user=None) to an existing account."

    def add_arguments(self, parser):
        parser.add_argument("--email", required=True, help="Email of the claiming account.")
        parser.add_argument(
            "--dry-run", action="store_true", help="Report what would change, then stop."
        )

    def handle(self, *args, **options):
        email = options["email"].strip().lower()
        user = User.objects.filter(username=email).first()
        if user is None:
            raise CommandError(
                f"No account for {email}. Register in the app first, then re-run this."
            )

        orphans = Session.objects.filter(user=None)
        count = orphans.count()
        if count == 0:
            self.stdout.write("No unclaimed sessions — nothing to do.")
            return

        if options["dry_run"]:
            self.stdout.write(f"Would move {count} session(s) to {email}.")
            return

        with transaction.atomic():
            orphans.update(user=user)

            legacy = UserState.objects.filter(user=None).order_by("pk").first()
            state = UserState.for_user(user)

            # Keep the *earliest* baseline: it is the "where you started" line on
            # the progress chart, so overwriting it would erase the improvement.
            if legacy is not None:
                if state.baseline_overall is None:
                    state.baseline_overall = legacy.baseline_overall
                state.current_level = max(state.current_level, legacy.current_level)
                legacy.delete()

            if state.baseline_overall is None:
                oldest = (
                    Session.objects.filter(user=user)
                    .exclude(overall_score=None)
                    .order_by("created_at")
                    .first()
                )
                if oldest is not None:
                    state.baseline_overall = oldest.overall_score

            # Re-evaluate the level against the newly merged history.
            cfg = load_scoring()
            sessions = list(
                Session.objects.filter(user=user).order_by("-created_at").values(*_LEVEL_FIELDS)
            )
            candidate = levels_mod.evaluate(sessions, state.baseline_overall, cfg)
            state.current_level = max(state.current_level, candidate)
            state.save()

        self.stdout.write(
            self.style.SUCCESS(
                f"Moved {count} session(s) to {email}. Level is now {state.current_level} "
                f"({levels_mod.describe(state.current_level)['name']})."
            )
        )
