from django.db import models
from polymorphic.models import PolymorphicModel
import uuid
from core.models.soft_delete import PolymorphicSoftDeleteMixin


class AssetTypeAttributeChoice(PolymorphicSoftDeleteMixin, PolymorphicModel):
    """Base polymorphic model for attribute choices - value type matches the attribute's type"""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    asset_type_attribute = models.ForeignKey(
        "assets.AssetTypeAttribute", on_delete=models.CASCADE, related_name="choices"
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
