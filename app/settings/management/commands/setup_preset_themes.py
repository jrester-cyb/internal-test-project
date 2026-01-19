from django.core.management.base import BaseCommand
from settings.models import Theme


# Preset theme definitions
# Default: Standard corporate theme with proper light and dark modes
# Blue: Blue-focused theme
# High Contrast: Accessibility-focused high contrast theme
PRESET_THEMES = {
    "Default": {
        "light_customizations": {
            "primary": {"main": "#003162", "light": "#42a5f5", "dark": "#1565c0"},
            "secondary": {"main": "#fecf18", "light": "#fed54a", "dark": "#cab210"},
            "button": {"main": "#003162", "light": "#42a5f5", "dark": "#1565c0"},
            "background": {"default": "#f5f5f5", "paper": "#ffffff"},
            "text": {"primary": "#212121", "secondary": "#757575"},
        },
        "dark_customizations": {
            "primary": {"main": "#003162", "light": "#42a5f5", "dark": "#1565c0"},
            "secondary": {"main": "#fecf18", "light": "#fed54a", "dark": "#cab210"},
            # Use secondary color for buttons in dark mode
            "button": {"main": "#fecf18", "light": "#fed54a", "dark": "#cab210"},
            "background": {"default": "#3a3a3a", "paper": "#4a4a4a"},
            "text": {"primary": "#ffffff", "secondary": "#b0b0b0"},
        },
    },
    "Blue": {
        "light_customizations": {
            "primary": {"main": "#1565c0", "light": "#5e92f3", "dark": "#003c8f"},
            "secondary": {"main": "#00acc1", "light": "#5ddef4", "dark": "#007c91"},
            "button": {"main": "#1565c0", "light": "#5e92f3", "dark": "#003c8f"},
            "background": {"default": "#e8f4fc", "paper": "#ffffff"},
            "text": {"primary": "#1a237e", "secondary": "#3949ab"},
        },
        "dark_customizations": {
            "primary": {"main": "#1565c0", "light": "#5e92f3", "dark": "#003c8f"},
            "secondary": {"main": "#4dd0e1", "light": "#88ffff", "dark": "#009faf"},
            "button": {"main": "#4dd0e1", "light": "#88ffff", "dark": "#009faf"},
            "background": {"default": "#0a1929", "paper": "#102a43"},
            "text": {"primary": "#e3f2fd", "secondary": "#90caf9"},
        },
    },
    "High Contrast": {
        "light_customizations": {
            "primary": {"main": "#000000", "light": "#333333", "dark": "#000000", "contrastText": "#ffffff"},
            "secondary": {"main": "#0000cc", "light": "#0000ff", "dark": "#000099", "contrastText": "#ffffff"},
            "button": {"main": "#000000", "light": "#333333", "dark": "#000000"},
            "background": {"default": "#ffffff", "paper": "#ffffff"},
            "text": {"primary": "#000000", "secondary": "#000000"},
            "error": {"main": "#cc0000"},
            "warning": {"main": "#cc6600"},
            "success": {"main": "#006600"},
            "info": {"main": "#0000cc"},
        },
        "dark_customizations": {
            "primary": {"main": "#ffff00", "light": "#ffff66", "dark": "#cccc00", "contrastText": "#000000"},
            "secondary": {"main": "#00ffff", "light": "#66ffff", "dark": "#00cccc", "contrastText": "#000000"},
            "button": {"main": "#ffff00", "light": "#ffff66", "dark": "#cccc00"},
            "background": {"default": "#000000", "paper": "#121212"},
            "text": {"primary": "#ffffff", "secondary": "#e0e0e0"},
            "error": {"main": "#ff4444"},
            "warning": {"main": "#ffcc00"},
            "success": {"main": "#00ff00"},
            "info": {"main": "#00ffff"},
        },
    },
}


class Command(BaseCommand):
    help = "Create or update preset themes in the database"

    def add_arguments(self, parser):
        parser.add_argument(
            "--force",
            action="store_true",
            help="Force update existing preset themes with new values",
        )
        parser.add_argument(
            "--clean",
            action="store_true",
            help="Remove preset themes that are no longer defined",
        )

    def handle(self, *args, **options):
        force_update = options["force"]
        clean_old = options["clean"]
        created_count = 0
        updated_count = 0
        skipped_count = 0
        deleted_count = 0

        # Clean up old preset themes that are no longer defined
        if clean_old:
            valid_names = set(PRESET_THEMES.keys())
            old_presets = Theme.objects.filter(
                theme_type="preset",
                organization__isnull=True,
            ).exclude(name__in=valid_names)

            for old_theme in old_presets:
                self.stdout.write(
                    self.style.WARNING(f"Deleting old preset theme: {old_theme.name}")
                )
                old_theme.delete()
                deleted_count += 1

        # Create or update preset themes
        for name, customizations in PRESET_THEMES.items():
            theme, created = Theme.objects.get_or_create(
                name=name,
                theme_type="preset",
                organization=None,
                defaults={
                    "light_customizations": customizations["light_customizations"],
                    "dark_customizations": customizations["dark_customizations"],
                },
            )

            if created:
                created_count += 1
                self.stdout.write(
                    self.style.SUCCESS(f"Created preset theme: {name}")
                )
            elif force_update:
                theme.light_customizations = customizations["light_customizations"]
                theme.dark_customizations = customizations["dark_customizations"]
                theme.save()
                updated_count += 1
                self.stdout.write(
                    self.style.WARNING(f"Updated preset theme: {name}")
                )
            else:
                skipped_count += 1
                self.stdout.write(f"Skipped existing preset theme: {name}")

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                f"Done! Created: {created_count}, Updated: {updated_count}, "
                f"Skipped: {skipped_count}, Deleted: {deleted_count}"
            )
        )
