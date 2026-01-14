from rest_framework import serializers
from rest_framework_gis.serializers import GeometryField
from silk.profiling.profiler import silk_profile
from .models import (
    AssetType,
    WorkspaceAssetType,
    BaseAssetTypeAttribute,
    GlobalAssetTypeAttribute,
    WorkspaceOverrideAssetTypeAttribute,
    WorkspaceHiddenAttribute,
    WorkspaceLocalAssetTypeAttribute,
    WorkspaceAssetTypeConfig,
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


class AssetTypeAttributeSerializer(serializers.ModelSerializer):
    """
    Polymorphic serializer for all asset type attribute models.
    Automatically selects the correct serializer based on the instance type.
    """

    class Meta:
        model = BaseAssetTypeAttribute
        # Only include fields that exist on the base model
        # The to_representation method handles the polymorphic child serialization
        fields = [
            "id",
            "asset_type",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "asset_type", "created_at", "updated_at"]

    def to_representation(self, instance):
        """Route to the appropriate serializer based on instance type."""
        # Capture effective_order from annotation before processing
        effective_order = getattr(instance, "effective_order", None)

        # The instance should already be the real polymorphic type from the queryset
        # We don't need to call get_real_instance() which would cause extra queries
        # Just use the instance directly since BaseAssetTypeAttribute.objects returns
        # polymorphic instances automatically

        # Select serializer based on instance type
        if isinstance(instance, WorkspaceOverrideAssetTypeAttribute):
            serializer = WorkspaceOverrideAssetTypeAttributeSerializer(
                instance, context=self.context
            )
        elif isinstance(instance, WorkspaceLocalAssetTypeAttribute):
            serializer = WorkspaceLocalAssetTypeAttributeSerializer(
                instance, context=self.context
            )
        elif isinstance(instance, WorkspaceHiddenAttribute):
            serializer = WorkspaceHiddenAttributeSerializer(
                instance, context=self.context
            )
        elif isinstance(instance, GlobalAssetTypeAttribute):
            serializer = GlobalAssetTypeAttributeSerializer(
                instance, context=self.context
            )
        else:
            # Fallback to base serialization
            return super().to_representation(instance)

        data = serializer.data

        # Add effective_order to the output if it was annotated
        if effective_order is not None:
            data["order"] = effective_order

        return data


class GlobalAssetTypeAttributeSerializer(serializers.ModelSerializer):
    """Serializer for global (base) asset type attributes."""

    asset_count_url = serializers.SerializerMethodField()
    is_hidden = serializers.SerializerMethodField()
    organization_id = serializers.SerializerMethodField()
    api_url = serializers.SerializerMethodField()

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
            "asset_count_url",
            "is_hidden",
            "organization_id",
            "api_url",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "asset_type", "created_at", "updated_at"]

    def get_asset_count_url(self, obj):
        """Get URL to the asset-count endpoint."""
        request = self.context.get("request")
        if request:
            from django.urls import reverse

            # Build the URL based on whether we have workspace context
            workspace_id = request.parser_context.get("kwargs", {}).get("workspace_pk")

            # If no workspace in URL params, check query params (for organization endpoint)
            if not workspace_id:
                workspace_id = request.query_params.get("workspace_id")

            if workspace_id:
                return request.build_absolute_uri(
                    reverse(
                        "workspace-assettype-attribute-asset-count",
                        kwargs={
                            "workspace_pk": workspace_id,
                            "assettype_pk": obj.asset_type_id,
                            "pk": obj.id,
                        },
                    )
                )
        return None

    def get_is_hidden(self, obj):
        """Check if this attribute is hidden in the current workspace."""
        # Assumes _is_hidden is always annotated on the queryset
        return getattr(obj, "_is_hidden", False)

    def get_organization_id(self, obj):
        """Get organization ID from annotation."""
        return getattr(obj, "_organization_id", None)

    def get_api_url(self, obj):
        """Return the API URL for this attribute based on current request context."""
        request = self.context.get("request")
        if request:
            from django.urls import reverse

            # Check for workspace context first (workspace endpoint)
            workspace_id = request.parser_context.get("kwargs", {}).get("workspace_pk")
            if not workspace_id:
                # Check query params (for organization endpoint with workspace_id param)
                workspace_id = request.query_params.get("workspace_id")

            if workspace_id:
                return request.build_absolute_uri(
                    reverse(
                        "workspace-assettype-attribute-detail",
                        kwargs={
                            "workspace_pk": workspace_id,
                            "assettype_pk": obj.asset_type_id,
                            "pk": obj.id,
                        },
                    )
                )

            # Fallback to organization endpoint
            organization_id = request.parser_context.get("kwargs", {}).get(
                "organization_pk"
            )
            if organization_id:
                return request.build_absolute_uri(
                    reverse(
                        "organization-assettype-attribute-detail",
                        kwargs={
                            "organization_pk": organization_id,
                            "assettype_pk": obj.asset_type_id,
                            "pk": obj.id,
                        },
                    )
                )
        return None


