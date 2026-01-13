from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError, PermissionDenied
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Q, Max
from django.db import transaction
from drf_spectacular.utils import extend_schema, extend_schema_view
from ..models import (
    GlobalAssetTypeAttribute,
    WorkspaceAttributeOverride,
    WorkspaceHiddenAttribute,
    WorkspaceExtensionAttribute,
    BaseAttributeValue,
    WorkspaceAsset,
)
from ..serializers import (
    GlobalAssetTypeAttributeSerializer,
    WorkspaceAttributeOverrideSerializer,
    WorkspaceHiddenAttributeSerializer,
    WorkspaceExtensionAttributeSerializer,
    MergedAttributeSerializer,
)
from app.pagination import CustomPageNumberPagination


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
    ViewSet for managing asset type attributes.

    Handles the polymorphic attribute models:
    - GlobalAssetTypeAttribute: Base attributes visible to all workspaces
    - WorkspaceAttributeOverride: Workspace-specific overrides of global attributes
    - WorkspaceHiddenAttribute: Records of hidden global attributes per workspace
    - WorkspaceExtensionAttribute: Workspace-only extension attributes
    """

    serializer_class = MergedAttributeSerializer
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
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
        """Return merged attributes for the list view."""
        # This is primarily used for non-list operations
        # List uses custom logic in list()
        return GlobalAssetTypeAttribute.objects.filter(
            asset_type_id=self.kwargs["assettype_pk"],
            deleted_at__isnull=True,
        )

    def _get_merged_attributes(self, assettype_pk, workspace_pk, include_hidden=False):
        """
        Get merged attributes for a workspace context.

        Returns a list of dicts with unified attribute data:
        - Global attributes (possibly with overrides applied)
        - Workspace extension attributes
        - Optionally hidden attributes
        """
        # 1. Get all global attributes
        global_attrs = GlobalAssetTypeAttribute.objects.filter(
            asset_type_id=assettype_pk,
            deleted_at__isnull=True,
        ).select_related("asset_type")

        # 2. Get workspace overrides (if workspace context)
        overrides_by_base = {}
        if workspace_pk:
            overrides = WorkspaceAttributeOverride.objects.filter(
                asset_type_id=assettype_pk,
                workspace_id=workspace_pk,
                deleted_at__isnull=True,
            ).select_related("base_attribute", "workspace")
            overrides_by_base = {o.base_attribute_id: o for o in overrides}

        # 3. Get hidden attributes (if workspace context)
        hidden_base_ids = set()
        if workspace_pk:
            hidden_base_ids = set(
                WorkspaceHiddenAttribute.objects.filter(
                    asset_type_id=assettype_pk,
                    workspace_id=workspace_pk,
                    deleted_at__isnull=True,
                ).values_list("hidden_attribute_id", flat=True)
            )

        # 4. Get workspace extensions (if workspace context)
        extensions = []
        if workspace_pk:
            extensions = WorkspaceExtensionAttribute.objects.filter(
                asset_type_id=assettype_pk,
                workspace_id=workspace_pk,
                deleted_at__isnull=True,
            ).select_related("workspace")

        # Build merged result
        result = []

        # Process global attributes
        for attr in global_attrs:
            is_hidden = attr.id in hidden_base_ids
            if is_hidden and not include_hidden:
                continue

            override = overrides_by_base.get(attr.id)

            if override:
                # Use override values where set, else fall back to base
                result.append(
                    {
                        "id": override.id,
                        "asset_type_id": attr.asset_type_id,
                        "workspace_id": workspace_pk,
                        "workspace_name": (
                            override.workspace.name if override.workspace else None
                        ),
                        "attribute_kind": "override",
                        "is_override": True,
                        "is_extension": False,
                        "is_hidden": is_hidden,
                        "base_attribute_id": attr.id,
                        "name": (
                            override.name if override.name is not None else attr.name
                        ),
                        "api_key": attr.api_key,
                        "attribute_type": attr.attribute_type,
                        "is_required": (
                            override.is_required
                            if override.is_required is not None
                            else attr.is_required
                        ),
                        "default_value": (
                            override.default_value
                            if override.default_value is not None
                            else attr.default_value
                        ),
                        "description": (
                            override.description
                            if override.description is not None
                            else attr.description
                        ),
                        "tags": (
                            override.tags if override.tags is not None else attr.tags
                        ),
                        "order": (
                            override.order if override.order is not None else attr.order
                        ),
                        "created_at": attr.created_at,
                        "updated_at": override.updated_at,
                    }
                )
            else:
                # No override - use global attribute directly
                result.append(
                    {
                        "id": attr.id,
                        "asset_type_id": attr.asset_type_id,
                        "workspace_id": None,
                        "workspace_name": None,
                        "attribute_kind": "global",
                        "is_override": False,
                        "is_extension": False,
                        "is_hidden": is_hidden,
                        "base_attribute_id": None,
                        "name": attr.name,
                        "api_key": attr.api_key,
                        "attribute_type": attr.attribute_type,
                        "is_required": attr.is_required,
                        "default_value": attr.default_value,
                        "description": attr.description,
                        "tags": attr.tags or [],
                        "order": attr.order,
                        "created_at": attr.created_at,
                        "updated_at": attr.updated_at,
                    }
                )

        # Process workspace extensions
        for ext in extensions:
            if ext.is_hidden and not include_hidden:
                continue

            result.append(
                {
                    "id": ext.id,
                    "asset_type_id": ext.asset_type_id,
                    "workspace_id": ext.workspace_id,
                    "workspace_name": ext.workspace.name if ext.workspace else None,
                    "attribute_kind": "extension",
                    "is_override": False,
                    "is_extension": True,
                    "is_hidden": ext.is_hidden,
                    "base_attribute_id": None,
                    "name": ext.name,
                    "api_key": ext.api_key,
                    "attribute_type": ext.attribute_type,
                    "is_required": ext.is_required,
                    "default_value": ext.default_value,
                    "description": ext.description,
                    "tags": ext.tags or [],
                    "order": ext.order,
                    "created_at": ext.created_at,
                    "updated_at": ext.updated_at,
                }
            )

        return result

    def list(self, request, *args, **kwargs):
        """
        List merged attributes for this asset type.

        Query params:
            - include_hidden: If "true", includes hidden attributes
        """
        assettype_pk = self.kwargs["assettype_pk"]
        workspace_pk = self.kwargs.get("workspace_pk")
        include_hidden = (
            request.query_params.get("include_hidden", "").lower() == "true"
        )

        merged = self._get_merged_attributes(assettype_pk, workspace_pk, include_hidden)

        # Sort by order, then name
        sorted_result = sorted(
            merged, key=lambda x: (x.get("is_hidden", False), x["order"], x["name"])
        )

        # Paginate
        page = self.paginate_queryset(sorted_result)
        if page is not None:
            serializer = MergedAttributeSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = MergedAttributeSerializer(sorted_result, many=True)
        return Response(serializer.data)

    def retrieve(self, request, *args, **kwargs):
        """Retrieve a single attribute by ID."""
        pk = self.kwargs["pk"]
        assettype_pk = self.kwargs["assettype_pk"]
        workspace_pk = self.kwargs.get("workspace_pk")

        # Try to find in each model
        # First check if it's a global attribute
        global_attr = GlobalAssetTypeAttribute.objects.filter(
            id=pk, asset_type_id=assettype_pk, deleted_at__isnull=True
        ).first()

        if global_attr:
            # Check for override in workspace context
            override = None
            is_hidden = False
            if workspace_pk:
                override = (
                    WorkspaceAttributeOverride.objects.filter(
                        base_attribute_id=pk,
                        workspace_id=workspace_pk,
                        deleted_at__isnull=True,
                    )
                    .select_related("workspace")
                    .first()
                )
                is_hidden = WorkspaceHiddenAttribute.objects.filter(
                    hidden_attribute_id=pk,
                    workspace_id=workspace_pk,
                    deleted_at__isnull=True,
                ).exists()

            if override:
                data = {
                    "id": override.id,
                    "asset_type_id": global_attr.asset_type_id,
                    "workspace_id": workspace_pk,
                    "workspace_name": override.workspace.name,
                    "attribute_kind": "override",
                    "is_override": True,
                    "is_extension": False,
                    "is_hidden": is_hidden,
                    "base_attribute_id": global_attr.id,
                    "name": override.name or global_attr.name,
                    "api_key": global_attr.api_key,
                    "attribute_type": global_attr.attribute_type,
                    "is_required": (
                        override.is_required
                        if override.is_required is not None
                        else global_attr.is_required
                    ),
                    "default_value": (
                        override.default_value
                        if override.default_value is not None
                        else global_attr.default_value
                    ),
                    "description": (
                        override.description
                        if override.description is not None
                        else global_attr.description
                    ),
                    "tags": (
                        override.tags if override.tags is not None else global_attr.tags
                    ),
                    "order": (
                        override.order
                        if override.order is not None
                        else global_attr.order
                    ),
                    "created_at": global_attr.created_at,
                    "updated_at": override.updated_at,
                }
            else:
                data = {
                    "id": global_attr.id,
                    "asset_type_id": global_attr.asset_type_id,
                    "workspace_id": None,
                    "workspace_name": None,
                    "attribute_kind": "global",
                    "is_override": False,
                    "is_extension": False,
                    "is_hidden": is_hidden,
                    "base_attribute_id": None,
                    "name": global_attr.name,
                    "api_key": global_attr.api_key,
                    "attribute_type": global_attr.attribute_type,
                    "is_required": global_attr.is_required,
                    "default_value": global_attr.default_value,
                    "description": global_attr.description,
                    "tags": global_attr.tags or [],
                    "order": global_attr.order,
                    "created_at": global_attr.created_at,
                    "updated_at": global_attr.updated_at,
                }

            return Response(MergedAttributeSerializer(data).data)

        # Check if it's an override
        override = (
            WorkspaceAttributeOverride.objects.filter(
                id=pk, asset_type_id=assettype_pk, deleted_at__isnull=True
            )
            .select_related("base_attribute", "workspace")
            .first()
        )

        if override:
            base = override.base_attribute
            data = {
                "id": override.id,
                "asset_type_id": override.asset_type_id,
                "workspace_id": override.workspace_id,
                "workspace_name": override.workspace.name,
                "attribute_kind": "override",
                "is_override": True,
                "is_extension": False,
                "is_hidden": False,
                "base_attribute_id": base.id,
                "name": override.name or base.name,
                "api_key": base.api_key,
                "attribute_type": base.attribute_type,
                "is_required": (
                    override.is_required
                    if override.is_required is not None
                    else base.is_required
                ),
                "default_value": (
                    override.default_value
                    if override.default_value is not None
                    else base.default_value
                ),
                "description": (
                    override.description
                    if override.description is not None
                    else base.description
                ),
                "tags": override.tags if override.tags is not None else base.tags,
                "order": override.order if override.order is not None else base.order,
                "created_at": base.created_at,
                "updated_at": override.updated_at,
            }
            return Response(MergedAttributeSerializer(data).data)

        # Check if it's an extension
        extension = (
            WorkspaceExtensionAttribute.objects.filter(
                id=pk, asset_type_id=assettype_pk, deleted_at__isnull=True
            )
            .select_related("workspace")
            .first()
        )

        if extension:
            data = {
                "id": extension.id,
                "asset_type_id": extension.asset_type_id,
                "workspace_id": extension.workspace_id,
                "workspace_name": extension.workspace.name,
                "attribute_kind": "extension",
                "is_override": False,
                "is_extension": True,
                "is_hidden": extension.is_hidden,
                "base_attribute_id": None,
                "name": extension.name,
                "api_key": extension.api_key,
                "attribute_type": extension.attribute_type,
                "is_required": extension.is_required,
                "default_value": extension.default_value,
                "description": extension.description,
                "tags": extension.tags or [],
                "order": extension.order,
                "created_at": extension.created_at,
                "updated_at": extension.updated_at,
            }
            return Response(MergedAttributeSerializer(data).data)

        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    def create(self, request, *args, **kwargs):
        """
        Create a new attribute.

        - Via workspace endpoint: creates a WorkspaceExtensionAttribute
        - Via non-workspace endpoint: creates a GlobalAssetTypeAttribute
        """
        assettype_pk = self.kwargs["assettype_pk"]
        workspace_pk = self.kwargs.get("workspace_pk")

        if workspace_pk:
            # Create workspace extension
            serializer = WorkspaceExtensionAttributeSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            instance = serializer.save(
                asset_type_id=assettype_pk,
                workspace_id=workspace_pk,
            )
            # Return merged format
            data = {
                "id": instance.id,
                "asset_type_id": instance.asset_type_id,
                "workspace_id": instance.workspace_id,
                "workspace_name": instance.workspace.name,
                "attribute_kind": "extension",
                "is_override": False,
                "is_extension": True,
                "is_hidden": instance.is_hidden,
                "base_attribute_id": None,
                "name": instance.name,
                "api_key": instance.api_key,
                "attribute_type": instance.attribute_type,
                "is_required": instance.is_required,
                "default_value": instance.default_value,
                "description": instance.description,
                "tags": instance.tags or [],
                "order": instance.order,
                "created_at": instance.created_at,
                "updated_at": instance.updated_at,
            }
            return Response(
                MergedAttributeSerializer(data).data,
                status=status.HTTP_201_CREATED,
            )
        else:
            # Create global attribute
            serializer = GlobalAssetTypeAttributeSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            instance = serializer.save(asset_type_id=assettype_pk)
            # Return merged format
            data = {
                "id": instance.id,
                "asset_type_id": instance.asset_type_id,
                "workspace_id": None,
                "workspace_name": None,
                "attribute_kind": "global",
                "is_override": False,
                "is_extension": False,
                "is_hidden": False,
                "base_attribute_id": None,
                "name": instance.name,
                "api_key": instance.api_key,
                "attribute_type": instance.attribute_type,
                "is_required": instance.is_required,
                "default_value": instance.default_value,
                "description": instance.description,
                "tags": instance.tags or [],
                "order": instance.order,
                "created_at": instance.created_at,
                "updated_at": instance.updated_at,
            }
            return Response(
                MergedAttributeSerializer(data).data,
                status=status.HTTP_201_CREATED,
            )

    def update(self, request, *args, **kwargs):
        """
        Update an attribute.

        - Global attribute via workspace endpoint: creates/updates WorkspaceAttributeOverride
        - Global attribute via non-workspace endpoint: updates the global attribute directly
        - Override: updates the override
        - Extension: updates the extension
        """
        pk = self.kwargs["pk"]
        assettype_pk = self.kwargs["assettype_pk"]
        workspace_pk = self.kwargs.get("workspace_pk")
        partial = kwargs.pop("partial", False)

        # Find the attribute
        global_attr = GlobalAssetTypeAttribute.objects.filter(
            id=pk, asset_type_id=assettype_pk, deleted_at__isnull=True
        ).first()

        if global_attr:
            if workspace_pk:
                # Create or update workspace override
                override, created = WorkspaceAttributeOverride.objects.get_or_create(
                    base_attribute=global_attr,
                    workspace_id=workspace_pk,
                    asset_type_id=assettype_pk,
                    defaults={"deleted_at": None},
                )
                # Restore if soft-deleted
                if override.deleted_at is not None:
                    override.deleted_at = None

                # Update override fields
                for field in [
                    "name",
                    "is_required",
                    "default_value",
                    "description",
                    "tags",
                    "order",
                ]:
                    if field in request.data:
                        setattr(override, field, request.data[field])
                override.save()

                data = {
                    "id": override.id,
                    "asset_type_id": global_attr.asset_type_id,
                    "workspace_id": workspace_pk,
                    "workspace_name": override.workspace.name,
                    "attribute_kind": "override",
                    "is_override": True,
                    "is_extension": False,
                    "is_hidden": WorkspaceHiddenAttribute.objects.filter(
                        hidden_attribute=global_attr,
                        workspace_id=workspace_pk,
                        deleted_at__isnull=True,
                    ).exists(),
                    "base_attribute_id": global_attr.id,
                    "name": override.name or global_attr.name,
                    "api_key": global_attr.api_key,
                    "attribute_type": global_attr.attribute_type,
                    "is_required": (
                        override.is_required
                        if override.is_required is not None
                        else global_attr.is_required
                    ),
                    "default_value": (
                        override.default_value
                        if override.default_value is not None
                        else global_attr.default_value
                    ),
                    "description": (
                        override.description
                        if override.description is not None
                        else global_attr.description
                    ),
                    "tags": (
                        override.tags if override.tags is not None else global_attr.tags
                    ),
                    "order": (
                        override.order
                        if override.order is not None
                        else global_attr.order
                    ),
                    "created_at": global_attr.created_at,
                    "updated_at": override.updated_at,
                }
                return Response(MergedAttributeSerializer(data).data)
            else:
                # Update global attribute directly
                serializer = GlobalAssetTypeAttributeSerializer(
                    global_attr, data=request.data, partial=partial
                )
                serializer.is_valid(raise_exception=True)
                serializer.save()
                global_attr.refresh_from_db()

                data = {
                    "id": global_attr.id,
                    "asset_type_id": global_attr.asset_type_id,
                    "workspace_id": None,
                    "workspace_name": None,
                    "attribute_kind": "global",
                    "is_override": False,
                    "is_extension": False,
                    "is_hidden": False,
                    "base_attribute_id": None,
                    "name": global_attr.name,
                    "api_key": global_attr.api_key,
                    "attribute_type": global_attr.attribute_type,
                    "is_required": global_attr.is_required,
                    "default_value": global_attr.default_value,
                    "description": global_attr.description,
                    "tags": global_attr.tags or [],
                    "order": global_attr.order,
                    "created_at": global_attr.created_at,
                    "updated_at": global_attr.updated_at,
                }
                return Response(MergedAttributeSerializer(data).data)

        # Check if it's an override
        override = (
            WorkspaceAttributeOverride.objects.filter(
                id=pk, asset_type_id=assettype_pk, deleted_at__isnull=True
            )
            .select_related("base_attribute", "workspace")
            .first()
        )

        if override:
            for field in [
                "name",
                "is_required",
                "default_value",
                "description",
                "tags",
                "order",
            ]:
                if field in request.data:
                    setattr(override, field, request.data[field])
            override.save()

            base = override.base_attribute
            data = {
                "id": override.id,
                "asset_type_id": override.asset_type_id,
                "workspace_id": override.workspace_id,
                "workspace_name": override.workspace.name,
                "attribute_kind": "override",
                "is_override": True,
                "is_extension": False,
                "is_hidden": False,
                "base_attribute_id": base.id,
                "name": override.name or base.name,
                "api_key": base.api_key,
                "attribute_type": base.attribute_type,
                "is_required": (
                    override.is_required
                    if override.is_required is not None
                    else base.is_required
                ),
                "default_value": (
                    override.default_value
                    if override.default_value is not None
                    else base.default_value
                ),
                "description": (
                    override.description
                    if override.description is not None
                    else base.description
                ),
                "tags": override.tags if override.tags is not None else base.tags,
                "order": override.order if override.order is not None else base.order,
                "created_at": base.created_at,
                "updated_at": override.updated_at,
            }
            return Response(MergedAttributeSerializer(data).data)

        # Check if it's an extension
        extension = (
            WorkspaceExtensionAttribute.objects.filter(
                id=pk, asset_type_id=assettype_pk, deleted_at__isnull=True
            )
            .select_related("workspace")
            .first()
        )

        if extension:
            serializer = WorkspaceExtensionAttributeSerializer(
                extension, data=request.data, partial=partial
            )
            serializer.is_valid(raise_exception=True)
            serializer.save()
            extension.refresh_from_db()

            data = {
                "id": extension.id,
                "asset_type_id": extension.asset_type_id,
                "workspace_id": extension.workspace_id,
                "workspace_name": extension.workspace.name,
                "attribute_kind": "extension",
                "is_override": False,
                "is_extension": True,
                "is_hidden": extension.is_hidden,
                "base_attribute_id": None,
                "name": extension.name,
                "api_key": extension.api_key,
                "attribute_type": extension.attribute_type,
                "is_required": extension.is_required,
                "default_value": extension.default_value,
                "description": extension.description,
                "tags": extension.tags or [],
                "order": extension.order,
                "created_at": extension.created_at,
                "updated_at": extension.updated_at,
            }
            return Response(MergedAttributeSerializer(data).data)

        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    def partial_update(self, request, *args, **kwargs):
        """Handle PATCH requests."""
        kwargs["partial"] = True
        return self.update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        """
        Delete an attribute.

        - Global attribute via workspace endpoint: not allowed (use hide instead)
        - Global attribute via non-workspace endpoint: deletes the global attribute
        - Override: deletes the override (reverts to global)
        - Extension: deletes the extension
        """
        pk = self.kwargs["pk"]
        assettype_pk = self.kwargs["assettype_pk"]
        workspace_pk = self.kwargs.get("workspace_pk")

        # Check if it's a global attribute
        global_attr = GlobalAssetTypeAttribute.objects.filter(
            id=pk, asset_type_id=assettype_pk, deleted_at__isnull=True
        ).first()

        if global_attr:
            if workspace_pk:
                raise PermissionDenied(
                    "Cannot delete a global attribute from a workspace. "
                    "Use the hide action instead."
                )
            global_attr.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        # Check if it's an override
        override = WorkspaceAttributeOverride.objects.filter(
            id=pk, asset_type_id=assettype_pk, deleted_at__isnull=True
        ).first()

        if override:
            override.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        # Check if it's an extension
        extension = WorkspaceExtensionAttribute.objects.filter(
            id=pk, asset_type_id=assettype_pk, deleted_at__isnull=True
        ).first()

        if extension:
            extension.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    @extend_schema(
        tags=["Asset Type Attributes"],
        summary="Hide attribute for this workspace",
    )
    @action(detail=True, methods=["post"], url_path="hide")
    def hide(self, request, pk=None, workspace_pk=None, assettype_pk=None):
        """Hide an attribute for this workspace."""
        if not workspace_pk:
            return Response(
                {"error": "Hide action is only available via workspace endpoint"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check if it's a global attribute
        global_attr = GlobalAssetTypeAttribute.objects.filter(
            id=pk, asset_type_id=assettype_pk, deleted_at__isnull=True
        ).first()

        if global_attr:
            # Create hidden record
            WorkspaceHiddenAttribute.objects.get_or_create(
                hidden_attribute=global_attr,
                workspace_id=workspace_pk,
                asset_type_id=assettype_pk,
                defaults={"deleted_at": None},
            )
            return Response({"success": True, "hidden": True})

        # Check if it's an override (hide the underlying global attribute)
        override = (
            WorkspaceAttributeOverride.objects.filter(
                id=pk, asset_type_id=assettype_pk, deleted_at__isnull=True
            )
            .select_related("base_attribute")
            .first()
        )

        if override:
            # Create hidden record for the base attribute
            WorkspaceHiddenAttribute.objects.get_or_create(
                hidden_attribute=override.base_attribute,
                workspace_id=workspace_pk,
                asset_type_id=assettype_pk,
                defaults={"deleted_at": None},
            )
            return Response({"success": True, "hidden": True})

        # Check if it's an extension
        extension = WorkspaceExtensionAttribute.objects.filter(
            id=pk, asset_type_id=assettype_pk, deleted_at__isnull=True
        ).first()

        if extension:
            extension.is_hidden = True
            extension.save()
            return Response({"success": True, "hidden": True})

        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    @extend_schema(
        tags=["Asset Type Attributes"],
        summary="Unhide attribute for this workspace",
    )
    @action(detail=True, methods=["post"], url_path="unhide")
    def unhide(self, request, pk=None, workspace_pk=None, assettype_pk=None):
        """Unhide an attribute for this workspace."""
        if not workspace_pk:
            return Response(
                {"error": "Unhide action is only available via workspace endpoint"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check if it's a global attribute - remove hidden record
        global_attr = GlobalAssetTypeAttribute.objects.filter(
            id=pk, asset_type_id=assettype_pk, deleted_at__isnull=True
        ).first()

        if global_attr:
            WorkspaceHiddenAttribute.objects.filter(
                hidden_attribute=global_attr,
                workspace_id=workspace_pk,
            ).delete()
            return Response({"success": True, "hidden": False})

        # Check if it's an extension
        extension = WorkspaceExtensionAttribute.objects.filter(
            id=pk, asset_type_id=assettype_pk, deleted_at__isnull=True
        ).delete()

        if extension:
            extension.is_hidden = False
            extension.save()
            return Response({"success": True, "hidden": False})

        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    @extend_schema(
        tags=["Asset Type Attributes"],
        summary="Get all unique tags",
    )
    @action(detail=False, methods=["get"], url_path="tags")
    def tags(self, request, workspace_pk=None, assettype_pk=None):
        """Get all unique tags used in attributes."""
        all_tags = set()

        # Tags from global attributes
        for attr in GlobalAssetTypeAttribute.objects.filter(
            asset_type_id=assettype_pk, deleted_at__isnull=True
        ):
            if attr.tags:
                all_tags.update(attr.tags)

        # Tags from workspace overrides
        if workspace_pk:
            for override in WorkspaceAttributeOverride.objects.filter(
                asset_type_id=assettype_pk,
                workspace_id=workspace_pk,
                deleted_at__isnull=True,
            ):
                if override.tags:
                    all_tags.update(override.tags)

            # Tags from extensions
            for ext in WorkspaceExtensionAttribute.objects.filter(
                asset_type_id=assettype_pk,
                workspace_id=workspace_pk,
                deleted_at__isnull=True,
            ):
                if ext.tags:
                    all_tags.update(ext.tags)

        return Response(sorted(all_tags))

    @extend_schema(
        tags=["Asset Type Attributes"],
        summary="Get asset count for attribute",
    )
    @action(detail=True, methods=["get"], url_path="asset-count")
    def asset_count(self, request, pk=None, workspace_pk=None, assettype_pk=None):
        """Get count of assets with values for this attribute."""
        # For global attributes, we need to find by pk
        # For overrides, we need to use the base_attribute_id
        attribute_id = pk

        # Check if this is an override - if so, use base_attribute_id for the count
        override = WorkspaceAttributeOverride.objects.filter(
            id=pk, deleted_at__isnull=True
        ).first()
        if override:
            attribute_id = override.base_attribute_id

        if workspace_pk:
            workspace_asset_ids = WorkspaceAsset.objects.filter(
                workspace_id=workspace_pk
            ).values_list("asset_id", flat=True)

            count = (
                BaseAttributeValue.objects.filter(
                    asset_type_attribute_id=attribute_id,
                    asset_id__in=workspace_asset_ids,
                )
                .values("asset_id")
                .distinct()
                .count()
            )
        else:
            count = (
                BaseAttributeValue.objects.filter(asset_type_attribute_id=attribute_id)
                .values("asset_id")
                .distinct()
                .count()
            )

        return Response({"count": count})

    @extend_schema(
        tags=["Asset Type Attributes"],
        summary="Bulk update attribute order",
    )
    @action(detail=False, methods=["post"], url_path="reorder")
    def reorder(self, request, workspace_pk=None, assettype_pk=None):
        """Bulk update attribute order."""
        if not isinstance(request.data, list):
            return Response(
                {"error": "Expected a list of updates"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            for update in request.data:
                attr_id = update.get("id")
                new_order = update.get("order")

                if attr_id is None or new_order is None:
                    continue

                # Try global attribute
                global_attr = GlobalAssetTypeAttribute.objects.filter(
                    id=attr_id, asset_type_id=assettype_pk, deleted_at__isnull=True
                ).first()

                if global_attr:
                    if workspace_pk:
                        # Create/update override with new order
                        override, _ = WorkspaceAttributeOverride.objects.get_or_create(
                            base_attribute=global_attr,
                            workspace_id=workspace_pk,
                            asset_type_id=assettype_pk,
                            defaults={"deleted_at": None},
                        )
                        override.order = new_order
                        override.save()
                    else:
                        global_attr.order = new_order
                        global_attr.save()
                    continue

                # Try override
                override = WorkspaceAttributeOverride.objects.filter(
                    id=attr_id, asset_type_id=assettype_pk, deleted_at__isnull=True
                ).first()
                if override:
                    override.order = new_order
                    override.save()
                    continue

                # Try extension
                extension = WorkspaceExtensionAttribute.objects.filter(
                    id=attr_id, asset_type_id=assettype_pk, deleted_at__isnull=True
                ).first()
                if extension:
                    extension.order = new_order
                    extension.save()

        return Response({"success": True})

    @extend_schema(
        tags=["Asset Type Attributes"],
        summary="Get distinct values for this attribute",
    )
    @action(detail=True, methods=["get"])
    def values(self, request, assettype_pk=None, pk=None, workspace_pk=None):
        """Get distinct values for this attribute."""
        # Find the attribute to get its type
        global_attr = GlobalAssetTypeAttribute.objects.filter(
            id=pk, asset_type_id=assettype_pk, deleted_at__isnull=True
        ).first()

        attribute_type = None
        attribute_id = pk

        if global_attr:
            attribute_type = global_attr.attribute_type
        else:
            # Check override
            override = (
                WorkspaceAttributeOverride.objects.filter(
                    id=pk, deleted_at__isnull=True
                )
                .select_related("base_attribute")
                .first()
            )
            if override:
                attribute_type = override.base_attribute.attribute_type
                attribute_id = override.base_attribute_id
            else:
                # Check extension
                extension = WorkspaceExtensionAttribute.objects.filter(
                    id=pk, deleted_at__isnull=True
                ).first()
                if extension:
                    attribute_type = extension.attribute_type

        if not attribute_type:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        lookup_field = self.LOOKUP_MAP.get(attribute_type)
        if not lookup_field:
            return Response(
                {"error": f"Unsupported attribute type: {attribute_type}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        values_qs = (
            BaseAttributeValue.objects.filter(asset_type_attribute_id=attribute_id)
            .distinct(lookup_field)
            .only(lookup_field)
            .order_by(lookup_field)
            .values_list(lookup_field, flat=True)
        )

        paginator = CustomPageNumberPagination()
        page = paginator.paginate_queryset(values_qs, request)

        if page is not None:
            return paginator.get_paginated_response(page)
        return Response(list(values_qs))
