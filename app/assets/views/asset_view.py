from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination, CursorPagination
from django.db.models import Q, Count, Exists, OuterRef
from django.contrib.gis.geos import GEOSGeometry, Point
from django.contrib.gis.measure import D
from django.contrib.gis.db.models.functions import Centroid
from django.db.models import FloatField
from django.db.models.functions import Abs
from django_filters.rest_framework import DjangoFilterBackend
from django.core.cache import cache
from core.utils.cache_utils.cache_utils import cache_data, get_cached_data
from silk.profiling.profiler import silk_profile
from drf_spectacular.utils import (
    extend_schema,
    extend_schema_view,
    OpenApiExample,
    OpenApiParameter,
)
from audit_log.mixins import AuditLogMixin
from ..filter_serializers import FilterSerializer
from ..renderers import AssetCamelCaseJSONRenderer, AssetCamelCaseBrowsableAPIRenderer
import re
import json
import hashlib
import boto3
import os
from ..models import Asset
from ..serializers import AssetSerializer
import logging


def invalidate_asset_list_cache(asset):
    """Invalidate all cached asset list responses for this asset's workspaces.

    Called on asset create/update/delete via signals.
    """
    # Get all workspaces this asset belongs to
    workspace_ids = list(
        asset.workspace_memberships.values_list("workspace_id", flat=True)
    )

    # Invalidate cache for each workspace + asset_type combination
    for workspace_id in workspace_ids:
        # Increment version key to invalidate all cached pages
        version_key = f"asset_list_version:{workspace_id}:{asset.asset_type_id}"
        try:
            cache.incr(version_key)
        except ValueError:
            cache.set(version_key, 1, timeout=None)

        # Also invalidate workspace-level list (without asset_type filter)
        workspace_version_key = f"asset_list_version:{workspace_id}:all"
        try:
            cache.incr(workspace_version_key)
        except ValueError:
            cache.set(workspace_version_key, 1, timeout=None)


class AssetPageNumberPagination(PageNumberPagination):
    """Standard page-number pagination with cached count query.

    Caches the count for 30 seconds per workspace + filter combination
    to avoid slow COUNT queries on every request.
    """

    page_size = 50  # Reduced for better performance with many attributes
    page_size_query_param = "page_size"
    max_page_size = 500  # Cap max to prevent memory issues with 100+ attrs

    # Cache timeout in seconds
    count_cache_timeout = 30

    def paginate_queryset(self, queryset, request, view=None):
        """Override to cache the count query."""
        self.request = request
        self.view = view

        # Get workspace/org context from view kwargs
        workspace_pk = getattr(view, "kwargs", {}).get("workspace_pk")
        organization_pk = getattr(view, "kwargs", {}).get("organization_pk")

        # Build cache key from query SQL (captures all filters)
        query_sql = str(queryset.query)
        query_hash = hashlib.md5(query_sql.encode()).hexdigest()[:16]
        cache_key = f"asset_count:{query_hash}"

        # Try to get cached count
        cached_count = None
        org_id = None
        ws_id = None

        if workspace_pk or organization_pk:
            from uuid import UUID

            org_id = UUID(organization_pk) if organization_pk else None
            ws_id = UUID(workspace_pk) if workspace_pk else None

            # For workspace queries, we need org_id - get it from workspace
            if ws_id and not org_id:
                from workspaces.models import Workspace

                try:
                    org_id = Workspace.objects.values_list(
                        "organization_id", flat=True
                    ).get(pk=ws_id)
                except Workspace.DoesNotExist:
                    pass

            if org_id:
                cached_count = get_cached_data(org_id, ws_id, key=cache_key)

        if cached_count is not None:
            self.count = cached_count
        else:
            # Execute the count query
            self.count = queryset.count()

            # Cache the result
            if org_id:
                cache_data(
                    org_id,
                    ws_id,
                    key=cache_key,
                    data=self.count,
                    timeout=self.count_cache_timeout,
                )

        # Standard pagination logic (copied from parent, but using self.count)
        page_size = self.get_page_size(request)
        if not page_size:
            return None

        from django.core.paginator import Paginator

        paginator = Paginator(queryset, page_size)
        # Override the paginator's count to use our cached value
        paginator.count = self.count

        page_number = request.query_params.get(self.page_query_param, 1)
        try:
            self.page = paginator.page(page_number)
        except Exception:
            from rest_framework.exceptions import NotFound

            raise NotFound("Invalid page.")

        if paginator.num_pages > 1 and self.template is not None:
            self.display_page_controls = True

        return list(self.page)


class AssetCursorPagination(CursorPagination):
    """Cursor-based pagination - O(1) performance regardless of table size.

    Use this for infinite scroll UIs or when you don't need page numbers.
    No COUNT query = fast for millions of records.

    To use: add ?cursor_pagination=true to request
    """

    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 500
    ordering = "-created_at"  # Must have index on this field
    cursor_query_param = "cursor"


# Keep old name for backwards compatibility
AssetPagination = AssetPageNumberPagination


