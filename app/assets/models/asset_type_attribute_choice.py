from django.db import models
from polymorphic.models import PolymorphicModel
import uuid
from core.models.soft_delete import PolymorphicSoftDeleteMixin


class AssetTypeAttributeChoice(PolymorphicSoftDeleteMixin, PolymorphicModel):
    """Base polymorphic model for attribute choices - value type matches the attribute's type"""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    asset_type_attribute = models.ForeignKey(
        "assets.BaseAssetTypeAttribute",
        on_delete=models.CASCADE,
        related_name="choices",
    )
    label = models.CharField(max_length=255, help_text="Display label shown to users")
    icon = models.CharField(
        max_length=100,
        blank=True,
        help_text="Icon identifier (e.g., 'mdi:check', 'fa:star', or URL to icon)",
    )
    color = models.CharField(
        max_length=50,
        blank=True,
        help_text="Color for the choice (e.g., '#FF5733', 'red', 'rgb(255,87,51)')",
    )
    order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta(PolymorphicSoftDeleteMixin.Meta):
        ordering = ["asset_type_attribute", "order", "label"]
        constraints = [
            models.UniqueConstraint(
                fields=["asset_type_attribute", "order"],
                name="unique_ata_choice_order",
                condition=models.Q(deleted_at__isnull=True),
            ),
        ]

    def __str__(self):
        return f"{self.asset_type_attribute.name}: {self.label}"


class TextAttributeChoice(AssetTypeAttributeChoice):
    """Text choice value"""

    value = models.TextField()


class NumberAttributeChoice(AssetTypeAttributeChoice):
    """Number choice value"""

    value = models.FloatField()


class BooleanAttributeChoice(AssetTypeAttributeChoice):
    """Boolean choice value"""

    value = models.BooleanField()


class DateAttributeChoice(AssetTypeAttributeChoice):
    """Date choice value"""

    value = models.DateField()


class DateTimeAttributeChoice(AssetTypeAttributeChoice):
    """DateTime choice value"""

    value = models.DateTimeField()


class JSONAttributeChoice(AssetTypeAttributeChoice):
    """JSON choice value"""

    value = models.JSONField()


# =============================================================================
# Workspace Choice Models (Override, Hidden, Extension)
# =============================================================================


class BaseWorkspaceChoice(PolymorphicSoftDeleteMixin, PolymorphicModel):
    """
    Base polymorphic model for workspace-specific choice modifications.
    Subclasses: WorkspaceChoiceOverride, WorkspaceHiddenChoice, WorkspaceExtensionChoice
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        "workspaces.Workspace",
        on_delete=models.CASCADE,
        related_name="choice_modifications",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta(PolymorphicSoftDeleteMixin.Meta):
        pass


class WorkspaceChoiceOverride(BaseWorkspaceChoice):
    """
    Override properties of a base choice for a specific workspace.
    Null fields mean "use base value".
    """

    base_choice = models.ForeignKey(
        AssetTypeAttributeChoice,
        on_delete=models.CASCADE,
        related_name="overrides",
        help_text="The base choice this overrides",
    )
    # Overridable fields - null means "use base value"
    label = models.CharField(max_length=255, null=True, blank=True)
    icon = models.CharField(max_length=100, null=True, blank=True)
    color = models.CharField(max_length=50, null=True, blank=True)
    order = models.IntegerField(null=True, blank=True)

    class Meta:
        # NOTE: Uniqueness enforced at application level
        pass

    def __str__(self):
        return f"Override: {self.base_choice.label} in {self.workspace.name}"

    def get_effective_value(self, field_name):
        """Get the effective value for a field, falling back to base choice."""
        override_value = getattr(self, field_name)
        if override_value is not None:
            return override_value
        return getattr(self.base_choice, field_name)

    @property
    def value(self):
        """Value comes from base choice (cannot be overridden)."""
        return self.base_choice.value


class WorkspaceHiddenChoice(BaseWorkspaceChoice):
    """
    Hide a base choice in a specific workspace.
    Simple join table - no field overrides, just hiding.
    """

    base_choice = models.ForeignKey(
        AssetTypeAttributeChoice,
        on_delete=models.CASCADE,
        related_name="hidden_in_workspaces",
    )

    class Meta:
        # NOTE: Uniqueness enforced at application level
        pass

    def __str__(self):
        return f"Hidden: {self.base_choice.label} in {self.workspace.name}"


class BaseWorkspaceExtensionChoice(BaseWorkspaceChoice):
    """
    Base for workspace-specific extension choices.
    These are new choices added by a workspace to an attribute.
    Uses polymorphism for typed values like the base choices.
    """

    # Can be attached to either a GlobalAssetTypeAttribute or WorkspaceLocalAssetTypeAttribute
    # Using the base polymorphic model to support both
    global_attribute = models.ForeignKey(
        "assets.GlobalAssetTypeAttribute",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="extension_choices",
        help_text="Global attribute this choice extends (if applicable)",
    )
    extension_attribute = models.ForeignKey(
        "assets.WorkspaceLocalAssetTypeAttribute",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="workspace_extension_choices",
        help_text="Extension attribute this choice belongs to (if applicable)",
    )
    label = models.CharField(max_length=255)
    icon = models.CharField(max_length=100, blank=True)
    color = models.CharField(max_length=50, blank=True)
    order = models.IntegerField(default=0)
    is_hidden = models.BooleanField(default=False)

    class Meta:
        constraints = [
            # Ensure exactly one attribute FK is set
            models.CheckConstraint(
                condition=(
                    models.Q(
                        global_attribute__isnull=False, extension_attribute__isnull=True
                    )
                    | models.Q(
                        global_attribute__isnull=True, extension_attribute__isnull=False
                    )
                ),
                name="extension_choice_has_one_attribute",
            ),
        ]

    def __str__(self):
        attr = self.global_attribute or self.extension_attribute
        return (
            f"Extension choice: {self.label} for {attr.name} in {self.workspace.name}"
        )


class TextExtensionChoice(BaseWorkspaceExtensionChoice):
    """Text extension choice value"""

    value = models.TextField()


class NumberExtensionChoice(BaseWorkspaceExtensionChoice):
    """Number extension choice value"""

    value = models.FloatField()


class BooleanExtensionChoice(BaseWorkspaceExtensionChoice):
    """Boolean extension choice value"""

    value = models.BooleanField()


class DateExtensionChoice(BaseWorkspaceExtensionChoice):
    """Date extension choice value"""

    value = models.DateField()


class DateTimeExtensionChoice(BaseWorkspaceExtensionChoice):
    """DateTime extension choice value"""

    value = models.DateTimeField()


class JSONExtensionChoice(BaseWorkspaceExtensionChoice):
    """JSON extension choice value"""

    value = models.JSONField()
