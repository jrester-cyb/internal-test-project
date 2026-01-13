from rest_framework import serializers
from rest_framework_gis.serializers import GeometryField
from .models import (
    AssetType,
    WorkspaceAssetType,
    BaseAssetTypeAttribute,
    GlobalAssetTypeAttribute,
    WorkspaceAttributeOverride,
    WorkspaceHiddenAttribute,
    WorkspaceExtensionAttribute,
    AssetCustomAttribute,
    AssetTypeAttributeChoice,
    Asset,
    WorkspaceAsset,
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


class GlobalAssetTypeAttributeSerializer(serializers.ModelSerializer):
    """Serializer for global (base) asset type attributes."""

    asset_count = serializers.IntegerField(read_only=True, required=False, default=0)

    class Meta:
        model = GlobalAssetTypeAttribute
        fields = [
            "id",
            "asset_type",
            "name",
            "api_key",
            "attribute_type",
            "is_required",
            "default_value",
            "description",
            "tags",
            "order",
            "asset_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "asset_type", "created_at", "updated_at"]


class WorkspaceAttributeOverrideSerializer(serializers.ModelSerializer):
    """Serializer for workspace-specific attribute overrides."""

    # Effective values (override or fall back to base)
    effective_name = serializers.SerializerMethodField()
    effective_is_required = serializers.SerializerMethodField()
    effective_default_value = serializers.SerializerMethodField()
    effective_description = serializers.SerializerMethodField()
    effective_tags = serializers.SerializerMethodField()
    effective_order = serializers.SerializerMethodField()
    # From base attribute (read-only)
    api_key = serializers.CharField(source="base_attribute.api_key", read_only=True)
    attribute_type = serializers.CharField(
        source="base_attribute.attribute_type", read_only=True
    )
    workspace_name = serializers.CharField(
        source="workspace.name", read_only=True, allow_null=True
    )

    class Meta:
        model = WorkspaceAttributeOverride
        fields = [
            "id",
            "asset_type",
            "base_attribute",
            "workspace",
            "workspace_name",
            "api_key",
            "attribute_type",
            # Override fields (nullable)
            "name",
            "is_required",
            "default_value",
            "description",
            "tags",
            "order",
            # Effective values
            "effective_name",
            "effective_is_required",
            "effective_default_value",
            "effective_description",
            "effective_tags",
            "effective_order",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "asset_type",
            "base_attribute",
            "workspace",
            "created_at",
            "updated_at",
        ]

    def get_effective_name(self, obj):
        return obj.get_effective_value("name")

    def get_effective_is_required(self, obj):
        return obj.get_effective_value("is_required")

    def get_effective_default_value(self, obj):
        return obj.get_effective_value("default_value")

    def get_effective_description(self, obj):
        return obj.get_effective_value("description")

    def get_effective_tags(self, obj):
        return obj.get_effective_value("tags")

    def get_effective_order(self, obj):
        return obj.get_effective_value("order")


class WorkspaceHiddenAttributeSerializer(serializers.ModelSerializer):
    """Serializer for hidden attribute records."""

    base_attribute_name = serializers.CharField(
        source="base_attribute.name", read_only=True
    )
    base_attribute_api_key = serializers.CharField(
        source="base_attribute.api_key", read_only=True
    )
    workspace_name = serializers.CharField(source="workspace.name", read_only=True)

    class Meta:
        model = WorkspaceHiddenAttribute
        fields = [
            "id",
            "asset_type",
            "base_attribute",
            "base_attribute_name",
            "base_attribute_api_key",
            "workspace",
            "workspace_name",
            "created_at",
        ]
        read_only_fields = ["id", "asset_type", "created_at"]


class WorkspaceExtensionAttributeSerializer(serializers.ModelSerializer):
    """Serializer for workspace-specific extension attributes."""

    workspace_name = serializers.CharField(
        source="workspace.name", read_only=True, allow_null=True
    )
    asset_count = serializers.IntegerField(read_only=True, required=False, default=0)

    class Meta:
        model = WorkspaceExtensionAttribute
        fields = [
            "id",
            "asset_type",
            "workspace",
            "workspace_name",
            "name",
            "api_key",
            "attribute_type",
            "is_required",
            "is_hidden",
            "default_value",
            "description",
            "tags",
            "order",
            "asset_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "asset_type", "workspace", "created_at", "updated_at"]


class MergedAttributeSerializer(serializers.Serializer):
    """
    Unified serializer for presenting attributes in a merged view.
    Handles all attribute types and presents them with a consistent interface.
    """

    id = serializers.UUIDField()
    asset_type = serializers.UUIDField(source="asset_type_id")
    workspace = serializers.UUIDField(source="workspace_id", allow_null=True)
    workspace_name = serializers.CharField(allow_null=True)

    # Attribute type info
    attribute_kind = (
        serializers.CharField()
    )  # 'global', 'override', 'extension', 'hidden'
    is_override = serializers.BooleanField()
    is_extension = serializers.BooleanField()
    is_hidden = serializers.BooleanField()
    base_attribute_id = serializers.UUIDField(allow_null=True)

    # Core fields
    name = serializers.CharField()
    api_key = serializers.CharField()
    attribute_type = serializers.CharField()
    is_required = serializers.BooleanField()
    default_value = serializers.JSONField(allow_null=True)
    description = serializers.CharField(allow_blank=True)
    tags = serializers.ListField(child=serializers.CharField(), default=list)
    order = serializers.IntegerField()

    # Timestamps
    created_at = serializers.DateTimeField()
    updated_at = serializers.DateTimeField()


class AssetCustomAttributeSerializer(serializers.ModelSerializer):
    """Serializer for per-asset custom attributes."""

    workspace_name = serializers.CharField(
        source="workspace.name", read_only=True, allow_null=True
    )

    class Meta:
        model = AssetCustomAttribute
        fields = [
            "id",
            "asset",
            "workspace",
            "workspace_name",
            "name",
            "api_key",
            "attribute_type",
            "value",
            "description",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


# Legacy alias for backwards compatibility during migration
AssetTypeAttributeSerializer = GlobalAssetTypeAttributeSerializer


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
    organization_name = serializers.CharField(
        source="organization.name", read_only=True
    )
    # Remove asset_count to avoid N+1 queries - can be added back with annotation if needed

    class Meta:
        model = AssetType
        fields = [
            "id",
            "organization",
            "organization_name",
            "name",
            "description",
            "attributes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "organization", "created_at", "updated_at"]


class AssetTypeSummarySerializer(serializers.ModelSerializer):
    """Lightweight serializer without nested field definitions"""

    organization_name = serializers.CharField(
        source="organization.name", read_only=True
    )
    # Remove asset_count to avoid N+1 queries - can be added back with annotation if needed

    class Meta:
        model = AssetType
        fields = [
            "id",
            "organization",
            "organization_name",
            "name",
            "description",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "organization", "created_at", "updated_at"]


class WorkspaceAssetTypeSerializer(serializers.ModelSerializer):
    """Serializer for WorkspaceAssetType join table"""

    asset_type_detail = AssetTypeSummarySerializer(source="asset_type", read_only=True)
    workspace_name = serializers.CharField(source="workspace.name", read_only=True)

    class Meta:
        model = WorkspaceAssetType
        fields = [
            "id",
            "workspace",
            "workspace_name",
            "asset_type",
            "asset_type_detail",
            "is_owner",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class WorkspaceAssetTypeWriteSerializer(serializers.ModelSerializer):
    """Serializer for creating/updating WorkspaceAssetType"""

    class Meta:
        model = WorkspaceAssetType
        fields = [
            "id",
            "workspace",
            "asset_type",
            "is_owner",
        ]
        read_only_fields = ["id"]


class AssetSerializer(serializers.ModelSerializer):
    asset_type_name = serializers.CharField(source="asset_type.name", read_only=True)
    organization_name = serializers.CharField(
        source="organization.name", read_only=True
    )
    attributes = serializers.SerializerMethodField()
    geometry = GeometryField(required=False, allow_null=True)
    location = GeometryField(read_only=True)
    parent = serializers.PrimaryKeyRelatedField(
        queryset=Asset.objects.all(),
        required=False,
        allow_null=True,
        help_text="Parent asset ID for hierarchical relationships",
    )
    api_url = serializers.SerializerMethodField()

    class Meta:
        model = Asset
        fields = [
            "id",
            "organization",
            "organization_name",
            "asset_type",
            "asset_type_name",
            "parent",
            "name",
            "description",
            "geometry",
            "location",
            "h3_index",
            "attributes",
            "created_at",
            "updated_at",
            "api_url",
        ]
        read_only_fields = [
            "id",
            "organization",
            "h3_index",
            "created_at",
            "updated_at",
            "location",
        ]

    def get_api_url(self, obj):
        """Return the API URL for this asset based on current request context"""
        request = self.context.get("request")
        if request:
            # Get workspace_pk from the view kwargs if available (nested route)
            workspace_pk = self.context.get("view").kwargs.get("workspace_pk")
            if workspace_pk:
                return request.build_absolute_uri(
                    f"/api/workspaces/{workspace_pk}/assets/{obj.id}/"
                )
            # Fallback to top-level route
            return request.build_absolute_uri(f"/api/assets/{obj.id}/")
        return None

    def get_attributes(self, obj):
        """Get attributes as a dictionary using prefetched data"""
        # Use prefetched attributes if available
        attributes = getattr(obj, "attributes", None)
        values = {}
        for field_value in attributes.all():
            # asset_type_attribute should be prefetched
            api_key = getattr(field_value.asset_type_attribute, "api_key", None)
            if api_key:
                # Always get the concrete instance to ensure we have the value field
                concrete_instance = field_value.get_real_instance()
                if hasattr(concrete_instance, "value"):
                    values[api_key] = concrete_instance.value
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
        attributes = None
        if "attributes" in self.initial_data and "asset_type" in data:
            attributes = self.initial_data["attributes"]
        if attributes and "asset_type" in data:
            # Get workspace from context if available
            workspace = self.context.get("workspace")
            # Validate required fields - use merged attributes for workspace
            if workspace:
                field_defs = data["asset_type"].get_attributes_for_workspace(workspace)
            else:
                field_defs = AssetTypeAttribute.objects.filter(
                    asset_type=data["asset_type"],
                    workspace__isnull=True,  # Only base attributes if no workspace context
                )
            errors = {}
            for field_def in field_defs:
                value = attributes.get(field_def.api_key)
                if field_def.is_required and value is None:
                    errors[field_def.api_key] = "This field is required"
            if errors:
                raise serializers.ValidationError({"attributes": errors})
        return data


class WorkspaceAssetSerializer(serializers.ModelSerializer):
    """Serializer for WorkspaceAsset join table"""

    asset_detail = AssetSerializer(source="asset", read_only=True)
    workspace_name = serializers.CharField(source="workspace.name", read_only=True)
    added_by_username = serializers.CharField(
        source="added_by.username", read_only=True, allow_null=True
    )

    class Meta:
        model = WorkspaceAsset
        fields = [
            "id",
            "workspace",
            "workspace_name",
            "asset",
            "asset_detail",
            "added_at",
            "added_by",
            "added_by_username",
        ]
        read_only_fields = ["id", "added_at"]


class WorkspaceAssetWriteSerializer(serializers.ModelSerializer):
    """Serializer for creating WorkspaceAsset links"""

    class Meta:
        model = WorkspaceAsset
        fields = [
            "id",
            "workspace",
            "asset",
            "added_by",
        ]
        read_only_fields = ["id"]
