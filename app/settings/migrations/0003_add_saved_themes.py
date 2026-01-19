from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ("organizations", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("settings", "0002_add_theme_name"),
    ]

    operations = [
        migrations.CreateModel(
            name="SavedTheme",
            fields=[
                (
                    "deleted_at",
                    models.DateTimeField(blank=True, db_index=True, null=True),
                ),
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                (
                    "name",
                    models.CharField(help_text="Display name for the theme", max_length=100),
                ),
                (
                    "customizations",
                    models.JSONField(
                        default=dict, help_text="Theme color customizations"
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="created_themes",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "organization",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="saved_themes",
                        to="organizations.organization",
                    ),
                ),
            ],
            options={
                "verbose_name": "Saved Theme",
                "verbose_name_plural": "Saved Themes",
                "ordering": ["name"],
                "unique_together": {("organization", "name")},
            },
        ),
        migrations.AddField(
            model_name="organizationsettings",
            name="saved_theme",
            field=models.ForeignKey(
                blank=True,
                help_text="Reference to a saved custom theme",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="org_settings_using",
                to="settings.savedtheme",
            ),
        ),
        migrations.AddField(
            model_name="workspacesettings",
            name="saved_theme",
            field=models.ForeignKey(
                blank=True,
                help_text="Reference to a saved custom theme",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="ws_settings_using",
                to="settings.savedtheme",
            ),
        ),
    ]
