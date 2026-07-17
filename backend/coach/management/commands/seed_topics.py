"""Seed the Topic table from coach/data/topics.json (idempotent)."""

import json
from pathlib import Path

from django.core.management.base import BaseCommand

from coach.models import Topic

_TOPICS_JSON = Path(__file__).resolve().parent.parent.parent / "data" / "topics.json"


class Command(BaseCommand):
    help = "Seed public-speaking topics from data/topics.json."

    def handle(self, *args, **options):
        data = json.loads(_TOPICS_JSON.read_text(encoding="utf-8"))
        created = 0
        for item in data:
            _, was_created = Topic.objects.get_or_create(
                text=item["text"],
                defaults={"category": item.get("category", "general")},
            )
            created += int(was_created)
        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded topics: {created} new, {len(data) - created} already present "
                f"({Topic.objects.count()} total)."
            )
        )
