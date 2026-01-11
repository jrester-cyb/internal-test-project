from django.db import models
from polymorphic.models import PolymorphicModel
import uuid
from core.models.soft_delete import PolymorphicSoftDeleteMixin


class BaseAttributeValue(PolymorphicSoftDeleteMixin, PolymorphicModel):
    """Base polymorphic model for attribute values"""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    asset = models.ForeignKey(
        "assets.Asset", on_delete=models.CASCADE, related_name="attributes"
    )
    asset_type_attribute = models.ForeignKey(
        "assets.AssetTypeAttribute", on_delete=models.CASCADE, related_name="values"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta(PolymorphicSoftDeleteMixin.Meta):
        ordering = ["asset", "asset_type_attribute__order"]
        constraints = [
            models.UniqueConstraint(
                fields=["asset", "asset_type_attribute"],
                name="unique_asset_asset_type_attribute",
                condition=models.Q(deleted_at__isnull=True),
            ),
        ]

    def __str__(self):
        return f"{self.asset.name}.{self.asset_type_attribute}"


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
