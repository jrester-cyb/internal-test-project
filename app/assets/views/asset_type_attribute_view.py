from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Count, Q
from drf_spectacular.utils import extend_schema, extend_schema_view
from ..models import (
    AssetTypeAttribute,
)
from ..serializers import AssetTypeAttributeSerializer


@extend_schema_view(
    list=extend_schema(tags=["Asset Type Attributes"]),
    create=extend_schema(tags=["Asset Type Attributes"]),
    retrieve=extend_schema(tags=["Asset Type Attributes"]),
    update=extend_schema(tags=["Asset Type Attributes"]),
    partial_update=extend_schema(tags=["Asset Type Attributes"]),
    destroy=extend_schema(tags=["Asset Type Attributes"]),
)
class AssetTypeAttributeViewSet(viewsets.ModelViewSet):
    """
    ViewSet for AssetTypeAttribute model.

    Define custom fields for asset types.
    Attributes can be base (workspace=None) or workspace-specific extensions.
    """

    serializer_class = AssetTypeAttributeSerializer
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_fields = ["asset_type", "attribute_type", "is_required"]
    search_fields = ["^name", "^api_key", "description"]
    ordering_fields = ["order", "name", "created_at"]

    LOOKUP_MAP = {
        "text": "textattributevalue__value",
        "number": "numberattributevalue__value",
        "boolean": "booleanattributevalue__value",
        "date": "dateattributevalue__value",
        "datetime": "datetimeattributevalue__value",
        "json": "jsonattributevalue__value",
    }

    def get_queryset(self):
        """
        Filter attributes by parent asset type.
        Returns base attributes (workspace=None) plus any workspace-specific extensions.
        """
        workspace_pk = self.kwargs.get("workspace_pk")

        # Get base attributes (workspace=None) and workspace-specific extensions
        queryset = (
            AssetTypeAttribute.objects.filter(asset_type_id=self.kwargs["assettype_pk"])
            .filter(Q(workspace__isnull=True) | Q(workspace_id=workspace_pk))
            .select_related("asset_type", "workspace")
        )

        return queryset

    def list(self, request, *args, **kwargs):
        """
        Override list to merge attributes by api_key.
        Workspace-specific attributes override base attributes with the same api_key.
        Query params:
            - include_hidden: If "true", includes hidden attributes in the response
        """
        queryset = self.filter_queryset(self.get_queryset())
        include_hidden = (
            request.query_params.get("include_hidden", "").lower() == "true"
        )

        # Two-pass approach to ensure correct override detection regardless of order
        # First pass: collect all base attributes (workspace=None)
        base_attrs = {}  # api_key -> attribute
        workspace_attrs = {}  # api_key -> attribute

        for attr in queryset:
            if attr.workspace_id is None:
                base_attrs[attr.api_key] = attr
            else:
                workspace_attrs[attr.api_key] = attr

        # Second pass: merge, with workspace taking precedence and marking overrides
        merged_attrs = {}

        # Start with base attributes
        for api_key, attr in base_attrs.items():
            merged_attrs[api_key] = attr

        # Apply workspace attributes (override or extend)
        for api_key, attr in workspace_attrs.items():
            if api_key in base_attrs:
                # This is an override
                attr._is_override = True
                attr._base_attribute_id = str(base_attrs[api_key].id)
            else:
                # New workspace-only attribute (extension)
                attr._is_override = False
                attr._base_attribute_id = None
            merged_attrs[api_key] = attr

        # Filter out hidden attributes (unless include_hidden is requested)
        # An attribute is hidden if:
        # 1. It's a workspace attribute with is_hidden=True, OR
        # 2. There's a workspace override with is_hidden=True for a base attribute
        if include_hidden:
            visible_attrs = merged_attrs
        else:
            visible_attrs = {
                api_key: attr
                for api_key, attr in merged_attrs.items()
                if not getattr(attr, "is_hidden", False)
            }

        # Convert to list and sort by order
        result = sorted(visible_attrs.values(), key=lambda x: (x.order, x.name))

        # Paginate the merged results
        page = self.paginate_queryset(result)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        # Fallback if pagination is disabled
        serializer = self.get_serializer(result, many=True)
        return Response(serializer.data)

    def perform_create(self, serializer):
        """
        Create an attribute. When created via workspace-scoped endpoint,
        automatically creates as a workspace-specific attribute.
        """
        workspace_pk = self.kwargs.get("workspace_pk")

        if workspace_pk:
            # Create as workspace-specific attribute
            serializer.save(
                asset_type_id=self.kwargs["assettype_pk"], workspace_id=workspace_pk
            )
        else:
            # Create as base attribute (organization-level) - only via non-workspace route
            serializer.save(asset_type_id=self.kwargs["assettype_pk"])

    def perform_update(self, serializer):
        """
        Update an attribute. If updating a base attribute via workspace endpoint,
        create a workspace-specific override instead of modifying the base.
        """
        instance = self.get_object()
        workspace_pk = self.kwargs.get("workspace_pk")

        # If this is a base attribute (no workspace) and we're accessing via workspace endpoint,
        # create a workspace-specific override instead of modifying the base
        if instance.workspace_id is None and workspace_pk:
            # Create a new workspace-specific attribute as an override
            # Copy all fields from the base, apply the updates, set workspace
            from ..models import AssetTypeAttribute

            # Get the validated data from the serializer
            validated_data = serializer.validated_data

            # Create new override attribute with same api_key
            override_data = {
                "asset_type_id": instance.asset_type_id,
                "workspace_id": workspace_pk,
                "name": validated_data.get("name", instance.name),
                "api_key": instance.api_key,  # Keep same api_key to make it an override
                "attribute_type": validated_data.get(
                    "attribute_type", instance.attribute_type
                ),
                "is_required": validated_data.get("is_required", instance.is_required),
                "default_value": validated_data.get(
                    "default_value", instance.default_value
                ),
                "description": validated_data.get("description", instance.description),
                "order": validated_data.get("order", instance.order),
            }

            # Check if override already exists
            existing_override = AssetTypeAttribute.objects.filter(
                asset_type_id=instance.asset_type_id,
                workspace_id=workspace_pk,
                api_key=instance.api_key,
                deleted_at__isnull=True,
            ).first()

            if existing_override:
                # Update the existing override
                for key, value in override_data.items():
                    if key not in ["asset_type_id", "workspace_id", "api_key"]:
                        setattr(existing_override, key, value)
                existing_override.save()
                # Mark as override for serializer
                existing_override._is_override = True
                existing_override._base_attribute_id = str(instance.id)
                serializer.instance = existing_override
            else:
                # Create new override
                new_override = AssetTypeAttribute.objects.create(**override_data)
                # Mark as override for serializer
                new_override._is_override = True
                new_override._base_attribute_id = str(instance.id)
                serializer.instance = new_override
        else:
            # Either already a workspace-specific attribute or not via workspace endpoint
            # Just update normally
            serializer.save(
                asset_type_id=self.kwargs["assettype_pk"], workspace=instance.workspace
            )
            # If this is an existing override, maintain its override status
            if instance.workspace_id is not None:
                # Check if there's a base attribute with same api_key
                base_attr = AssetTypeAttribute.objects.filter(
                    asset_type_id=instance.asset_type_id,
                    workspace_id__isnull=True,
                    api_key=instance.api_key,
                    deleted_at__isnull=True,
                ).first()
                if base_attr:
                    serializer.instance._is_override = True
                    serializer.instance._base_attribute_id = str(base_attr.id)

    def perform_destroy(self, instance):
        """
        Delete an attribute. Base attributes cannot be deleted via workspace endpoint -
        they can only be hidden.
        """
        workspace_pk = self.kwargs.get("workspace_pk")

        # Block deletion of base attributes via workspace endpoint
        if instance.workspace_id is None and workspace_pk:
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied(
                "Cannot delete a base attribute from a workspace. "
                "Use the hide action instead to hide it for this workspace."
            )

        # Delete the attribute - CASCADE will handle related attribute values
        instance.delete()

    @extend_schema(
        tags=["Asset Type Attributes"],
        summary="Hide attribute for this workspace",
        description="Hides a base attribute for this workspace by creating an override with is_hidden=True",
    )
    @action(detail=True, methods=["post"], url_path="hide")
    def hide(self, request, pk=None, workspace_pk=None, assettype_pk=None):
        """Hide a base attribute for this workspace"""
        if not workspace_pk:
            return Response(
                {"error": "Hide action is only available via workspace endpoint"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        instance = self.get_object()

        if instance.workspace_id is None:
            # Base attribute - create or update a hidden override
            existing_override = AssetTypeAttribute.objects.filter(
                asset_type_id=assettype_pk,
                workspace_id=workspace_pk,
                api_key=instance.api_key,
                deleted_at__isnull=True,
            ).first()

            if existing_override:
                existing_override.is_hidden = True
                existing_override.save()
                # Set override flag for serializer
                existing_override._is_override = True
                existing_override._base_attribute_id = instance.id
                serializer = self.get_serializer(existing_override)
            else:
                # Create hidden override
                new_override = AssetTypeAttribute.objects.create(
                    asset_type_id=instance.asset_type_id,
                    workspace_id=workspace_pk,
                    name=instance.name,
                    api_key=instance.api_key,
                    attribute_type=instance.attribute_type,
                    is_required=instance.is_required,
                    default_value=instance.default_value,
                    description=instance.description,
                    order=instance.order,
                    is_hidden=True,
                )
                # Set override flag for serializer
                new_override._is_override = True
                new_override._base_attribute_id = instance.id
                serializer = self.get_serializer(new_override)

            return Response(serializer.data)
        else:
            # Workspace attribute - just mark it hidden
            instance.is_hidden = True
            instance.save()
            serializer = self.get_serializer(instance)
            return Response(serializer.data)

    @extend_schema(
        tags=["Asset Type Attributes"],
        summary="Unhide attribute for this workspace",
        description="Unhides an attribute for this workspace. If the override was created solely to hide the attribute, it will be deleted.",
    )
    @action(detail=True, methods=["post"], url_path="unhide")
    def unhide(self, request, pk=None, workspace_pk=None, assettype_pk=None):
        """
        Unhide an attribute for this workspace.
        - For workspace extensions: just set is_hidden=False
        - For overrides of base attributes:
          - If override only exists to hide (no other changes), delete it
          - If override has other changes, just set is_hidden=False
        """
        if not workspace_pk:
            return Response(
                {"error": "Unhide action is only available via workspace endpoint"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        instance = self.get_object()

        if instance.workspace_id is None:
            # Base attribute - find the hidden override
            existing_override = AssetTypeAttribute.objects.filter(
                asset_type_id=assettype_pk,
                workspace_id=workspace_pk,
                api_key=instance.api_key,
                deleted_at__isnull=True,
            ).first()

            if existing_override and existing_override.is_hidden:
                # Check if the override only exists to hide the attribute
                # (all other fields match the base attribute)
                is_only_hidden = (
                    existing_override.name == instance.name
                    and existing_override.attribute_type == instance.attribute_type
                    and existing_override.is_required == instance.is_required
                    and existing_override.default_value == instance.default_value
                    and existing_override.description == instance.description
                    and existing_override.order == instance.order
                )

                if is_only_hidden:
                    # Override was only for hiding - delete it
                    existing_override.delete()
                    serializer = self.get_serializer(instance)
                else:
                    # Override has other changes - just unhide it
                    existing_override.is_hidden = False
                    existing_override.save()
                    # Set override flag for serializer
                    existing_override._is_override = True
                    existing_override._base_attribute_id = instance.id
                    serializer = self.get_serializer(existing_override)

                return Response(serializer.data)

            # No hidden override found
            serializer = self.get_serializer(instance)
            return Response(serializer.data)
        else:
            # Workspace attribute - check if it's an override or a true extension
            base_attribute = AssetTypeAttribute.objects.filter(
                asset_type_id=assettype_pk,
                workspace_id__isnull=True,
                api_key=instance.api_key,
                deleted_at__isnull=True,
            ).first()

            if base_attribute:
                # This is an override - check if it only exists to hide
                is_only_hidden = (
                    instance.name == base_attribute.name
                    and instance.attribute_type == base_attribute.attribute_type
                    and instance.is_required == base_attribute.is_required
                    and instance.default_value == base_attribute.default_value
                    and instance.description == base_attribute.description
                    and instance.order == base_attribute.order
                )

                if is_only_hidden:
                    # Override was only for hiding - delete it and return base
                    instance.delete()
                    serializer = self.get_serializer(base_attribute)
                else:
                    # Override has other changes - just unhide it
                    instance.is_hidden = False
                    instance.save()
                    instance._is_override = True
                    instance._base_attribute_id = base_attribute.id
                    serializer = self.get_serializer(instance)
            else:
                # True workspace extension - just unhide it
                instance.is_hidden = False
                instance.save()
                serializer = self.get_serializer(instance)

            return Response(serializer.data)

    @extend_schema(
        tags=["Asset Type Attributes"],
        summary="Get asset count for attribute",
        description="Returns the count of assets that have a value for this attribute",
    )
    @action(detail=True, methods=["get"], url_path="asset-count")
    def asset_count(self, request, pk=None, workspace_pk=None, assettype_pk=None):
        """Get count of assets with values for this attribute"""
        from ..models import BaseAttributeValue

        count = (
            BaseAttributeValue.objects.filter(asset_type_attribute_id=pk)
            .values("asset_id")
            .distinct()
            .count()
        )

        return Response({"count": count})

    @extend_schema(
        tags=["Asset Type Attributes"],
        summary="Bulk update attribute order",
        description="Updates the order field for multiple attributes at once",
        request={
            "application/json": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "string"},
                        "order": {"type": "integer"},
                    },
                    "required": ["id", "order"],
                },
            }
        },
    )
    @action(detail=False, methods=["post"], url_path="reorder")
    def reorder(self, request, workspace_pk=None, assettype_pk=None):
        """Bulk update attribute order - creates workspace overrides only for attributes whose relative position changed"""
        from django.db import transaction

        if not isinstance(request.data, list):
            return Response(
                {"error": "Expected a list of updates"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        updates = request.data
        attribute_ids = [update["id"] for update in updates]

        # Validate all updates belong to this asset type
        attributes = AssetTypeAttribute.objects.filter(
            id__in=attribute_ids, asset_type_id=assettype_pk
        )

        if attributes.count() != len(attribute_ids):
            return Response(
                {
                    "error": "One or more attributes not found or don't belong to this asset type"
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        with transaction.atomic():
            # Build a map of id -> attribute for quick lookup
            attr_map = {str(attr.id): attr for attr in attributes}

            # If we're in a workspace context, we need to handle base attributes specially
            if workspace_pk:
                # Get the current relative order of attributes (sorted by their order field)
                # This gives us the OLD positions
                sorted_old = sorted(attributes, key=lambda a: (a.order, a.name))
                old_positions = {
                    str(attr.id): idx for idx, attr in enumerate(sorted_old)
                }

                # Get NEW positions from the request (sorted by the new order values)
                sorted_updates = sorted(updates, key=lambda u: u["order"])
                new_positions = {u["id"]: idx for idx, u in enumerate(sorted_updates)}

                final_updates = []  # List of (attribute_id, order) tuples

                for update in updates:
                    attr_id = update["id"]
                    new_order = update["order"]
                    attr = attr_map.get(attr_id)

                    if attr and attr.workspace_id is None:
                        # This is a base attribute - check if relative position changed
                        old_pos = old_positions.get(attr_id)
                        new_pos = new_positions.get(attr_id)

                        if old_pos == new_pos:
                            # Relative position unchanged - no override needed
                            continue

                        # Position changed - check if workspace override exists
                        existing_override = AssetTypeAttribute.objects.filter(
                            asset_type_id=assettype_pk,
                            workspace_id=workspace_pk,
                            api_key=attr.api_key,
                            deleted_at__isnull=True,
                        ).first()

                        if existing_override:
                            # Update existing override's order
                            final_updates.append((str(existing_override.id), new_order))
                        else:
                            # Create a workspace-specific override with new order
                            new_override = AssetTypeAttribute.objects.create(
                                asset_type_id=attr.asset_type_id,
                                workspace_id=workspace_pk,
                                name=attr.name,
                                api_key=attr.api_key,
                                attribute_type=attr.attribute_type,
                                is_required=attr.is_required,
                                default_value=attr.default_value,
                                description=attr.description,
                                order=new_order,
                            )
                            final_updates.append((str(new_override.id), new_order))
                    else:
                        # Already a workspace attribute - update if position changed
                        old_pos = old_positions.get(attr_id)
                        new_pos = new_positions.get(attr_id)
                        if old_pos != new_pos:
                            final_updates.append((attr_id, new_order))

                # Only do bulk update if there are changes
                if final_updates:
                    # Step 1: Set to negative temporary values
                    objects_to_update = [
                        AssetTypeAttribute(id=uid, order=-i)
                        for i, (uid, _) in enumerate(final_updates, 1)
                    ]
                    AssetTypeAttribute.objects.bulk_update(objects_to_update, ["order"])

                    # Step 2: Set to final order values
                    objects_to_update = [
                        AssetTypeAttribute(id=uid, order=order)
                        for uid, order in final_updates
                    ]
                    AssetTypeAttribute.objects.bulk_update(objects_to_update, ["order"])
            else:
                # No workspace context - update directly
                # Step 1: Set to negative temporary values
                objects_to_update = [
                    AssetTypeAttribute(id=update["id"], order=-i)
                    for i, update in enumerate(updates, 1)
                ]
                AssetTypeAttribute.objects.bulk_update(objects_to_update, ["order"])

                # Step 2: Set to final order values
                objects_to_update = [
                    AssetTypeAttribute(id=update["id"], order=update["order"])
                    for update in updates
                ]
                AssetTypeAttribute.objects.bulk_update(objects_to_update, ["order"])

        return Response({"success": True}, status=status.HTTP_200_OK)

    @extend_schema(
        tags=["Asset Type Attributes"],
        summary="Get distinct values for this attribute",
        description="Returns a list of unique values that exist for this attribute across all assets of this type",
    )
    @action(detail=True, methods=["get"])
    def values(self, request, assettype_pk=None, pk=None):
        """Get distinct values for this attribute definition"""
        asset_type_attribute = self.get_object()

        # Lookup field based on attribute type
        try:
            lookup_field = self.LOOKUP_MAP[asset_type_attribute.attribute_type]
        except KeyError as e:
            raise RuntimeError(
                f"Unsupported attribute type: {asset_type_attribute.attribute_type}"
            ) from e

        # Get all attribute values for this field definition
        values_qs = (
            asset_type_attribute.values.distinct(lookup_field)
            .only(lookup_field)
            .order_by(lookup_field)
            .values_list(lookup_field, flat=True)
        )

        # Paginate the results
        paginator = AttributeValuesPagination()
        page = paginator.paginate_queryset(values_qs, request)

        if page is not None:
            return paginator.get_paginated_response(page)
        return Response(values_qs)
