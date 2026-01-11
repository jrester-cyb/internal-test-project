from rest_framework import serializers
from rest_framework_gis.serializers import GeometryField
from .models import (
    AssetType,
    AssetTypeAttribute,
    AssetTypeAttributeChoice,
    Asset,
    BaseAttributeValue,
    TextAttributeValue,
    NumberAttributeValue,
    BooleanAttributeValue,
    DateAttributeValue,
    DateTimeAttributeValue,
    JSONAttributeValue,
    ChoiceAttributeValue,
)


class AssetTypeAttributeChoiceSerializer(serializers.ModelSerializer):
    value = serializers.SerializerMethodField()

    class Meta:
        model = AssetTypeAttributeChoice
        fields = [
            "id",
            "value",
            "label",
            "icon",
            "color",
            "order",
        ]

    def get_value(self, obj):
        """Get the value from the polymorphic choice model"""
        # Handle case where base class is returned instead of subclass
        if hasattr(obj, "value"):
            return obj.value
        # Try to get the real instance if polymorphic didn't resolve
        try:
            real_obj = AssetTypeAttributeChoice.objects.get_real_instances([obj])[0]
            return real_obj.value if hasattr(real_obj, "value") else None
        except (IndexError, AttributeError):
            return None


class AssetTypeAttributeChoiceWriteSerializer(serializers.Serializer):
    """Serializer for creating/updating attribute choices with typed values"""

    value = serializers.JSONField(
        help_text="The choice value (type should match attribute type)"
    )
    label = serializers.CharField(max_length=255)
    icon = serializers.CharField(
        max_length=100, required=False, allow_blank=True, default=""
    )
    color = serializers.CharField(
        max_length=50, required=False, allow_blank=True, default=""
    )
    order = serializers.IntegerField(required=False, default=0)

    def create(self, validated_data):
        from .models import (
            TextAttributeChoice,
            NumberAttributeChoice,
            BooleanAttributeChoice,
            DateAttributeChoice,
            DateTimeAttributeChoice,
            JSONAttributeChoice,
        )

        asset_type_attribute = validated_data.pop("asset_type_attribute")
        value = validated_data.pop("value")

        # Get the correct choice model based on attribute type
        choice_model = {
            "text": TextAttributeChoice,
            "number": NumberAttributeChoice,
            "boolean": BooleanAttributeChoice,
            "date": DateAttributeChoice,
            "datetime": DateTimeAttributeChoice,
            "json": JSONAttributeChoice,
        }.get(asset_type_attribute.attribute_type, TextAttributeChoice)

        return choice_model.objects.create(
            asset_type_attribute=asset_type_attribute,
            value=value,
            **validated_data,
        )

    def update(self, instance, validated_data):
        value = validated_data.pop("value", None)
        if value is not None:
            instance.value = value
        for field, val in validated_data.items():
            setattr(instance, field, val)
        instance.save()
        return instance


class AssetTypeAttributeSerializer(serializers.ModelSerializer):
    asset_count = serializers.SerializerMethodField()

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
            "asset_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "asset_type", "created_at", "updated_at"]

    def get_asset_count(self, obj):
        """Count distinct assets that have a value for this attribute"""
        return obj.values.values("asset").distinct().count()


class AssetAttributeSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="asset_type_attribute.name", read_only=True)
    api_key = serializers.CharField(
        source="asset_type_attribute.api_key", read_only=True
    )
    attribute_type = serializers.CharField(
        source="asset_type_attribute.attribute_type", read_only=True
    )
    value = serializers.SerializerMethodField()
    choice = serializers.SerializerMethodField()
    polymorphic_ctype = serializers.SerializerMethodField()

    class Meta:
        model = BaseAttributeValue
        fields = [
            "id",
            "asset_type_attribute",
            "name",
            "api_key",
            "attribute_type",
            "value",
            "choice",
            "polymorphic_ctype",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_value(self, obj):
        """Get the value directly from the polymorphic model"""
        return obj.value

    def get_choice(self, obj):
        """Get the linked choice if one exists"""
        try:
            choice_link = obj.choice_link
            choice = choice_link.choice
            return {
                "id": str(choice.id),
                "label": choice.label,
                "icon": choice.icon,
                "color": choice.color,
            }
        except AttributeValueChoiceLink.DoesNotExist:
            return None

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
            # asset_type_attribute should be prefetched
            api_key = getattr(field_value.asset_type_attribute, "api_key", None)
            if api_key:
                # All attribute values have .value (ChoiceAttributeValue has it as property)
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

                    # Check if this attribute has choices defined
                    if field_def.choices.exists():
                        # Find matching choice by value
                        choice = field_def.choices.filter(value=value).first()
                        if choice:
                            ChoiceAttributeValue.objects.create(
                                asset=asset,
                                asset_type_attribute=field_def,
                                choice=choice,
                            )
                        else:
                            raise serializers.ValidationError(
                                {f"attributes.{api_key}": f"Invalid choice: {value}"}
                            )
                    else:
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
                            asset=asset, asset_type_attribute=field_def, value=value
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
                except AssetTypeAttribute.DoesNotExist:
                    pass  # Skip unknown fields
                except ValueError as e:
                    raise serializers.ValidationError({f"attributes.{api_key}": str(e)})

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
