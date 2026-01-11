from django.db import models
import uuid
import pgtrigger
from core.models.soft_delete import SoftDeleteMixin


class AssetTypeAttribute(SoftDeleteMixin):
    """Defines a custom field for an asset type"""

    FIELD_TYPES = [
        ("text", "Text"),
        ("number", "Number"),
        ("boolean", "Boolean"),
        ("date", "Date"),
        ("datetime", "DateTime"),
        ("json", "JSON"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    asset_type = models.ForeignKey(
        "assets.AssetType", on_delete=models.CASCADE, related_name="attributes"
    )
    name = models.CharField(max_length=100)
    api_key = models.CharField(
        max_length=100, help_text="Key used in API serialization"
    )
    attribute_type = models.CharField(max_length=20, choices=FIELD_TYPES)
    is_required = models.BooleanField(default=False)
    default_value = models.JSONField(null=True, blank=True)
    description = models.TextField(blank=True)
    order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta(SoftDeleteMixin.Meta):
        ordering = ["asset_type", "order", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["asset_type", "name"],
                name="unique_asset_type_name",
                condition=models.Q(deleted_at__isnull=True),
            ),
            models.UniqueConstraint(
                fields=["asset_type", "api_key"],
                name="unique_asset_type_api_key",
                condition=models.Q(deleted_at__isnull=True),
            ),
            models.UniqueConstraint(
                fields=["asset_type", "order"],
                name="unique_asset_type_order",
                condition=models.Q(deleted_at__isnull=True),
            ),
        ]
        triggers = [
            pgtrigger.Trigger(
                name="01_update_attribute_orders_after_delete",
                operation=pgtrigger.Delete,
                when=pgtrigger.After,
                func="""
                    -- Use negative temporary values to avoid unique constraint violations
                    UPDATE assets_assettypeattribute 
                    SET "order" = -("order" + 1000)
                    WHERE asset_type_id = OLD.asset_type_id 
                    AND "order" > OLD."order";
                    
                    -- Now update to final values (decrement by 1)
                    UPDATE assets_assettypeattribute 
                    SET "order" = -("order" + 1000) - 1
                    WHERE asset_type_id = OLD.asset_type_id 
                    AND "order" < -1000;
                    
                    RETURN OLD;
                """,
            ),
        ]

    def __str__(self):
        return f"{self.asset_type.name}.{self.name}"
