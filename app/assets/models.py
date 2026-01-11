import math
from django.db import models
from django.contrib.gis.db import models as gis_models
from polymorphic.models import PolymorphicModel
import uuid
import pgtrigger
from core.models.soft_delete import (
    SoftDeleteMixin,
    PolymorphicSoftDeleteMixin,
)


class AssetType(SoftDeleteMixin):
    """Defines a type of asset with its field schema"""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        "workspaces.Workspace", on_delete=models.CASCADE, related_name="asset_types"
    )
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta(SoftDeleteMixin.Meta):
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "name"],
                name="unique_workspace_asset_type_name",
                condition=models.Q(deleted_at__isnull=True),
            ),
        ]
        ordering = ["workspace", "name"]

    def __str__(self):
        return f"{self.name} ({self.workspace.name})"


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
        AssetType, on_delete=models.CASCADE, related_name="attributes"
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


class Asset(SoftDeleteMixin):
    """An asset instance with dynamic fields based on its type"""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    asset_type = models.ForeignKey(
        AssetType, on_delete=models.CASCADE, related_name="assets"
    )
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    geometry = gis_models.GeometryField(null=True, blank=True, srid=4326)
    location = gis_models.PointField(
        null=True, blank=True, srid=4326, help_text="Centroid of geometry"
    )
    h3_index = models.CharField(
        max_length=20,  # H3 indexes can be up to 16 chars, 20 for safety
        blank=True,
        db_index=True,
        help_text="H3 index of the geometry centroid",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta(SoftDeleteMixin.Meta):
        ordering = ["-created_at"]
        triggers = [
            pgtrigger.Trigger(
                name="001_update_location_on_geometry_change",
                operation=pgtrigger.Update | pgtrigger.Insert,
                when=pgtrigger.Before,
                func="NEW.location = ST_Centroid(NEW.geometry); RETURN NEW;",
            ),
            pgtrigger.Trigger(
                name="002_update_h3_index_on_location_change",
                operation=pgtrigger.Update | pgtrigger.Insert,
                when=pgtrigger.Before,
                func="""
                IF NEW.location IS NOT NULL THEN
                        NEW.h3_index = h3_latlng_to_cell(point(ST_Y(NEW.location), ST_X(NEW.location)), 15);
                ELSE
                    NEW.h3_index = '';
                END IF;
                RETURN NEW;
                """,
            ),
        ]

    def __str__(self):
        return f"{self.name} ({self.asset_type.name})"

    def set_attribute(self, api_key, value):
        """Set a specific attribute value by api_key"""
        field_def = self.asset_type.field_definitions.get(api_key=api_key)

        # Determine the appropriate model class based on field type
        model_class = {
            "text": TextAttributeValue,
            "number": NumberAttributeValue,
            "boolean": BooleanAttributeValue,
            "date": DateAttributeValue,
            "datetime": DateTimeAttributeValue,
            "json": JSONAttributeValue,
        }.get(field_def.field_type, TextAttributeValue)

        # Get or create the field value with the correct polymorphic type
        try:
            field_value = self.attributes.get(field_definition=field_def)
            # If type changed, delete old and create new
            if not isinstance(field_value, model_class):
                field_value.delete()
                field_value = model_class.objects.create(
                    asset=self, field_definition=field_def, value=value
                )
            else:
                field_value.value = value
                field_value.save()
        except BaseAttributeValue.DoesNotExist:
            field_value = model_class.objects.create(
                asset=self, field_definition=field_def, value=value
            )

        return field_value

    def validate_fields(self):
        """Validate attributes against asset type definitions"""
        errors = {}
        existing_values = {
            fv.attribute_type_attribute.api_key: fv
            for fv in self.attributes.select_related("attribute_type_attribute").all()
        }

        for field_def in self.asset_type.attributes.all():
            field_value = existing_values.get(field_def.api_key)
            value = field_value.value if field_value else None

            # Check required fields
            if field_def.is_required and value is None:
                errors[field_def.api_key] = "This field is required"

        return errors


class BaseAttributeValue(PolymorphicSoftDeleteMixin, PolymorphicModel):
    """Base polymorphic model for attribute values"""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    asset = models.ForeignKey(
        Asset, on_delete=models.CASCADE, related_name="attributes"
    )
    asset_type_attribute = models.ForeignKey(
        AssetTypeAttribute, on_delete=models.CASCADE, related_name="values"
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
