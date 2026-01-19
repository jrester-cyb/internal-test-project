import re
from django.db.models import Case, When, Value, IntegerField
from rest_framework import serializers
from .models import OrganizationSettings, WorkspaceSettings, Theme, THEME_TYPE_CHOICES


HEX_COLOR_PATTERN = re.compile(r"^#[0-9A-Fa-f]{6}$")


class ThemeColorSetSerializer(serializers.Serializer):
    """Serializer for a color set (main, light, dark, contrastText)."""

    main = serializers.CharField(required=False, allow_blank=True)
    light = serializers.CharField(required=False, allow_blank=True)
    dark = serializers.CharField(required=False, allow_blank=True)
    contrastText = serializers.CharField(required=False, allow_blank=True)

    def validate(self, data):
        for key, value in data.items():
            if value and not HEX_COLOR_PATTERN.match(value):
                raise serializers.ValidationError(
                    {key: f"Invalid hex color '{value}'. Use format #RRGGBB."}
                )
        return data


class ThemeCustomizationsSerializer(serializers.Serializer):
    """Serializer for theme customizations."""

    primary = ThemeColorSetSerializer(required=False)
    secondary = ThemeColorSetSerializer(required=False)
    button = ThemeColorSetSerializer(required=False)  # Separate button colors
    background = serializers.DictField(
        child=serializers.CharField(), required=False
    )
    text = serializers.DictField(child=serializers.CharField(), required=False)
    error = ThemeColorSetSerializer(required=False)
    warning = ThemeColorSetSerializer(required=False)
    info = ThemeColorSetSerializer(required=False)
    success = ThemeColorSetSerializer(required=False)
    appBar = serializers.DictField(child=serializers.CharField(), required=False)

    def validate_background(self, value):
        if value:
            for key, color in value.items():
                if color and not HEX_COLOR_PATTERN.match(color):
                    raise serializers.ValidationError(
                        f"Invalid hex color '{color}' for background.{key}"
                    )
        return value

    def validate_text(self, value):
        if value:
            for key, color in value.items():
                if color and not HEX_COLOR_PATTERN.match(color):
                    raise serializers.ValidationError(
                        f"Invalid hex color '{color}' for text.{key}"
                    )
        return value

    def validate_appBar(self, value):
        if value:
            for key, color in value.items():
                if color and not HEX_COLOR_PATTERN.match(color):
                    raise serializers.ValidationError(
                        f"Invalid hex color '{color}' for appBar.{key}"
                    )
        return value


class ThemeSerializer(serializers.ModelSerializer):
    """Serializer for Theme model."""

    light_customizations = ThemeCustomizationsSerializer(required=False)
    dark_customizations = ThemeCustomizationsSerializer(required=False)

    class Meta:
        model = Theme
        fields = [
            "id",
            "organization",
            "name",
            "theme_type",
            "light_customizations",
            "dark_customizations",
            "created_at",
            "updated_at",
            "created_by",
        ]
        read_only_fields = [
            "id",
            "organization",
            "created_at",
            "updated_at",
            "created_by",
        ]


class ThemeListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for listing themes."""

    class Meta:
        model = Theme
        fields = ["id", "name", "theme_type"]


class OrganizationSettingsSerializer(serializers.ModelSerializer):
    effective_theme = serializers.SerializerMethodField()
    themes = serializers.SerializerMethodField()

    class Meta:
        model = OrganizationSettings
        fields = [
            "id",
            "organization",
            "theme",
            "effective_theme",
            "themes",
            "created_at",
            "updated_at",
            "updated_by",
        ]
        read_only_fields = [
            "id",
            "organization",
            "created_at",
            "updated_at",
            "updated_by",
        ]

    def get_effective_theme(self, obj):
        return obj.get_effective_theme()

    def get_themes(self, obj):
        """Return list of available themes (presets + org custom themes)."""
        # Get preset themes (organization is null) with Default first
        preset_themes = Theme.objects.filter(
            theme_type="preset", deleted_at__isnull=True
        ).annotate(
            sort_order=Case(
                When(name="Default", then=Value(0)),
                default=Value(1),
                output_field=IntegerField(),
            )
        ).order_by("sort_order", "name")
        # Get custom themes for this organization (alphabetically)
        custom_themes = Theme.objects.filter(
            organization=obj.organization, theme_type="custom", deleted_at__isnull=True
        ).order_by("name")
        all_themes = list(preset_themes) + list(custom_themes)
        return ThemeListSerializer(all_themes, many=True).data


class WorkspaceSettingsSerializer(serializers.ModelSerializer):
    effective_theme = serializers.SerializerMethodField()
    inherited_from_org = serializers.SerializerMethodField()
    themes = serializers.SerializerMethodField()

    class Meta:
        model = WorkspaceSettings
        fields = [
            "id",
            "workspace",
            "theme",
            "inherit_theme",
            "effective_theme",
            "inherited_from_org",
            "themes",
            "created_at",
            "updated_at",
            "updated_by",
        ]
        read_only_fields = [
            "id",
            "workspace",
            "created_at",
            "updated_at",
            "updated_by",
        ]

    def get_effective_theme(self, obj):
        return obj.get_effective_theme()

    def get_inherited_from_org(self, obj):
        if obj.inherit_theme:
            org_settings = getattr(obj.workspace.organization, "settings", None)
            if org_settings:
                return org_settings.get_effective_theme()
        return None

    def get_themes(self, obj):
        """Return list of available themes (presets + org custom themes)."""
        # Get preset themes (organization is null) with Default first
        preset_themes = Theme.objects.filter(
            theme_type="preset", deleted_at__isnull=True
        ).annotate(
            sort_order=Case(
                When(name="Default", then=Value(0)),
                default=Value(1),
                output_field=IntegerField(),
            )
        ).order_by("sort_order", "name")
        # Get custom themes for this organization (alphabetically)
        custom_themes = Theme.objects.filter(
            organization=obj.workspace.organization,
            theme_type="custom",
            deleted_at__isnull=True,
        ).order_by("name")
        all_themes = list(preset_themes) + list(custom_themes)
        return ThemeListSerializer(all_themes, many=True).data


class ThemeResponseSerializer(serializers.Serializer):
    """Lightweight serializer for theme-only responses."""

    id = serializers.UUIDField(allow_null=True)
    name = serializers.CharField()
    theme_type = serializers.CharField()
    light_customizations = serializers.DictField()
    dark_customizations = serializers.DictField()
