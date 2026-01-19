import uuid
from django.conf import settings as django_settings
from django.db import models
from core.models import SoftDeleteMixin


THEME_TYPE_CHOICES = [
    ("preset", "Preset"),
    ("custom", "Custom"),
]


class Theme(SoftDeleteMixin):
    """
    A theme that can be either a preset (system-defined) or custom (user-defined).
    Preset themes are organization-agnostic and created at system level.
    Custom themes are scoped to an organization.
    Supports both light and dark mode customizations.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="themes",
        null=True,
        blank=True,
        help_text="Null for preset themes, set for custom org themes",
    )
    name = models.CharField(
        max_length=100,
        help_text="Display name for the theme",
    )
    theme_type = models.CharField(
        max_length=20,
        choices=THEME_TYPE_CHOICES,
        default="custom",
        help_text="preset = system-defined, custom = user-defined",
    )
    # Light mode customizations
    light_customizations = models.JSONField(
        default=dict,
        help_text="Light mode theme color customizations",
    )
    # Dark mode customizations
    dark_customizations = models.JSONField(
        default=dict,
        help_text="Dark mode theme color customizations",
    )

    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        django_settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_themes",
    )

    class Meta(SoftDeleteMixin.Meta):
        verbose_name = "Theme"
        verbose_name_plural = "Themes"
        ordering = ["theme_type", "name"]

    def __str__(self):
        if self.organization:
            return f"{self.name} ({self.organization.name})"
        return f"{self.name} (Preset)"

    @property
    def is_preset(self):
        return self.theme_type == "preset"


class OrganizationSettings(SoftDeleteMixin):
    """
    Settings for an organization, including theme configuration.
    One-to-one relationship with Organization.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.OneToOneField(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="settings",
    )

    # Reference to the selected theme
    theme = models.ForeignKey(
        Theme,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="org_settings_using",
        help_text="Reference to the selected theme",
    )

    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        django_settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="updated_org_settings",
    )

    class Meta(SoftDeleteMixin.Meta):
        verbose_name = "Organization Settings"
        verbose_name_plural = "Organization Settings"

    def __str__(self):
        return f"Settings for {self.organization.name}"

    def get_effective_theme(self):
        """Return the complete theme configuration."""
        if self.theme:
            return {
                "id": str(self.theme.id),
                "name": self.theme.name,
                "themeType": self.theme.theme_type,
                "lightCustomizations": self.theme.light_customizations or {},
                "darkCustomizations": self.theme.dark_customizations or {},
            }
        # Return default light theme if no theme selected
        return {
            "id": None,
            "name": "Light",
            "themeType": "preset",
            "lightCustomizations": {},
            "darkCustomizations": {},
        }


class WorkspaceSettings(SoftDeleteMixin):
    """
    Settings for a workspace, including theme configuration.
    One-to-one relationship with Workspace.
    Inherits from organization settings if not overridden.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.OneToOneField(
        "workspaces.Workspace",
        on_delete=models.CASCADE,
        related_name="settings",
    )

    # Reference to the selected theme (null means inherit from org)
    theme = models.ForeignKey(
        Theme,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ws_settings_using",
        help_text="Reference to the selected theme (null = inherit from org)",
    )
    inherit_theme = models.BooleanField(
        default=True,
        help_text="If true, inherit theme from organization settings",
    )

    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        django_settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="updated_ws_settings",
    )

    class Meta(SoftDeleteMixin.Meta):
        verbose_name = "Workspace Settings"
        verbose_name_plural = "Workspace Settings"

    def __str__(self):
        return f"Settings for {self.workspace.name}"

    def get_effective_theme(self):
        """
        Return the complete theme configuration.
        Inherits from organization if inherit_theme is True.
        """
        if self.inherit_theme:
            # Get org settings
            org_settings = getattr(self.workspace.organization, "settings", None)
            if org_settings:
                return org_settings.get_effective_theme()

        if self.theme:
            return {
                "id": str(self.theme.id),
                "name": self.theme.name,
                "themeType": self.theme.theme_type,
                "lightCustomizations": self.theme.light_customizations or {},
                "darkCustomizations": self.theme.dark_customizations or {},
            }

        # Return default light theme if no theme selected
        return {
            "id": None,
            "name": "Light",
            "themeType": "preset",
            "lightCustomizations": {},
            "darkCustomizations": {},
        }
