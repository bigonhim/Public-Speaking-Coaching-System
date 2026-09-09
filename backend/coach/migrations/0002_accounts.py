"""Attach practice data to user accounts.

Both FKs are NULLable so this migration is non-destructive: every row that
existed before accounts keeps working as the "legacy" bucket (user=None) and
can be handed to a real account later with `manage.py claim_legacy_data`.
"""

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("coach", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="session",
            name="user",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="speaking_sessions",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="userstate",
            name="user",
            field=models.OneToOneField(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="coach_state",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
