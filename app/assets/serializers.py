from rest_framework import serializers
from rest_framework_gis.serializers import GeometryField
from .models import (
    AssetType,
    AssetTypeAttribute,
    Asset,
    BaseAttributeValue,
    TextAttributeValue,
    NumberAttributeValue,
    BooleanAttributeValue,
    DateAttributeValue,
    DateTimeAttributeValue,
    JSONAttributeValue,
)


class AssetTypeAttributeSerializer(serializers.ModelSerializer):
    class Meta:
        model = AssetTypeAttribute
        fields = [
            "id",
            "asset_type",
            "name",
            "api_key",
            "attribute_type",
            "is_required",
            "default_value",
            "description",
            "order",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "asset_type", "created_at", "updated_at"]


class AssetAttributeSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="attribute_type_attribute.name", read_only=True)
    api_key = serializers.CharField(
        source="attribute_type_attribute.api_key", read_only=True
    )
    attribute_type = serializers.CharField(
        source="attribute_type_attribute.attribute_type", read_only=True
    )
    value = serializers.SerializerMethodField()
    polymorphic_ctype = serializers.SerializerMethodField()

    class Meta:
        model = BaseAttributeValue
        fields = [
            "id",
            "attribute_type_attribute",
            "name",
            "api_key",
            "attribute_type",
            "value",
            "polymorphic_ctype",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_value(self, obj):
        """Get the value directly from the polymorphic model"""
        return obj.value

    def get_polymorphic_ctype(self, obj):
        """Return the polymorphic content type"""
        return obj.polymorphic_ctype.model


class AssetTypeSerializer(serializers.ModelSerializer):
    attributes = AssetTypeAttributeSerializer(many=True, read_only=True)
    # Remove asset_count to avoid N+1 queries - can be added back with annotation if needed

    class Meta:
        model = AssetType
        fields = [
            "id",
            "name",
            "description",
            "attributes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class AssetTypeSummarySerializer(serializers.ModelSerializer):
    """Lightweight serializer without nested field definitions"""

    # Remove asset_count to avoid N+1 queries - can be added back with annotation if needed

    class Meta:
        model = AssetType
        fields = [
            "id",
            "name",
            "description",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class AssetSerializer(serializers.ModelSerializer):
    asset_type_name = serializers.CharField(source="asset_type.name", read_only=True)
    attributes = serializers.SerializerMethodField()
    geometry = GeometryField(required=False, allow_null=True)
    location = GeometryField(read_only=True)

    class Meta:
        model = Asset
        fields = [
            "id",
            "asset_type",
            "asset_type_name",
            "name",
            "description",
            "geometry",
            "location",
            "h3_index",
            "attributes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "h3_index", "created_at", "updated_at", "location"]

    def get_attributes(self, obj):
        """Get attributes as a dictionary using prefetched data"""
        # Use prefetched attributes if available
        attributes = getattr(obj, "attributes", None)
        values = {}
        for field_value in attributes.all():
            # attribute_type_attribute should be prefetched
            api_key = getattr(field_value.attribute_type_attribute, "api_key", None)
            if api_key:
                values[api_key] = field_value.value
        return values

    def create(self, validated_data):
        """Create asset and its attributes"""
        # attributes will come from request data, not validated_data
        # since it's now a SerializerMethodField (read-only)
        asset = Asset.objects.create(**validated_data)

        # Handle attributes from initial_data if provided
        if "attributes" in self.initial_data:
            attributes = self.initial_data["attributes"]
            for api_key, value in attributes.items():
                try:
                    field_def = asset.asset_type.attributes.get(api_key=api_key)

                    # Get the correct model class for this field type
                    model_class = {
                        "text": TextAttributeValue,
                        "number": NumberAttributeValue,
                        "boolean": BooleanAttributeValue,
                        "date": DateAttributeValue,
                        "datetime": DateTimeAttributeValue,
                        "json": JSONAttributeValue,
                    }.get(field_def.attribute_type, TextAttributeValue)

                    model_class.objects.create(
                        asset=asset, attribute_type_attribute=field_def, value=value
                    )
                except AssetTypeAttribute.DoesNotExist:
                    pass  # Skip unknown fields

        return asset

    def update(self, instance, validated_data):
        """Update asset and its attributes"""
        # Update basic fields
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()

        # Update attributes if provided in initial_data
        if "attributes" in self.initial_data:
            attributes = self.initial_data["attributes"]
            for api_key, value in attributes.items():
                try:
                    instance.set_attribute(api_key, value)
                except AssetAttributeDefinition.DoesNotExist:
                    pass  # Skip unknown fields

        return instance

    def validate(self, data):
        """Validate attributes on create/update"""
        # Check if attributes are in initial_data
        if "attributes" in self.initial_data and "asset_type" in data:
            attributes = self.initial_data["attributes"]
        if attributes and "asset_type" in data:
            # Validate required fields
            field_defs = AssetTypeAttribute.objects.filter(
                asset_type=data["asset_type"]
            )
            errors = {}
            for field_def in field_defs:
                value = attributes.get(field_def.api_key)
                if field_def.is_required and value is None:
                    errors[field_def.api_key] = "This field is required"
            if errors:
                raise serializers.ValidationError({"attributes": errors})
        return data