class WorkspaceOverrideAssetTypeAttributeSerializer(serializers.ModelSerializer):
    """Serializer for workspace-specific attribute overrides."""

    workspace_name = serializers.CharField(
        source="workspace.name", read_only=True, allow_null=True
    )

    class Meta:
        model = WorkspaceOverrideAssetTypeAttribute
        fields = [
            "id",
            "asset_type",
            "base_attribute",
            "workspace",
            "workspace_name",
            # Override fields (nullable)
            "name",
            "is_required",
            "default_value",
            "description",
            "tags",
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

    def to_representation(self, instance):
        """Return the base attribute serialized with isOverride flag."""
        from .serializers import GlobalAssetTypeAttributeSerializer

        # Get base attribute from cache if available, otherwise access directly
        global_attrs_cache = self.context.get("global_attributes_by_id", {})
        base_attr_id = (
            str(instance.base_attribute_id) if instance.base_attribute_id else None
        )
        base_attr = global_attrs_cache.get(base_attr_id) if base_attr_id else None
        if base_attr is None:
            base_attr = instance.base_attribute

        # Serialize the base attribute
        base_data = GlobalAssetTypeAttributeSerializer(
            base_attr, context=self.context
        ).data

        # Get workspace name from annotation if available
        workspace_name = getattr(instance, "_workspace_name", None)
        organization_id = getattr(instance, "_organization_id", None)

        # Build result with metadata first, then base data, then overrides
        result = {
            "id": str(instance.id),  # Override's own ID
            "isOverride": True,
            "workspace": str(instance.workspace_id) if instance.workspace_id else None,
            "workspace_name": workspace_name,
            "organization_id": organization_id,
            "base_attribute_id": base_attr_id,
        }

        # Add all base data (except id and organization_id which we already set from annotations)
        for key, value in base_data.items():
            if key not in ("id", "organization_id"):
                result[key] = value

        # Apply overrides (these will replace base values)
        if instance.name is not None:
            result["name"] = instance.name
        if instance.is_required is not None:
            result["is_required"] = instance.is_required
        if instance.default_value is not None:
            result["default_value"] = instance.default_value
        if instance.description is not None:
            result["description"] = instance.description
        if instance.tags is not None:
            result["tags"] = instance.tags

        return result


class WorkspaceHiddenAttributeSerializer(serializers.Serializer):
    """Serializer for hidden attribute records."""

    # When serializing let's return the serialized data of hidden_attribute
    def to_representation(self, instance):
        return {
            **AssetTypeAttributeSerializer(
                instance.hidden_attribute, context=self.context
            ).data,
            "isHidden": True,
        }


class WorkspaceLocalAssetTypeAttributeSerializer(serializers.ModelSerializer):
    """Serializer for workspace-specific extension attributes."""

    workspace_name = serializers.SerializerMethodField()
    organization_id = serializers.SerializerMethodField()
    asset_count_url = serializers.SerializerMethodField()
    is_hidden = serializers.SerializerMethodField()
    api_url = serializers.SerializerMethodField()

    class Meta:
        model = WorkspaceLocalAssetTypeAttribute
        fields = [
            "id",
            "asset_type",
            "workspace",
            "workspace_name",
            "organization_id",
            "name",
            "api_key",
            "attribute_type",
            "is_required",
            "default_value",
            "description",
            "tags",
            "asset_count_url",
            "is_hidden",
            "api_url",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "asset_type", "workspace", "created_at", "updated_at"]

    def get_workspace_name(self, obj):
        """Get workspace name from annotation if available."""
        return getattr(obj, "_workspace_name", None)

    def get_organization_id(self, obj):
        """Get organization ID from annotation."""
        return getattr(obj, "_organization_id", None)

    def get_asset_count_url(self, obj):
        """Get URL to the asset-count endpoint."""
        request = self.context.get("request")
        if request:
            from django.urls import reverse

            workspace_id = request.parser_context.get("kwargs", {}).get("workspace_pk")
            if workspace_id:
                return request.build_absolute_uri(
                    reverse(
                        "workspace-assettype-attribute-asset-count",
                        kwargs={
                            "workspace_pk": workspace_id,
                            "assettype_pk": obj.asset_type_id,
                            "pk": obj.id,
                        },
                    )
                )
        return None

    def get_is_hidden(self, obj):
        """Check if this attribute is hidden in its workspace."""
        # Local attributes can't be hidden currently (they're workspace-specific)
        return False

    def get_api_url(self, obj):
        """Return the API URL for this attribute based on current request context."""
        request = self.context.get("request")
        if request:
            from django.urls import reverse

            workspace_id = request.parser_context.get("kwargs", {}).get("workspace_pk")
            if workspace_id:
                return request.build_absolute_uri(
                    reverse(
                        "workspace-assettype-attribute-detail",
                        kwargs={
                            "workspace_pk": workspace_id,
                            "assettype_pk": obj.asset_type_id,
                            "pk": obj.id,
                        },
                    )
                )
        return None


class WorkspaceAssetTypeConfigSerializer(serializers.ModelSerializer):
    """Serializer for workspace-specific asset type configuration (attribute ordering)."""

    workspace_name = serializers.CharField(
        source="workspace.name", read_only=True, allow_null=True
    )
    asset_type_name = serializers.CharField(
        source="asset_type.name", read_only=True, allow_null=True
    )

    class Meta:
        model = WorkspaceAssetTypeConfig
        fields = [
            "id",
            "workspace",
            "workspace_name",
            "asset_type",
            "asset_type_name",
            "attribute_order",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "workspace", "asset_type", "created_at", "updated_at"]

    def validate_attribute_order(self, value):
        """Validate that attribute_order contains valid UUIDs."""
        if not isinstance(value, list):
            raise serializers.ValidationError("attribute_order must be a list")

        # Validate each item is a valid UUID string (or dict with 'id' key for legacy format)
        import uuid

        for item in value:
            try:
                # Handle both formats:
                # - Plain UUID string: "uuid"
                # - Legacy dict format: {"id": "uuid", "order": 0}
                if isinstance(item, dict):
                    item_id = item.get("id", "")
                else:
                    item_id = item
                uuid.UUID(str(item_id))
            except ValueError:
                raise serializers.ValidationError(
                    f"Invalid UUID in attribute_order: {item}"
                )
        return value


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
    # Only serialize location (Point) for list/retrieve - geometry is expensive
    # Use a separate endpoint or field for full geometry when needed
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
        """Get attributes as a dictionary using prefetched data.

        Optimized for high attribute counts (100+):
        - Values are annotated directly on prefetched attributes (no separate query)
        - Single-pass dict comprehension for fast iteration
        - Supports ?fields=... to exclude attributes from response
        """
        # Check if attributes were excluded via ?fields= parameter
        request = self.context.get("request")
        if request:
            fields_param = request.query_params.get("fields", "")
            if fields_param and "attributes" not in fields_param.split(","):
                return None  # Skip attributes entirely when not requested

        # Use prefetched attributes if available
        attributes = getattr(obj, "attributes", None)
        if not attributes:
            return {}

        # Get all attribute values (these are prefetched with typed_value annotated)
        attr_values = attributes.all()
        if not attr_values:
            return {}

        # Use cached api_key map from context
        api_key_map = self.context.get("_api_key_map", {})

        # Values are now annotated directly on each attribute - no value_map needed!
        return {
            api_key_map[str(fv.asset_type_attribute_id)]: fv.typed_value
            for fv in attr_values
            if str(fv.asset_type_attribute_id) in api_key_map
            and getattr(fv, "typed_value", None) is not None
        }

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
                except BaseAssetTypeAttribute.DoesNotExist:
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
                except BaseAssetTypeAttribute.DoesNotExist:
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
                field_defs = BaseAssetTypeAttribute.objects.filter(
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
