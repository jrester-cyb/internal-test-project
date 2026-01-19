from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("settings", "0003_add_saved_themes"),
    ]

    operations = [
        # Step 1: Rename SavedTheme model to Theme
        migrations.RenameModel(
            old_name="SavedTheme",
            new_name="Theme",
        ),
        # Step 2: Add theme_type field with default 'custom'
        migrations.AddField(
            model_name="theme",
            name="theme_type",
            field=models.CharField(
                choices=[("preset", "Preset"), ("custom", "Custom")],
                default="custom",
                help_text="preset = system-defined, custom = user-defined",
                max_length=20,
            ),
        ),
        # Step 3: Rename customizations to light_customizations
        migrations.RenameField(
            model_name="theme",
            old_name="customizations",
            new_name="light_customizations",
        ),
        # Step 4: Add dark_customizations field
        migrations.AddField(
            model_name="theme",
            name="dark_customizations",
            field=models.JSONField(
                default=dict,
                help_text="Dark mode theme color customizations",
            ),
        ),
        # Step 5: Make organization nullable (for preset themes)
        migrations.AlterField(
            model_name="theme",
            name="organization",
            field=models.ForeignKey(
                blank=True,
                help_text="Null for preset themes, set for custom org themes",
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="themes",
                to="organizations.organization",
            ),
        ),
        # Step 6: Rename saved_theme to theme on OrganizationSettings
        migrations.RenameField(
            model_name="organizationsettings",
            old_name="saved_theme",
            new_name="theme",
        ),
        # Step 7: Rename saved_theme to theme on WorkspaceSettings
        migrations.RenameField(
            model_name="workspacesettings",
            old_name="saved_theme",
            new_name="theme",
        ),
        # Step 8: Remove deprecated fields from OrganizationSettings
        migrations.RemoveField(
            model_name="organizationsettings",
            name="theme_preset",
        ),
        migrations.RemoveField(
            model_name="organizationsettings",
            name="theme_name",
        ),
        migrations.RemoveField(
            model_name="organizationsettings",
            name="theme_customizations",
        ),
        # Step 9: Remove deprecated fields from WorkspaceSettings
        migrations.RemoveField(
            model_name="workspacesettings",
            name="theme_preset",
        ),
        migrations.RemoveField(
            model_name="workspacesettings",
            name="theme_name",
        ),
        migrations.RemoveField(
            model_name="workspacesettings",
            name="theme_customizations",
        ),
        # Step 10: Update related_name for theme FK on OrganizationSettings
        migrations.AlterField(
            model_name="organizationsettings",
            name="theme",
            field=models.ForeignKey(
                blank=True,
                help_text="Reference to the selected theme",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="org_settings_using",
                to="settings.theme",
            ),
        ),
        # Step 11: Update related_name for theme FK on WorkspaceSettings
        migrations.AlterField(
            model_name="workspacesettings",
            name="theme",
            field=models.ForeignKey(
                blank=True,
                help_text="Reference to the selected theme (null = inherit from org)",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="ws_settings_using",
                to="settings.theme",
            ),
        ),
    ]
