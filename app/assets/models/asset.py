from django.db import models
from django.contrib.gis.db import models as gis_models
import uuid
import pgtrigger
from core.models.soft_delete import SoftDeleteMixin


class Asset(SoftDeleteMixin):
    """An asset instance with dynamic fields based on its type"""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    asset_type = models.ForeignKey(
        "assets.AssetType", on_delete=models.CASCADE, related_name="assets"
    )
    parent = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="children",
        help_text="Parent asset for hierarchical relationships",
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
    default_folder = models.ForeignKey(
        "files.Directory",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assets_with_default",
        help_text="Default folder for file uploads related to this asset",
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
            pgtrigger.Trigger(
                name="003_prevent_circular_parent",
                operation=pgtrigger.Update | pgtrigger.Insert,
                when=pgtrigger.Before,
                func="""
                DECLARE
                    current_parent_id UUID;
                    max_depth INT := 100;
                    depth INT := 0;
                BEGIN
                    -- Skip if no parent set
                    IF NEW.parent_id IS NULL THEN
                        RETURN NEW;
                    END IF;

                    -- Check self-reference
                    IF NEW.parent_id = NEW.id THEN
                        RAISE EXCEPTION 'An asset cannot be its own parent';
                    END IF;

                    -- Walk up the parent chain to detect cycles
                    current_parent_id := NEW.parent_id;
                    WHILE current_parent_id IS NOT NULL AND depth < max_depth LOOP
                        -- Check if we've looped back to the asset being saved
                        IF current_parent_id = NEW.id THEN
                            RAISE EXCEPTION 'Circular parent relationship detected';
                        END IF;

                        -- Move to next parent
                        SELECT parent_id INTO current_parent_id
                        FROM assets_asset
                        WHERE id = current_parent_id;

                        depth := depth + 1;
                    END LOOP;

                    IF depth >= max_depth THEN
                        RAISE EXCEPTION 'Parent hierarchy too deep (max % levels)', max_depth;
                    END IF;

                    RETURN NEW;
                END;
                """,
            ),
        ]

    def __str__(self):
        return f"{self.name} ({self.asset_type.name})"

    def set_attribute(self, api_key, value):
        """Set a specific attribute value by api_key"""
        from .attribute_value import (
            TextAttributeValue,
            NumberAttributeValue,
            BooleanAttributeValue,
            DateAttributeValue,
            DateTimeAttributeValue,
            JSONAttributeValue,
            ChoiceAttributeValue,
            BaseAttributeValue,
        )

        field_def = self.asset_type.attributes.get(api_key=api_key)

        # Check if this attribute has choices defined
        if field_def.choices.exists():
            # Find matching choice by value
            choice = field_def.choices.filter(value=value).first()
            if not choice:
                raise ValueError(f"Invalid choice value: {value}")

            # Get or create the ChoiceAttributeValue
            try:
                field_value = self.attributes.get(asset_type_attribute=field_def)
                if isinstance(field_value, ChoiceAttributeValue):
                    field_value.choice = choice
                    field_value.save()
                else:
                    # Type changed from non-choice to choice
                    field_value.delete()
                    field_value = ChoiceAttributeValue.objects.create(
                        asset=self, asset_type_attribute=field_def, choice=choice
                    )
            except BaseAttributeValue.DoesNotExist:
                field_value = ChoiceAttributeValue.objects.create(
                    asset=self, asset_type_attribute=field_def, choice=choice
                )
        else:
            # Determine the appropriate model class based on field type
            model_class = {
                "text": TextAttributeValue,
                "number": NumberAttributeValue,
                "boolean": BooleanAttributeValue,
                "date": DateAttributeValue,
                "datetime": DateTimeAttributeValue,
                "json": JSONAttributeValue,
            }.get(field_def.attribute_type, TextAttributeValue)

            # Get or create the field value with the correct polymorphic type
            try:
                field_value = self.attributes.get(asset_type_attribute=field_def)
                # If type changed, delete old and create new
                if not isinstance(field_value, model_class):
                    field_value.delete()
                    field_value = model_class.objects.create(
                        asset=self, asset_type_attribute=field_def, value=value
                    )
                else:
                    field_value.value = value
                    field_value.save()
            except BaseAttributeValue.DoesNotExist:
                field_value = model_class.objects.create(
                    asset=self, asset_type_attribute=field_def, value=value
                )

        return field_value

    def validate_fields(self):
        """Validate attributes against asset type definitions"""
        errors = {}
        existing_values = {
            fv.asset_type_attribute.api_key: fv
            for fv in self.attributes.select_related("asset_type_attribute").all()
        }

        for field_def in self.asset_type.attributes.all():
            field_value = existing_values.get(field_def.api_key)
            value = field_value.value if field_value else None

            # Check required fields
            if field_def.is_required and value is None:
                errors[field_def.api_key] = "This field is required"

        return errors
