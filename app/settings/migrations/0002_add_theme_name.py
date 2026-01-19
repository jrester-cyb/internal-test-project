from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("settings", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="organizationsettings",
            name="theme_name",
            field=models.CharField(
                blank=True,
                default="",
                help_text="Custom name for the theme (optional)",
                max_length=100,
            ),
        ),
        migrations.AddField(
            model_name="workspacesettings",
            name="theme_name",
            field=models.CharField(
                blank=True,
                default="",
                help_text="Custom name for the theme (optional)",
                max_length=100,
            ),
        ),
    ]
