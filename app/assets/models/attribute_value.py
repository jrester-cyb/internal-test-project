from django.db import models
from polymorphic.models import PolymorphicModel
import uuid
from core.models.soft_delete import PolymorphicSoftDeleteMixin, SoftDeleteMixin


class BaseAttributeValue(PolymorphicSoftDeleteMixin, PolymorphicModel):
    """Base polymorphic model for attribute values"""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    asset = models.ForeignKey(
        "assets.Asset", on_delete=models.CASCADE, related_name="attributes"
    )
    asset_type_attribute = models.ForeignKey(
        "assets.BaseAssetTypeAttribute", on_delete=models.CASCADE, related_name="values"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta(PolymorphicSoftDeleteMixin.Meta):
        ordering = ["asset", "created_at"]
        # Note: No unique constraint on (asset, asset_type_attribute) because
        # workspace overrides create additional values for the same asset+attribute.
        # Uniqueness is enforced at the application level via WorkspaceAttributeValueOverride.
        indexes = [
            models.Index(
                fields=["asset_type_attribute", "asset"],
                name="idx_attr_asset",
                condition=models.Q(deleted_at__isnull=True),
            ),
        ]

    def __str__(self):
        return f"{self.asset.name}.{self.asset_type_attribute}"


class WorkspaceAttributeValueOverride(SoftDeleteMixin, models.Model):
    """
    Join table linking a workspace-specific attribute value override to its base value.

    This allows assets to have different attribute values per workspace while
    maintaining a clear relationship to the original/global value.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    asset_type_attribute = models.ForeignKey(
        "assets.BaseAssetTypeAttribute",
        on_delete=models.CASCADE,
        related_name="value_overrides",
        help_text="The attribute definition this override applies to",
    )
    base_value = models.ForeignKey(
        BaseAttributeValue,
        on_delete=models.CASCADE,
        related_name="overrides",
        null=True,
        blank=True,
        help_text="The original/global value being overridden",
    )
    override_value = models.ForeignKey(
        BaseAttributeValue,
        on_delete=models.CASCADE,
        related_name="overrides_base",
        help_text="The workspace-specific override value",
    )
    workspace = models.ForeignKey(
        "workspaces.Workspace",
        on_delete=models.CASCADE,
        related_name="attribute_value_overrides",
        help_text="The workspace this override applies to",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta(SoftDeleteMixin.Meta):
        verbose_name = "Workspace Attribute Value Override"
        verbose_name_plural = "Workspace Attribute Value Overrides"
        constraints = [
            # One override per base_value per workspace
            models.UniqueConstraint(
                fields=["base_value", "workspace"],
                name="unique_base_value_workspace_override",
                condition=models.Q(deleted_at__isnull=True),
            ),
            # One override per asset_type_attribute per workspace per asset (via override_value)
            models.UniqueConstraint(
                fields=["override_value"],
                name="unique_override_value",
                condition=models.Q(deleted_at__isnull=True),
            ),
        ]
        indexes = [
            models.Index(fields=["workspace", "asset_type_attribute"]),
            models.Index(fields=["base_value"]),
        ]

    def __str__(self):
        return (
            f"{self.base_value} -> {self.override_value} (Workspace: {self.workspace})"
        )


class TextAttributeValue(BaseAttributeValue):
    """Text attribute value"""

    value = models.TextField(blank=True)


class NumberAttributeValue(BaseAttributeValue):
    """Number attribute value"""

    value = models.FloatField(null=True, blank=True)


class BooleanAttributeValue(BaseAttributeValue):
    """Boolean attribute value"""

    value = models.BooleanField(null=True, blank=True)


class DateAttributeValue(BaseAttributeValue):
    """Date attribute value"""

    value = models.DateField(null=True, blank=True)


class DateTimeAttributeValue(BaseAttributeValue):
    """DateTime attribute value"""

    value = models.DateTimeField(null=True, blank=True)


class JSONAttributeValue(BaseAttributeValue):
    """JSON attribute value"""

    value = models.JSONField(null=True, blank=True)


class LinkAttributeValue(BaseAttributeValue):
    """Link/URL attribute value with optional display text"""

    url = models.URLField(max_length=2000, blank=True)
    display_text = models.CharField(max_length=500, blank=True)

    @property
    def value(self):
        """Return link data as a dict"""
        return {
            "url": self.url,
            "text": self.display_text or self.url,
        }

    @value.setter
    def value(self, val):
        """Accept either a string URL or a dict with url/text"""
        if isinstance(val, dict):
            self.url = val.get("url", "")
            self.display_text = val.get("text", "")
        else:
            self.url = val or ""
            self.display_text = ""


class ChoiceAttributeValue(BaseAttributeValue):
    """Attribute value that references a choice - value comes from the linked choice"""

    choice = models.ForeignKey(
        "assets.AssetTypeAttributeChoice",
        on_delete=models.PROTECT,
        related_name="attribute_values",
    )

    class Meta:
        verbose_name = "Choice Attribute Value"
        verbose_name_plural = "Choice Attribute Values"

    @property
    def value(self):
        """Get value from the linked choice"""
        return self.choice.value

    def clean(self):
        from django.core.exceptions import ValidationError

        super().clean()

        # Ensure choice belongs to the same asset_type_attribute
        if self.choice.asset_type_attribute_id != self.asset_type_attribute_id:
            raise ValidationError(
                {"choice": "Choice must belong to the same AssetTypeAttribute."}
            )