@extend_schema_view(
    list=extend_schema(
        tags=["Assets"],
        parameters=[
            OpenApiParameter(
                name="cursor_pagination",
                type=bool,
                location=OpenApiParameter.QUERY,
                description="Use cursor-based pagination for better performance with large datasets. "
                "No page numbers, but O(1) performance regardless of table size.",
            ),
        ],
    ),
    create=extend_schema(tags=["Assets"]),
    retrieve=extend_schema(tags=["Assets"]),
    update=extend_schema(tags=["Assets"]),
    partial_update=extend_schema(tags=["Assets"]),
    destroy=extend_schema(tags=["Assets"]),
)
class AssetViewSet(AuditLogMixin, viewsets.ModelViewSet):
    """
    ViewSet for Asset model.

    Assets are instances of asset types with dynamic field values.

    Pagination Options:
    - Default (page number): ?page=1&page_size=50 - includes total count
    - Cursor: ?cursor_pagination=true - faster for large tables, no count
    """

    serializer_class = AssetSerializer
    renderer_classes = [AssetCamelCaseJSONRenderer, AssetCamelCaseBrowsableAPIRenderer]
    pagination_class = AssetPagination
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_fields = ["asset_type"]
    search_fields = ["name", "description"]
    ordering_fields = ["name", "created_at"]

    # Audit logging configuration
    audit_action_messages = {
        "create": "Created asset: {obj}",
        "update": "Updated asset: {obj}",
        "partial_update": "Updated asset: {obj}",
        "destroy": "Deleted asset: {obj}",
    }

    @property
    def paginator(self):
        """Dynamically select pagination class based on request params.

        Use ?cursor_pagination=true for large datasets to skip COUNT query.
        """
        if not hasattr(self, "_paginator"):
            if (
                self.request
                and self.request.query_params.get("cursor_pagination", "").lower()
                == "true"
            ):
                self._paginator = AssetCursorPagination()
            elif self.pagination_class is not None:
                self._paginator = self.pagination_class()
            else:
                self._paginator = None
        return self._paginator

    def get_queryset(self):
        """Filter assets by workspace or organization"""
        workspace_pk = self.kwargs.get("workspace_pk")
        organization_pk = self.kwargs.get("organization_pk")

        # If accessed via nested route under asset type, filter by asset type
        if "assettype_pk" in self.kwargs:
            if workspace_pk:
                # Filter by asset type AND workspace visibility
                queryset = Asset.objects.filter(
                    asset_type_id=self.kwargs["assettype_pk"],
                    workspace_memberships__workspace_id=workspace_pk,
                )
            elif organization_pk:
                # Organization-level: filter by asset type AND organization
                queryset = Asset.objects.filter(
                    asset_type_id=self.kwargs["assettype_pk"],
                    organization_id=organization_pk,
                )
            else:
                # No workspace or org filter - just filter by asset type
                queryset = Asset.objects.filter(
                    asset_type_id=self.kwargs["assettype_pk"],
                )
        elif workspace_pk:
            # Filter by workspace via WorkspaceAsset join table
            queryset = Asset.objects.filter(
                workspace_memberships__workspace_id=workspace_pk,
            )
        elif organization_pk:
            # Filter by organization (org-level endpoint, aggregates all workspaces)
            queryset = Asset.objects.filter(
                organization_id=organization_pk,
            )
        else:
            # Top-level access: return all assets
            queryset = Asset.objects.all()

        # Select related for asset_type and organization to avoid N+1 queries
        queryset = queryset.select_related("asset_type", "organization")

        return queryset.distinct()

    def get_serializer_context(self):
        """Add workspace to serializer context"""
        context = super().get_serializer_context()
        workspace_pk = self.kwargs.get("workspace_pk")
        if workspace_pk:
            from workspaces.models import Workspace

            try:
                context["workspace"] = Workspace.objects.get(pk=workspace_pk)
            except Workspace.DoesNotExist:
                pass

        return context

    def _build_workspace_asset_map(self, assets, workspace_pk):
        """Build a map of asset_id -> WorkspaceAsset for efficient lookup in serializer.

        The serializer uses this to get cached_attribute_overrides for each asset.
        """
        if not workspace_pk or not assets:
            return {}

        from ..models import WorkspaceAsset

        asset_ids = [a.id for a in assets]
        workspace_assets = WorkspaceAsset.objects.filter(
            workspace_id=workspace_pk,
            asset_id__in=asset_ids,
        ).only("asset_id", "cached_attribute_overrides")

        return {wa.asset_id: wa for wa in workspace_assets}

    def _get_cache_key(self, request):
        """Build cache key for asset list response.

        Includes workspace, asset_type, and all query params for uniqueness.
        Uses a version key that gets incremented on asset changes.
        """
        workspace_pk = self.kwargs.get("workspace_pk", "")
        assettype_pk = self.kwargs.get("assettype_pk", "all")

        # Get current version (incremented on asset changes)
        version_key = f"asset_list_version:{workspace_pk}:{assettype_pk}"
        version = cache.get(version_key, 0)

        # Include all query params in cache key
        params = request.query_params.urlencode()
        params_hash = hashlib.md5(params.encode()).hexdigest()[:12]

        return f"asset_list:{workspace_pk}:{assettype_pk}:v{version}:{params_hash}"

    def list(self, request, *args, **kwargs):
        """Override list with response caching.

        Caches the JSON response for 60 seconds. Cache is invalidated
        when any asset in the workspace/asset_type is created, updated, or deleted.
        """
        cache_key = self._get_cache_key(request)

        # Try to get cached response
        cached_response = cache.get(cache_key)
        if cached_response is not None:
            return Response(cached_response)

        with silk_profile(name="1. filter_queryset"):
            queryset = self.filter_queryset(self.get_queryset())

        with silk_profile(name="2. paginate_queryset"):
            page = self.paginate_queryset(queryset)

        if page is not None:
            context = self.get_serializer_context()

            # Build workspace asset map for serializer to get cached_attribute_overrides
            workspace_pk = self.kwargs.get("workspace_pk")
            workspace_asset_map = self._build_workspace_asset_map(page, workspace_pk)
            context["_workspace_asset_map"] = workspace_asset_map

            with silk_profile(name="3. serializer.data"):
                serializer = self.get_serializer(page, many=True, context=context)
                data = serializer.data

            with silk_profile(name="4. get_paginated_response"):
                response = self.get_paginated_response(data)
                cache.set(cache_key, response.data)
                return response

        # Non-paginated response
        assets = list(queryset)
        context = self.get_serializer_context()

        # Build workspace asset map for serializer to get cached_attribute_overrides
        workspace_pk = self.kwargs.get("workspace_pk")
        workspace_asset_map = self._build_workspace_asset_map(assets, workspace_pk)
        context["_workspace_asset_map"] = workspace_asset_map

        serializer = self.get_serializer(assets, many=True, context=context)
        response_data = serializer.data
        cache.set(cache_key, response_data)
        return Response(response_data)

    def retrieve(self, request, *args, **kwargs):
        """Override retrieve to add workspace asset to context"""
        instance = self.get_object()

        context = self.get_serializer_context()

        # Build workspace asset map for this single asset
        workspace_pk = self.kwargs.get("workspace_pk")
        workspace_asset_map = self._build_workspace_asset_map([instance], workspace_pk)
        context["_workspace_asset_map"] = workspace_asset_map

        serializer = self.get_serializer(instance, context=context)
        return Response(serializer.data)

    def update(self, request, *args, **kwargs):
        """Override update to re-fetch instance with optimized queryset after save.

        The default DRF update returns the saved instance directly, but we need
        the prefetched/annotated attributes for proper serialization.
        """
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)

        if getattr(instance, "_prefetched_objects_cache", None):
            # If 'prefetch_related' has been applied to a queryset, we need to
            # forcibly invalidate the prefetch cache on the instance.
            instance._prefetched_objects_cache = {}

        # Re-fetch instance with proper prefetching and annotations
        instance = self.get_queryset().get(pk=instance.pk)

        context = self.get_serializer_context()

        # Build workspace asset map for this single asset
        workspace_pk = self.kwargs.get("workspace_pk")
        workspace_asset_map = self._build_workspace_asset_map([instance], workspace_pk)
        context["_workspace_asset_map"] = workspace_asset_map

        serializer = self.get_serializer(instance, context=context)
        return Response(serializer.data)

    def perform_create(self, serializer):
        """Create asset owned by workspace's organization and link to workspace"""
        from workspaces.models import Workspace
        from ..models import WorkspaceAsset

        workspace_pk = self.kwargs.get("workspace_pk")
        workspace = Workspace.objects.select_related("organization").get(
            pk=workspace_pk
        )

        # If nested under asset type, use that; otherwise require it in request
        if "assettype_pk" in self.kwargs:
            asset = serializer.save(
                organization=workspace.organization,
                asset_type_id=self.kwargs["assettype_pk"],
            )
        else:
            asset = serializer.save(organization=workspace.organization)

        # Create the workspace link
        WorkspaceAsset.objects.create(
            workspace=workspace,
            asset=asset,
            added_by=self.request.user if self.request.user.is_authenticated else None,
        )

    @extend_schema(tags=["Assets"])
    @action(detail=True, methods=["post"])
    def validate_fields(self, request, assettype_pk=None, pk=None):
        """Validate the asset's field values against its type definition"""
        asset = self.get_object()
        errors = asset.validate_fields()
        if errors:
            return Response({"valid": False, "errors": errors}, status=400)
        return Response({"valid": True, "errors": {}})

    @extend_schema(
        tags=["Assets"],
        description="Update an asset's attribute value for a workspace",
        request={
            "application/json": {
                "type": "object",
                "properties": {
                    "attribute_id": {
                        "type": "string",
                        "format": "uuid",
                        "description": "ID of the attribute to update",
                    },
                    "value": {
                        "description": "New value for the attribute (type depends on attribute definition)"
                    },
                },
                "required": ["attribute_id", "value"],
            }
        },
    )
    @action(detail=True, methods=["post"], url_path="update-attribute")
    def update_attribute(self, request, workspace_pk=None, assettype_pk=None, pk=None):
        """
        Update an asset's attribute value for a workspace.

        This creates or updates an attribute value for the asset.
        The value is stored as a workspace-specific override.
        """
        from django.db import transaction
        from ..models import BaseAttributeValue, BaseAssetTypeAttribute
        from audit_log.logging import AuditLogger

        asset = self.get_object()
        attribute_id = request.data.get("attribute_id")
        value = request.data.get("value")

        if not attribute_id or value is None:
            return Response(
                {"error": "Both 'attribute_id' and 'value' are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            # Get the attribute definition
            attribute = BaseAssetTypeAttribute.objects.get(id=attribute_id)

            # Verify attribute belongs to this asset's type
            if attribute.asset_type_id != asset.asset_type_id:
                return Response(
                    {"error": "Attribute does not belong to this asset's type"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        except BaseAssetTypeAttribute.DoesNotExist:
            return Response(
                {"error": "Attribute not found"}, status=status.HTTP_404_NOT_FOUND
            )

        # Get the real polymorphic instance to determine the value type
        real_attribute = attribute.get_real_instance()

        # For some polymorphic types like WorkspaceHiddenAttribute, we need to get the actual attribute with the type
        attr_with_type = real_attribute
        if (
            not hasattr(real_attribute, "attribute_type")
            or not real_attribute.attribute_type
        ):
            # If this is a reference type (like WorkspaceHiddenAttribute), get the underlying attribute
            if hasattr(real_attribute, "hidden_attribute_id"):
                # This is a WorkspaceHiddenAttribute, get the hidden attribute
                attr_with_type = real_attribute.hidden_attribute.get_real_instance()
            elif hasattr(real_attribute, "base_attribute_id"):
                # This is a WorkspaceOverrideAssetTypeAttribute, get the base attribute
                attr_with_type = real_attribute.base_attribute.get_real_instance()

        with transaction.atomic():
            # Get or create the attribute value with the proper type
            from ..models import (
                TextAttributeValue,
                NumberAttributeValue,
                BooleanAttributeValue,
                DateAttributeValue,
                DateTimeAttributeValue,
                JSONAttributeValue,
                LinkAttributeValue,
            )

            # Map attribute types to value model classes
            type_to_model = {
                "text": TextAttributeValue,
                "number": NumberAttributeValue,
                "boolean": BooleanAttributeValue,
                "date": DateAttributeValue,
                "datetime": DateTimeAttributeValue,
                "json": JSONAttributeValue,
                "link": LinkAttributeValue,
            }

            attr_type = getattr(attr_with_type, "attribute_type", None)
            if not attr_type:
                return Response(
                    {"error": "Attribute type not found"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            ValueModel = type_to_model.get(attr_type)

            if not ValueModel:
                return Response(
                    {"error": f"Unknown attribute type: {attr_type}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Import the override join table
            from ..models import WorkspaceAttributeValueOverride

            # Get or create the value
            old_value = None
            base_value = None

            # First, try to find the base/global value for this asset+attribute
            # Exclude values that are workspace overrides (they have an entry in overrides_base)
            base_value = ValueModel.objects.filter(
                asset=asset,
                asset_type_attribute_id=attr_with_type.id,
                overrides_base__isnull=True,  # Not a workspace override
            ).first()
            if base_value:
                old_value = base_value.value if hasattr(base_value, "value") else None

            if workspace_pk:
                # Workspace context: check for existing override or create one
                try:
                    from workspaces.models import Workspace

                    workspace = Workspace.objects.get(id=workspace_pk)
                except Workspace.DoesNotExist:
                    return Response(
                        {"error": "Workspace not found"},
                        status=status.HTTP_404_NOT_FOUND,
                    )

                # Look for existing override for this workspace
                # Use override_value__asset since base_value can be null for local attributes
                existing_override = (
                    WorkspaceAttributeValueOverride.objects.filter(
                        asset_type_attribute_id=attr_with_type.id,
                        override_value__asset=asset,
                        workspace=workspace,
                    )
                    .select_related("override_value")
                    .first()
                )

                if existing_override:
                    # Update the existing override value
                    attr_value = existing_override.override_value.get_real_instance()
                    old_value = (
                        attr_value.value if hasattr(attr_value, "value") else None
                    )

                    # TextAttributeValue doesn't allow null, convert to empty string
                    if ValueModel == TextAttributeValue and value is None:
                        value = ""

                    # Update the value
                    attr_value.value = value
                    attr_value.save()

                    # Log the change
                    AuditLogger.log(
                        action="update",
                        message=f"Updated workspace override for '{attr_with_type.name}' from '{old_value}' to '{value}'",
                        target=asset,
                        references=[
                            (attr_with_type, "attribute"),
                            (attr_with_type.asset_type, "asset_type"),
                            (workspace, "workspace"),
                        ],
                    )
                else:
                    # Create a new workspace-specific override value
                    override_value = ValueModel(
                        asset=asset,
                        asset_type_attribute_id=attr_with_type.id,
                    )
                    # TextAttributeValue doesn't allow null, convert to empty string
                    if ValueModel == TextAttributeValue and value is None:
                        value = ""
                    override_value.value = value
                    override_value.save()

                    # Create the override link (base_value can be null if no global value exists)
                    WorkspaceAttributeValueOverride.objects.create(
                        asset_type_attribute_id=attr_with_type.id,
                        base_value=base_value,  # May be None
                        override_value=override_value,
                        workspace=workspace,
                    )

                    # Log the change
                    AuditLogger.log(
                        action="create",
                        message=f"Created workspace override for '{attr_with_type.name}': '{value}'",
                        target=asset,
                        references=[
                            (attr_with_type, "attribute"),
                            (attr_with_type.asset_type, "asset_type"),
                            (workspace, "workspace"),
                        ],
                    )

                # Invalidate list cache
                invalidate_asset_list_cache(asset)

                # Re-fetch asset with full prefetch/annotations (refresh_from_db doesn't include prefetch)
                asset = self.get_queryset().get(pk=asset.pk)
                context = self.get_serializer_context()
                workspace_asset_map = self._build_workspace_asset_map(
                    [asset], workspace_pk
                )
                context["_workspace_asset_map"] = workspace_asset_map
                serializer = self.get_serializer(asset, context=context)

                return Response(
                    {
                        "success": True,
                        "message": f"Updated {attr_with_type.name} for workspace",
                        "asset": serializer.data,
                    }
                )
            else:
                # No workspace context: update or create the base value
                if base_value:
                    attr_value = base_value
                else:
                    attr_value = ValueModel(
                        asset=asset, asset_type_attribute_id=attr_with_type.id
                    )

            # TextAttributeValue doesn't allow null, convert to empty string
            if ValueModel == TextAttributeValue and value is None:
                value = ""

            # Update the value
            if attr_type == "link":
                # LinkAttributeValue has url and display_text
                attr_value.value = value
            else:
                attr_value.value = value

            attr_value.save()

            # Log the change
            AuditLogger.log(
                action="update",
                message=f"Updated attribute value '{attr_with_type.name}' from '{old_value}' to '{value}'",
                target=asset,
                references=[
                    (attr_with_type, "attribute"),
                    (attr_with_type.asset_type, "asset_type"),
                ],
            )

        # Invalidate list cache
        invalidate_asset_list_cache(asset)

        # Re-fetch asset with full prefetch/annotations (refresh_from_db doesn't include prefetch)
        asset = self.get_queryset().get(pk=asset.pk)

        # Serialize and return the updated asset
        context = self.get_serializer_context()
        workspace_asset_map = self._build_workspace_asset_map([asset], workspace_pk)
        context["_workspace_asset_map"] = workspace_asset_map
        serializer = self.get_serializer(asset, context=context)

        return Response(
            {
                "success": True,
                "message": f"Updated {attr_with_type.name}",
                "asset": serializer.data,
            }
        )

    @extend_schema(
        tags=["Assets"],
        summary="Get related assets (parent, siblings, and children)",
        description="Returns the parent asset (if any), sibling assets, and all child assets for the specified asset. Each related asset includes a 'relatedUrl' to fetch its own relationships.",
    )
    @action(detail=True, methods=["get"])
    def related(
        self,
        request,
        workspace_pk=None,
        assettype_pk=None,
        organization_pk=None,
        pk=None,
    ):
        """Get related assets (parent, siblings, and children) for an asset"""
        asset = self.get_object()

        def build_related_url(asset_id):
            """Build the URL to fetch related assets for a given asset"""
            if workspace_pk:
                return request.build_absolute_uri(
                    f"/api/workspaces/{workspace_pk}/assets/{asset_id}/related/"
                )
            else:
                return request.build_absolute_uri(
                    f"/api/organizations/{organization_pk}/assets/{asset_id}/related/"
                )

        def serialize_asset(a):
            """Serialize an asset for the response"""
            return {
                "id": str(a.id),
                "name": a.name,
                "asset_type": str(a.asset_type_id),
                "asset_type_name": a.asset_type.name,
                "related_url": build_related_url(a.id),
                "has_children": a.children.exists(),
            }

        # Get parent (simple serialization without nested attributes)
        parent_data = None
        siblings_data = []
        if asset.parent:
            parent_data = serialize_asset(asset.parent)
            # Get siblings (other children of the same parent, excluding current asset)
            siblings = (
                asset.parent.children.select_related("asset_type")
                .prefetch_related("children")
                .exclude(id=asset.id)
            )
            siblings_data = [serialize_asset(sibling) for sibling in siblings]

        # Get children with their own related URLs
        children = (
            asset.children.select_related("asset_type")
            .prefetch_related("children")
            .all()
        )
        children_data = [serialize_asset(child) for child in children]

        return Response(
            {
                "parent": parent_data,
                "siblings": siblings_data,
                "children": children_data,
            }
        )

    @extend_schema(
        tags=["Assets"],
        summary="Filter assets by attributes and geography",
        description="Filter assets by asset type, attribute values, and geography with AND/OR logic. Supports equals, contains, gt, lt, gte, lte operators for attributes, and h3, bbox, distance, within, contains, intersects for geographic filters.",
        parameters=[
            OpenApiParameter(
                name="page",
                type=int,
                location=OpenApiParameter.QUERY,
                description="Page number for paginated results",
                required=False,
            ),
            OpenApiParameter(
                name="page_size",
                type=int,
                location=OpenApiParameter.QUERY,
                description="Number of results per page",
                required=False,
            ),
        ],
        examples=[
            OpenApiExample(
                "Geometry Location Filter (GeoJSON)",
                description="Filter assets within a GeoJSON polygon covering New Orleans.",
                value={
                    "logic": "AND",
                    "filters": [
                        {
                            "field": "geometry",
                            "operator": "within",
                            "value": {
                                "type": "Polygon",
                                "coordinates": [
                                    [
                                        [-90.1401, 29.9096],
                                        [-90.1401, 30.0707],
                                        [-89.8826, 30.0707],
                                        [-89.8826, 29.9096],
                                        [-90.1401, 29.9096],
                                    ]
                                ],
                            },
                        }
                    ],
                },
                request_only=True,
            ),
            OpenApiExample(
                "Datetime Filtering",
                description="Filter assets created after a specific datetime (UTC)",
                value={
                    "logic": "AND",
                    "filters": [
                        {
                            "field": "created_at",
                            "value": "2024-01-01T00:00:00Z",
                            "operator": "gte",
                        }
                    ],
                },
                request_only=True,
            ),
            OpenApiExample(
                "Combined Attribute and Datetime",
                description="Filter assets by status and created_at range",
                value={
                    "logic": "AND",
                    "filters": [
                        {
                            "field": "status",
                            "value": "active",
                            "operator": "equals",
                        },
                        {
                            "field": "created_at",
                            "value": "2024-01-01T00:00:00Z",
                            "operator": "gte",
                        },
                        {
                            "field": "created_at",
                            "value": "2024-01-31T23:59:59Z",
                            "operator": "lte",
                        },
                    ],
                },
                request_only=True,
            ),
            OpenApiExample(
                "Geometry Location Filter",
                description="Filter assets within a polygon covering New Orleans (WKT)",
                value={
                    "logic": "AND",
                    "filters": [
                        {
                            "field": "geometry",
                            "operator": "within",
                            "value": "POLYGON((-90.1401 29.9096, -90.1401 30.0707, -89.8826 30.0707, -89.8826 29.9096, -90.1401 29.9096))",
                        }
                    ],
                },
                request_only=True,
            ),
            OpenApiExample(
                "Asset Type Name Filter",
                description="Filter assets by asset type name (case-insensitive)",
                value={
                    "logic": "AND",
                    "filters": [
                        {
                            "field": "asset_type__name",
                            "value": "Restaurant",
                            "operator": "exact",
                        }
                    ],
                },
                request_only=True,
            ),
            OpenApiExample(
                "Bounding Box Filter",
                description="Filter assets within a bounding box covering New Orleans (minLon, minLat, maxLon, maxLat)",
                value={
                    "logic": "AND",
                    "filters": [
                        {
                            "field": "geometry",
                            "operator": "intersects",
                            "value": "POLYGON((-90.1401 29.9096, -90.1401 30.0707, -89.8826 30.0707, -89.8826 29.9096, -90.1401 29.9096))",
                        }
                    ],
                },
                request_only=True,
            ),
        ],
    )
    @action(detail=False, methods=["post"])
    def search(
        self, request, workspace_pk=None, assettype_pk=None, organization_pk=None
    ):
        """Search assets by multiple attribute and geographic conditions with AND/OR logic"""
        filter_config = request.data

        # If accessed via nested route, filter by asset type
        if assettype_pk:
            queryset = Asset.objects.filter(asset_type_id=assettype_pk)
        elif workspace_pk:
            # Use Exists subquery instead of join to avoid duplicates and expensive DISTINCT
            from ..models import WorkspaceAsset

            workspace_filter = WorkspaceAsset.objects.filter(
                workspace_id=workspace_pk,
                asset_id=OuterRef("pk"),
            )
            queryset = Asset.objects.filter(Exists(workspace_filter))
        elif organization_pk:
            queryset = Asset.objects.filter(organization_id=organization_pk)
        else:
            queryset = Asset.objects.all()

        if filter_config:
            with silk_profile(name="search: build_query"):
                q_filter = FilterSerializer(data=filter_config).build_query()

            # If the built Q contains any h3 prefilter metadata, apply an
            # index-friendly LEFT(...) prefilter (organization-scoped only).
            # Only add the LEFT(...) predicate here — organization and deleted
            # predicates are already applied by the base queryset/manager.
            if (
                organization_pk
                and q_filter is not None
                and hasattr(q_filter, "_h3_prefilters")
            ):
                try:
                    h3s = q_filter._h3_prefilters
                    if h3s:
                        or_parts = []
                        params = []
                        for p in h3s:
                            prefix = p["prefix"]
                            plen = p["len"]
                            if p.get("case_insensitive"):
                                or_parts.append(
                                    "LOWER(LEFT(assets_asset.h3_index, %s)) = %s"
                                )
                            else:
                                or_parts.append("LEFT(assets_asset.h3_index, %s) = %s")
                            params.extend([plen, prefix])

                        clause = "(" + " OR ".join(or_parts) + ")"
                        queryset = queryset.extra(where=[clause], params=params)
                except Exception:
                    pass

            if q_filter:
                with silk_profile(name="search: apply_filter"):
                    queryset = queryset.filter(q_filter)

        # Select related for asset_type and organization
        queryset = queryset.select_related("asset_type", "organization")

        # Build serializer context with workspace
        context = self.get_serializer_context()
        if workspace_pk:
            from workspaces.models import Workspace

            try:
                context["workspace"] = Workspace.objects.get(pk=workspace_pk)
            except Workspace.DoesNotExist:
                pass

        # Debug: log final SQL generated by the ORM to inspect differences
        try:
            logger = logging.getLogger(__name__)
            logger.debug("Final search SQL: %s", str(queryset.query))
        except Exception:
            pass

        with silk_profile(name="search: paginate_queryset"):
            page = self.paginate_queryset(queryset)
        assets = page if page is not None else list(queryset)

        # Build workspace asset map for serializer to get cached_attribute_overrides
        with silk_profile(name="search: build_workspace_asset_map"):
            workspace_asset_map = self._build_workspace_asset_map(assets, workspace_pk)
        context["_workspace_asset_map"] = workspace_asset_map

        with silk_profile(name="search: serializer.data"):
            serializer = self.get_serializer(assets, many=True, context=context)
            data = serializer.data

        if page is not None:
            return self.get_paginated_response(data)

        return Response(data)

    @extend_schema(
        tags=["Assets"],
        summary="Interpret natural language search query",
        description="Convert natural language search into structured filter configuration",
        request={
            "application/json": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Natural language search query",
                    }
                },
            }
        },
        examples=[
            OpenApiExample(
                "Simple text search",
                value={"query": "restaurants"},
                request_only=True,
            ),
            OpenApiExample(
                "Location-based search",
                value={"query": "buildings in French Quarter"},
                request_only=True,
            ),
        ],
    )
    @action(detail=False, methods=["post"])
    def interpret_search(self, request, workspace_pk=None):
        """Interpret natural language search query using AWS Bedrock and return structured filters"""
        query_text = request.data.get("query", "").strip()

        if not query_text:
            return Response(
                {"filters": [], "logic": "AND", "interpretation": "No query provided"}
            )

        try:
            # Use AWS Bedrock with Claude to interpret the query
            filters, logic, interpretation = self._interpret_with_bedrock(query_text)
        except Exception as e:
            # Fallback to simple keyword matching if Bedrock fails
            print(f"Bedrock interpretation failed: {e}")
            raise ValueError("Bedrock interpretation failed") from e

        return Response(
            {
                "query": query_text,
                "filters": filters,
                "logic": logic,
                "interpretation": interpretation,
            }
        )

    def _interpret_with_bedrock(self, query_text):
        """Use AWS Bedrock Claude to interpret natural language query"""
        # Initialize Bedrock client
        bedrock = boto3.client(
            "bedrock-runtime",
            endpoint_url=os.environ.get("LAMBDA_ENDPOINT", "http://localstack:4566"),
            aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID", "test"),
            aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY", "test"),
            region_name=os.environ.get("AWS_DEFAULT_REGION", "us-east-1"),
        )

        # Create prompt explaining the filter system
        prompt = f"""Convert this natural language search query into structured filters for an asset search system.

Query: "{query_text}"

Examples of filter configurations:
1. Search for assets of a specific type:
Prompt: "Find all restaurants"
Filters: {{"filters": [{{"field": "assetType.name", "value": "restaurant", "operator": "icontains"}}], "logic": "AND"}}

2. Search for assets by name:
Prompt: "Assets named Central Park"
Filters: {{"filters": [{{"field": "name", "value": "Central Park", "operator": "icontains"}}], "logic": "AND"}}

3. Search for assets with specific attribute values:
Prompt: "Hotels with more than 100 rooms"
Filters: {{"filters": [{{"field": "attributes.number_of_rooms", "value": 100, "operator": "gt"}}], "logic": "AND"}}

4. Search for assets within a geographic area:
Prompt: "Assets of type Park or Garden in downtown area"
Filters: {{"filters": [{{"field": "geometry", "value": "POLYGON((...))", "operator": "within"}}, {{"logic": "OR", "filters": [{{"field": "assetType.name", "value": "park", "operator": "icontains"}}, {{"field": "assetType.name", "value": "garden", "operator": "icontains"}}]}}], "logic": "AND"}}

Format the output as follows:
{{
    "interpretation": "<brief description of how the query was interpreted>",
    "filters": [<array of filter objects>],
    "logic": "AND" or "OR"
}}
"""

        # Call Bedrock Claude
        try:
            response = bedrock.invoke_model(
                modelId="anthropic.claude-3-sonnet-20240229-v1:0",
                body=json.dumps(
                    {
                        "anthropic_version": "bedrock-2023-05-31",
                        "max_tokens": 1000,
                        "messages": [{"role": "user", "content": prompt}],
                    }
                ),
            )

            response_body = json.loads(response["body"].read())
            result_text = response_body["content"][0]["text"]

            # Parse JSON from response
            result = json.loads(result_text)
            filters = result.get("filters", [])
            logic = result.get("logic", "AND")
            interpretation = result.get("interpretation", query_text)

            return filters, logic, interpretation

        except Exception as e:
            print(f"Error calling Bedrock: {e}")
            raise

    @extend_schema(
        tags=["Assets"],
        summary="Get assets as map tiles",
        description="Optimized endpoint for map rendering. Returns lightweight GeoJSON-like features with pagination support.",
        parameters=[
            OpenApiParameter(
                name="bbox",
                description="Bounding box as minLon,minLat,maxLon,maxLat",
                required=False,
                type=str,
            ),
            OpenApiParameter(
                name="limit",
                description="Maximum number of features to return per page (default 1000)",
                required=False,
                type=int,
            ),
            OpenApiParameter(
                name="offset",
                description="Number of features to skip for pagination",
                required=False,
                type=int,
            ),
            OpenApiParameter(
                name="zoom",
                description="Map zoom level (0-22) for filtering out small geometries",
                required=False,
                type=int,
            ),
            OpenApiParameter(
                name="min_pixel_size",
                description="Minimum pixel size for geometries to be included (default 50)",
                required=False,
                type=int,
            ),
        ],
    )
    @action(detail=False, methods=["get", "post"])
    def tiles(self, request, workspace_pk=None, organization_pk=None):
        """Get assets as lightweight GeoJSON features for map rendering"""
        # Start with base queryset
        queryset = Asset.objects.all()

        # Filter by organization if provided (org-level endpoint)
        if organization_pk:
            queryset = queryset.filter(organization_id=organization_pk)

        # Filter by workspace if provided (workspace-level endpoint)
        if workspace_pk:
            queryset = queryset.filter(workspace_memberships__workspace_id=workspace_pk)

        # Apply search filters if provided (POST request)
        if request.method == "POST" and request.data:
            filter_config = request.data
            q_filter = FilterSerializer(data=filter_config).build_query()
            if q_filter:
                queryset = queryset.filter(q_filter)

        # Only use distinct when joining workspace_memberships (which can create duplicates)
        if workspace_pk:
            queryset = queryset.distinct()

        # Apply bounding box filter and compute center for distance ordering
        bbox_param = request.query_params.get("bbox")
        center_point = None
        bbox_width_degrees = None
        if bbox_param:
            try:
                bounds = [float(x) for x in bbox_param.split(",")]
                if len(bounds) == 4:
                    bbox = GEOSGeometry(
                        f"POLYGON(({bounds[0]} {bounds[1]}, {bounds[2]} {bounds[1]}, {bounds[2]} {bounds[3]}, {bounds[0]} {bounds[3]}, {bounds[0]} {bounds[1]}))",
                        srid=4326,
                    )
                    queryset = queryset.filter(geometry__intersects=bbox)
                    # Calculate center of bbox for distance ordering
                    center_lon = (bounds[0] + bounds[2]) / 2
                    center_lat = (bounds[1] + bounds[3]) / 2
                    center_point = Point(center_lon, center_lat, srid=4326)
                    # Store bbox width for size filtering
                    bbox_width_degrees = bounds[2] - bounds[0]
            except (ValueError, TypeError):
                pass

        # Filter out small geometries based on zoom level
        # This reduces data transfer and improves client rendering performance
        zoom_param = request.query_params.get("zoom")
        min_pixel_size_param = request.query_params.get("min_pixel_size")

        # Check if user has applied any geometry type filter
        # If so, skip size-based filtering - they explicitly want to see those geometry types
        # regardless of size (e.g., showing only Lines or only Polygons should show all of them)
        has_geometry_type_filter = False
        if request.method == "POST" and request.data:
            filters = request.data.get("filters", [])
            for f in filters:
                if f.get("field") == "geometry_type":
                    has_geometry_type_filter = True
                    break

        if zoom_param is not None and not has_geometry_type_filter:
            try:
                zoom = int(zoom_param)
                min_pixel_size = (
                    int(min_pixel_size_param) if min_pixel_size_param else 50
                )

                # Calculate minimum size in degrees based on zoom level
                # At zoom 0, world is 256 pixels = 360 degrees
                # Each zoom level doubles the pixels (halves degrees per pixel)
                # degrees_per_pixel = 360 / (256 * 2^zoom)
                degrees_per_pixel = 360.0 / (256.0 * (2**zoom))
                min_size_degrees = min_pixel_size * degrees_per_pixel
                min_line_size_degrees = (
                    min_size_degrees * 0.6
                )  # Lower threshold for 1D lines

                # Use extra() with WHERE clause for efficient filtering
                # This uses PostGIS functions directly and benefits from spatial indexes
                # Points are always included, polygons/lines must meet size threshold
                queryset = queryset.extra(
                    where=[
                        """
                        (
                            ST_GeometryType(geometry) = 'ST_Point'
                            OR (
                                ST_GeometryType(geometry) = 'ST_Polygon'
                                AND SQRT(
                                    POW(ST_XMax(geometry) - ST_XMin(geometry), 2) +
                                    POW(ST_YMax(geometry) - ST_YMin(geometry), 2)
                                ) >= %s
                            )
                            OR (
                                ST_GeometryType(geometry) = 'ST_LineString'
                                AND SQRT(
                                    POW(ST_XMax(geometry) - ST_XMin(geometry), 2) +
                                    POW(ST_YMax(geometry) - ST_YMin(geometry), 2)
                                ) >= %s
                            )
                        )
                        """
                    ],
                    params=[min_size_degrees, min_line_size_degrees],
                )
            except (ValueError, TypeError):
                pass

        # Order by distance from center of viewport (closest first), with id as tiebreaker
        # Use simple Euclidean distance on coordinates to avoid spatial_ref_sys dependency
        if center_point:
            from django.db.models.expressions import RawSQL

            # Calculate approximate distance using ST_Distance on centroids
            # This works without spatial_ref_sys because we're not converting units
            queryset = queryset.annotate(
                distance_from_center=RawSQL(
                    "ST_Distance(ST_Centroid(geometry), ST_SetSRID(ST_MakePoint(%s, %s), 4326))",
                    (center_point.x, center_point.y),
                )
            ).order_by("distance_from_center", "id")
        else:
            queryset = queryset.order_by("id")

        # Get total count before pagination
        total_count = queryset.count()

        # Parse pagination parameters
        try:
            limit = int(request.query_params.get("limit", 1000))
        except (ValueError, TypeError):
            limit = 1000

        try:
            offset = int(request.query_params.get("offset", 0))
        except (ValueError, TypeError):
            offset = 0

        # Apply pagination
        queryset = queryset[offset : offset + limit]

        # Optimize query - we only need basic fields for tiles
        queryset = queryset.select_related("asset_type")

        # Build GeoJSON-like response
        features = []
        for asset in queryset:
            if asset.geometry:
                features.append(
                    {
                        "type": "Feature",
                        "id": str(asset.id),
                        "geometry": {
                            "type": asset.geometry.geom_type,
                            "coordinates": (
                                list(asset.geometry.coords)
                                if hasattr(asset.geometry, "coords")
                                else None
                            ),
                        },
                        "properties": {
                            "name": asset.name,
                            "assetTypeId": str(asset.asset_type_id),
                            "h3_index": asset.h3_index,
                        },
                    }
                )

        # Build next URL if there are more results
        next_url = None
        next_offset = offset + limit
        if next_offset < total_count:
            # Build the next URL with updated offset
            next_params = request.query_params.copy()
            next_params["offset"] = str(next_offset)
            next_params["limit"] = str(limit)
            next_url = request.build_absolute_uri(
                f"{request.path}?{next_params.urlencode()}"
            )

        return Response(
            {
                "type": "FeatureCollection",
                "features": features,
                "count": len(features),
                "total": total_count,
                "next": next_url,
            }
        )

    @extend_schema(
        tags=["Assets"],
        summary="Get clustered assets for map overview",
        description="Returns asset clusters grouped by H3 index for efficient map rendering at high zoom levels.",
        parameters=[
            OpenApiParameter(
                name="precision",
                description="H3 prefix length (1-15, default based on zoom)",
                required=False,
                type=int,
            ),
            OpenApiParameter(
                name="zoom",
                description="Map zoom level (0-20)",
                required=False,
                type=int,
            ),
            OpenApiParameter(
                name="bbox",
                description="Bounding box as minLon,minLat,maxLon,maxLat",
                required=False,
                type=str,
            ),
        ],
        examples=[
            OpenApiExample(
                "Zoom-based clustering",
                description="Get clusters for zoom level 8",
                value={"zoom": 8},
                request_only=True,
            ),
        ],
    )
    @action(detail=False, methods=["get", "post"])
    def clusters(self, request, workspace_pk=None, organization_pk=None):
        """Get asset clusters grouped by H3 prefix for map overview"""
        bbox_param = request.query_params.get("bbox")

        # Determine H3 prefix length based on zoom level or use provided value
        zoom = request.query_params.get("zoom")
        precision = request.query_params.get("precision")

        max_h3_length = 15  # H3 string length for resolution 15
        if precision:
            try:
                precision = int(precision)
                precision = max(1, min(max_h3_length, precision))  # Clamp 1-15
            except (ValueError, TypeError):
                precision = 7
        elif zoom:
            # Map zoom levels to H3 prefix length
            try:
                zoom = int(zoom)
                zoom_to_h3len = {
                    range(0, 3): 2,  # World/continent
                    range(3, 5): 4,  # Country
                    range(5, 7): 5,  # State/region
                    range(7, 10): 6,  # City
                    range(10, 12): 10,  # District
                    range(12, 14): 11,  # Neighborhood
                    range(14, 16): 13,  # Street
                    range(16, 18): 14,  # Building
                    range(18, 21): 15,  # Sub-building
                }
                precision = 7  # Default
                for zoom_range, h3len in zoom_to_h3len.items():
                    if zoom in zoom_range:
                        precision = h3len
                        break
            except (ValueError, TypeError):
                precision = 7
        else:
            precision = 7  # Default to mid-level granularity

        # Build WHERE conditions and params for raw SQL
        import json
        from django.db import connection

        where_clauses = [
            "a.h3_index IS NOT NULL",
            "a.h3_index != ''",
            "a.geometry IS NOT NULL",
            "a.deleted_at IS NULL",
        ]
        params = [precision]

        # Filter by organization if provided
        if organization_pk:
            where_clauses.append("a.organization_id = %s")
            params.append(organization_pk)

        # Filter by workspace if provided
        if workspace_pk:
            where_clauses.append(
                "a.id IN (SELECT asset_id FROM assets_workspaceasset WHERE workspace_id = %s)"
            )
            params.append(workspace_pk)

        # Apply search filters if provided (POST request)
        if request.method == "POST" and request.data:
            import hashlib
            from django.core.cache import cache

            # Cache filtered IDs based on filter config hash
            filter_hash = hashlib.md5(
                json.dumps(request.data, sort_keys=True).encode()
            ).hexdigest()
            cache_key = f"cluster_filter:{organization_pk or ''}:{workspace_pk or ''}:{filter_hash}"

            with silk_profile(name="clusters: cache_get"):
                cached_ids_str = cache.get(cache_key)
            if cached_ids_str is not None:
                # Cached as comma-separated string for faster serialization
                with silk_profile(name="clusters: parse_cached_ids"):
                    filtered_ids = cached_ids_str.split(",") if cached_ids_str else []
            else:
                with silk_profile(name="clusters: build_query"):
                    q_filter = FilterSerializer(data=request.data).build_query()
                if q_filter:
                    base_qs = Asset.objects.all()
                    if organization_pk:
                        base_qs = base_qs.filter(organization_id=organization_pk)
                    if workspace_pk:
                        base_qs = base_qs.filter(
                            workspace_memberships__workspace_id=workspace_pk
                        )
                    with silk_profile(name="clusters: filter_and_fetch_ids"):
                        filtered_ids = [
                            str(id)
                            for id in base_qs.filter(q_filter).values_list(
                                "id", flat=True
                            )
                        ]
                    # Cache as comma-separated string for faster serialization
                    cache.set(cache_key, ",".join(filtered_ids), timeout=60)
                else:
                    filtered_ids = []

            if filtered_ids:
                where_clauses.append("a.id = ANY(%s::uuid[])")
                params.append(filtered_ids)
            elif request.data:
                # Filter was provided but no assets match, return empty result
                return Response(
                    {"clusters": [], "precision": precision, "totalClusters": 0}
                )

        # Apply bounding box filter if provided
        if bbox_param:
            try:
                bounds = [float(x) for x in bbox_param.split(",")]
                if len(bounds) == 4:
                    where_clauses.append(
                        "a.geometry && ST_MakeEnvelope(%s, %s, %s, %s, 4326)"
                    )
                    params.extend(bounds)
            except (ValueError, TypeError):
                pass

        where_sql = " AND ".join(where_clauses)

        # Two-pass approach: first get cluster counts efficiently, then fetch details only for single-asset clusters
        # This avoids computing expensive ST_AsGeoJSON for large clusters that won't use it
        with silk_profile(name="clusters: raw_sql_query"):
            with connection.cursor() as cursor:
                # First pass: quick aggregation to get cluster sizes and centroids
                cursor.execute(
                    f"""
                    SELECT
                        LEFT(a.h3_index, %s) as h3_prefix,
                        COUNT(*) as cluster_count,
                        AVG(ST_Y(a.location)) as lat,
                        AVG(ST_X(a.location)) as lon
                    FROM assets_asset a
                    WHERE {where_sql}
                    GROUP BY h3_prefix
                    ORDER BY cluster_count DESC
                    """,
                    params,
                )
                cluster_rows = cursor.fetchall()

                # Identify single-asset clusters (need full details)
                single_prefixes = [row[0] for row in cluster_rows if row[1] == 1]

                # Second pass: only fetch geometry for single-asset clusters
                single_asset_details = {}
                if single_prefixes:
                    # Params order: precision (for SELECT), then original where params, then precision again, then prefixes
                    prefix_placeholders = ",".join(["%s"] * len(single_prefixes))
                    detail_params = (
                        [precision] + params[1:] + [precision] + single_prefixes
                    )
                    cursor.execute(
                        f"""
                        SELECT
                            LEFT(a.h3_index, %s) as h3_prefix,
                            a.id::text,
                            a.name,
                            a.asset_type_id::text,
                            a.h3_index,
                            ST_AsGeoJSON(a.geometry)
                        FROM assets_asset a
                        WHERE {where_sql}
                          AND LEFT(a.h3_index, %s) IN ({prefix_placeholders})
                        """,
                        detail_params,
                    )
                    for row in cursor.fetchall():
                        single_asset_details[row[0]] = row[
                            1:
                        ]  # prefix -> (id, name, type_id, h3, geojson)

                # Combine results
                rows = []
                for prefix, count, lat, lon in cluster_rows:
                    if count == 1 and prefix in single_asset_details:
                        asset_id, name, type_id, h3, geojson = single_asset_details[
                            prefix
                        ]
                        rows.append(
                            (
                                prefix,
                                count,
                                asset_id,
                                name,
                                type_id,
                                h3,
                                geojson,
                                lat,
                                lon,
                            )
                        )
                    else:
                        rows.append(
                            (prefix, count, None, None, None, None, None, lat, lon)
                        )

        # Build response: indices are 0=prefix, 1=count, 2=id, 3=name, 4=type_id, 5=h3, 6=geojson, 7=lat, 8=lon
        cluster_data = []
        for prefix, count, asset_id, name, type_id, h3, geojson, lat, lon in rows:
            if count == 1 and geojson:
                cluster_data.append(
                    {
                        "type": "Feature",
                        "id": asset_id,
                        "geometry": json.loads(geojson),
                        "properties": {
                            "name": name,
                            "assetTypeId": type_id,
                            "h3_index": h3,
                        },
                    }
                )
            elif lat is not None and lon is not None:
                cluster_data.append(
                    {
                        "h3_index": prefix,
                        "count": count,
                        "center": {"lat": float(lat), "lon": float(lon)},
                    }
                )

        return Response(
            {
                "clusters": cluster_data,
                "precision": precision,
                "totalClusters": len(cluster_data),
            }
        )
