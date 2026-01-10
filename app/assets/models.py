from django.db import models
from django.contrib.gis.db import models as gis_models
from polymorphic.models import PolymorphicModel
import uuid
import geohash2
import pgtrigger


class AssetType(models.Model):
    """Defines a type of asset with its field schema"""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class AssetAttributeDefinition(models.Model):
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
        AssetType, on_delete=models.CASCADE, related_name="field_definitions"
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

    class Meta:
        ordering = ["asset_type", "order", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["asset_type", "name"],
                name="unique_asset_type_name",
            ),
            models.UniqueConstraint(
                fields=["asset_type", "api_key"],
                name="unique_asset_type_api_key",
            ),
            models.UniqueConstraint(
                fields=["asset_type", "order"],
                name="unique_asset_type_order",
            ),
        ]

    def __str__(self):
        return f"{self.asset_type.name}.{self.name}"


class Asset(models.Model):
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
    geohash = models.CharField(
        max_length=12,
        blank=True,
        db_index=True,
        help_text="Geohash of the geometry centroid",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        triggers = [
            pgtrigger.Trigger(
                name="update_location_on_geometry_change",
                operation=pgtrigger.Update | pgtrigger.Insert,
                when=pgtrigger.Before,
                func="NEW.location = ST_Centroid(NEW.geometry); RETURN NEW;",
            )
        ]

    def __str__(self):
        return f"{self.name} ({self.asset_type.name})"

    def save(self, *args, **kwargs):
        """Auto-generate geohash from geometry"""
        if self.geometry:
            # Get centroid for geohash calculation
            centroid = self.geometry.centroid
            if centroid:
                self.geohash = geohash2.encode(centroid.y, centroid.x, precision=9)
                self.location = centroid
            else:
                self.geohash = ""
                self.location = None
        else:
            self.geohash = ""
            self.location = None
        super().save(*args, **kwargs)

    def get_attribute(self, api_key):
        """Get a specific attribute value by api_key"""
        try:
            field_value = self.attributes.get(field_definition__api_key=api_key)
            return field_value.value
        except BaseAttributeValue.DoesNotExist:
            return None

    def get_all_attributes(self):
        """Get all attributes as a dictionary using api_key"""
        values = {}
        for field_value in self.attributes.select_related("field_definition").all():
            values[field_value.field_definition.api_key] = field_value.value
        return values

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
            fv.field_definition.api_key: fv
            for fv in self.attributes.select_related("field_definition").all()
        }

        for field_def in self.asset_type.field_definitions.all():
            field_value = existing_values.get(field_def.api_key)
            value = field_value.value if field_value else None

            # Check required fields
            if field_def.is_required and value is None:
                errors[field_def.api_key] = "This field is required"

        return errors


class BaseAttributeValue(PolymorphicModel):
    """Base polymorphic model for attribute values"""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    asset = models.ForeignKey(
        Asset, on_delete=models.CASCADE, related_name="attributes"
    )
    field_definition = models.ForeignKey(
        AssetAttributeDefinition, on_delete=models.CASCADE, related_name="values"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["asset", "field_definition__order"]
        constraints = [
            models.UniqueConstraint(
                fields=["asset", "field_definition"],
                name="unique_asset_field_definition",
            ),
        ]

    def __str__(self):
        return f"{self.asset.name}.{self.field_definition}"


class TextAttributeValue(BaseAttributeValue):
    """Text attribute value"""

    value = models.TextField(null=True, blank=True)


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
