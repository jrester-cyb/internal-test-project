from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination, CursorPagination
from django.db.models import Q, Count, Prefetch
from django.contrib.gis.geos import GEOSGeometry, Point
from django.contrib.gis.measure import D
from django.contrib.gis.db.models.functions import Centroid
from django_filters.rest_framework import DjangoFilterBackend
from django.core.cache import cache
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
from ..models import Asset, BaseAttributeValue
from ..serializers import AssetSerializer


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
    """Standard page-number pagination with count query (slower for large tables)"""

    page_size = 50  # Reduced for better performance with many attributes
    page_size_query_param = "page_size"
    max_page_size = 500  # Cap max to prevent memory issues with 100+ attrs


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
        """Filter assets by workspace via WorkspaceAsset join table"""
        workspace_pk = self.kwargs.get("workspace_pk")

        # If accessed via nested route under asset type, filter by asset type
        if "assettype_pk" in self.kwargs:
            # Filter by asset type AND workspace visibility
            queryset = Asset.objects.filter(
                asset_type_id=self.kwargs["assettype_pk"],
                workspace_memberships__workspace_id=workspace_pk,
            )
        elif workspace_pk:
            # Filter by workspace via WorkspaceAsset join table
            queryset = Asset.objects.filter(
                workspace_memberships__workspace_id=workspace_pk,
            )
        else:
            # Top-level access: return all assets
            queryset = Asset.objects.all()

        # Select related for asset_type and organization to avoid N+1 queries
        queryset = queryset.select_related("asset_type", "organization")

        # Prefetch attributes with values - use subquery approach (CASE WHEN is actually optimal here)
        # PostgreSQL's query planner only evaluates the matching WHEN branch per row
        from django.db.models.expressions import RawSQL
        from django.db.models import JSONField
        from django.contrib.contenttypes.models import ContentType
        from ..models import (
            BaseAttributeValue,
            TextAttributeValue,
            NumberAttributeValue,
            BooleanAttributeValue,
            DateAttributeValue,
            DateTimeAttributeValue,
            JSONAttributeValue,
        )

        # Get content type IDs dynamically - cached by Django's ContentType framework
        ct_text = ContentType.objects.get_for_model(TextAttributeValue).id
        ct_number = ContentType.objects.get_for_model(NumberAttributeValue).id
        ct_boolean = ContentType.objects.get_for_model(BooleanAttributeValue).id
        ct_date = ContentType.objects.get_for_model(DateAttributeValue).id
        ct_datetime = ContentType.objects.get_for_model(DateTimeAttributeValue).id
        ct_json = ContentType.objects.get_for_model(JSONAttributeValue).id

        # CASE WHEN based on polymorphic_ctype_id - only evaluates 1 subquery per row
        typed_value_sql = RawSQL(
            f"""
            CASE assets_baseattributevalue.polymorphic_ctype_id
                WHEN {ct_text} THEN (SELECT to_jsonb(tv.value) FROM assets_textattributevalue tv 
                              WHERE tv.baseattributevalue_ptr_id = assets_baseattributevalue.id)
                WHEN {ct_number} THEN (SELECT to_jsonb(nv.value) FROM assets_numberattributevalue nv 
                              WHERE nv.baseattributevalue_ptr_id = assets_baseattributevalue.id)
                WHEN {ct_boolean} THEN (SELECT to_jsonb(bv.value) FROM assets_booleanattributevalue bv 
                              WHERE bv.baseattributevalue_ptr_id = assets_baseattributevalue.id)
                WHEN {ct_date} THEN (SELECT to_jsonb(dv.value) FROM assets_dateattributevalue dv 
                              WHERE dv.baseattributevalue_ptr_id = assets_baseattributevalue.id)
                WHEN {ct_datetime} THEN (SELECT to_jsonb(dtv.value) FROM assets_datetimeattributevalue dtv 
                              WHERE dtv.baseattributevalue_ptr_id = assets_baseattributevalue.id)
                WHEN {ct_json} THEN (SELECT jv.value FROM assets_jsonattributevalue jv 
                              WHERE jv.baseattributevalue_ptr_id = assets_baseattributevalue.id)
            END
            """,
            [],
            output_field=JSONField(),
        )

        attr_queryset = BaseAttributeValue.objects.non_polymorphic().annotate(
            typed_value=typed_value_sql
        )

        queryset = queryset.prefetch_related(
            Prefetch("attributes", queryset=attr_queryset)
        )

        return queryset.distinct()

    def get_serializer_context(self):
        """Add workspace and api_key_map to serializer context"""
        context = super().get_serializer_context()
        workspace_pk = self.kwargs.get("workspace_pk")
        if workspace_pk:
            from workspaces.models import Workspace

            try:
                context["workspace"] = Workspace.objects.get(pk=workspace_pk)
            except Workspace.DoesNotExist:
                pass

        # Pre-load api_key map for all asset type attributes in this asset type
        # This avoids N+1 queries when serializing attributes
        # Priority: workspace override > global (keyed by global ID since values point to global)
        assettype_pk = self.kwargs.get("assettype_pk")
        if assettype_pk:
            api_key_map = self._get_api_key_map(assettype_pk, workspace_pk)
            context["_api_key_map"] = api_key_map

        return context

    def _get_api_key_map(self, assettype_pk, workspace_pk=None):
        """Get api_key map with Redis caching - cache key includes workspace for proper isolation"""
        from django.core.cache import cache

        cache_key = f"api_key_map:{assettype_pk}:{workspace_pk or 'global'}"
        api_key_map = cache.get(cache_key)

        if api_key_map is None:
            from ..models import (
                GlobalAssetTypeAttribute,
                WorkspaceOverrideAssetTypeAttribute,
                WorkspaceLocalAssetTypeAttribute,
            )

            api_key_map = {}

            # Start with global attributes
            global_attrs = GlobalAssetTypeAttribute.objects.filter(
                asset_type_id=assettype_pk
            ).values("id", "api_key")
            for ga in global_attrs:
                api_key_map[str(ga["id"])] = ga["api_key"]

            # Overlay workspace overrides - these override the global's api_key
            # Key by base_attribute_id since attribute values point to the global
            if workspace_pk:
                override_attrs = WorkspaceOverrideAssetTypeAttribute.objects.filter(
                    asset_type_id=assettype_pk, workspace_id=workspace_pk
                ).values("base_attribute_id", "api_key")
                for oa in override_attrs:
                    # Override the global's api_key with the workspace override's api_key
                    api_key_map[str(oa["base_attribute_id"])] = oa["api_key"]

                # Add workspace local attributes
                local_attrs = WorkspaceLocalAssetTypeAttribute.objects.filter(
                    asset_type_id=assettype_pk, workspace_id=workspace_pk
                ).values("id", "api_key")
                for la in local_attrs:
                    api_key_map[str(la["id"])] = la["api_key"]

            # Cache for 5 minutes - attribute definitions rarely change
            cache.set(cache_key, api_key_map, timeout=300)

        return api_key_map

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

            with silk_profile(name="3. serializer.data"):
                serializer = self.get_serializer(page, many=True, context=context)
                data = serializer.data

            with silk_profile(name="4. get_paginated_response"):
                response = self.get_paginated_response(data)
                # Cache the response data for 60 seconds
                cache.set(cache_key, response.data, timeout=60)
                return response

        # Non-paginated response
        assets = list(queryset)
        context = self.get_serializer_context()
        serializer = self.get_serializer(assets, many=True, context=context)
        response_data = serializer.data
        cache.set(cache_key, response_data, timeout=60)
        return Response(response_data)

    def retrieve(self, request, *args, **kwargs):
        """Override retrieve - values are annotated on prefetched attributes"""
        instance = self.get_object()

        # Build api_key_map for this asset's type if not already set
        context = self.get_serializer_context()
        if "_api_key_map" not in context:
            api_key_map = self._get_api_key_map(
                instance.asset_type_id, self.kwargs.get("workspace_pk")
            )
            context["_api_key_map"] = api_key_map

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
            try:
                base_value = ValueModel.objects.get(
                    asset=asset, asset_type_attribute_id=attr_with_type.id
                )
                old_value = base_value.value if hasattr(base_value, "value") else None
            except ValueModel.DoesNotExist:
                pass

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
                existing_override = (
                    WorkspaceAttributeValueOverride.objects.filter(
                        asset_type_attribute_id=attr_with_type.id,
                        base_value__asset=asset,
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
                api_key_map = self._get_api_key_map(asset.asset_type_id, workspace_pk)
                context["_api_key_map"] = api_key_map
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
        api_key_map = self._get_api_key_map(asset.asset_type_id, workspace_pk)
        context["_api_key_map"] = api_key_map
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
    def related(self, request, workspace_pk=None, assettype_pk=None, pk=None):
        """Get related assets (parent, siblings, and children) for an asset"""
        asset = self.get_object()

        def build_related_url(asset_id):
            """Build the URL to fetch related assets for a given asset"""
            return request.build_absolute_uri(
                f"/api/workspaces/{workspace_pk}/assets/{asset_id}/related/"
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
    def search(self, request, workspace_pk=None, assettype_pk=None):
        """Search assets by multiple attribute and geographic conditions with AND/OR logic"""
        from django.db.models import Prefetch

        filter_config = request.data

        # If accessed via nested route, filter by asset type
        if assettype_pk:
            queryset = Asset.objects.filter(asset_type_id=assettype_pk)
        elif workspace_pk:
            queryset = Asset.objects.filter(
                workspace_memberships__workspace_id=workspace_pk
            )
        else:
            queryset = Asset.objects.all()

        # Optimize prefetch with select_related to reduce queries
        queryset = queryset.select_related(
            "asset_type", "organization"
        ).prefetch_related(
            Prefetch(
                "attributes",
                queryset=BaseAttributeValue.objects.all(),
            ),
        )

        if filter_config:
            q_filter = FilterSerializer(data=filter_config).build_query()
            if q_filter:
                queryset = queryset.filter(q_filter)

        queryset = queryset.distinct()

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

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
        description="Optimized endpoint for map rendering. Returns lightweight GeoJSON-like features.",
        parameters=[
            OpenApiParameter(
                name="bbox",
                description="Bounding box as minLon,minLat,maxLon,maxLat",
                required=False,
                type=str,
            ),
            OpenApiParameter(
                name="limit",
                description="Maximum number of features to return",
                required=False,
                type=int,
            ),
        ],
    )
    @action(detail=False, methods=["get", "post"])
    def tiles(self, request, workspace_pk=None):
        """Get assets as lightweight GeoJSON features for map rendering"""
        # Start with base queryset
        queryset = Asset.objects.all()

        # Filter by workspace if provided
        if workspace_pk:
            queryset = queryset.filter(workspace_memberships__workspace_id=workspace_pk)

        # Apply search filters if provided (POST request)
        if request.method == "POST" and request.data:
            filter_config = request.data
            q_filter = FilterSerializer(data=filter_config).build_query()
            if q_filter:
                queryset = queryset.filter(q_filter)
                queryset = queryset.distinct()

        # Apply bounding box filter if provided
        bbox_param = request.query_params.get("bbox")
        if bbox_param:
            try:
                bounds = [float(x) for x in bbox_param.split(",")]
                if len(bounds) == 4:
                    bbox = GEOSGeometry(
                        f"POLYGON(({bounds[0]} {bounds[1]}, {bounds[2]} {bounds[1]}, {bounds[2]} {bounds[3]}, {bounds[0]} {bounds[3]}, {bounds[0]} {bounds[1]}))",
                        srid=4326,
                    )
                    queryset = queryset.filter(geometry__intersects=bbox)
            except (ValueError, TypeError):
                pass

        # Apply limit
        limit = request.query_params.get("limit")
        if limit:
            try:
                queryset = queryset[: int(limit)]
            except (ValueError, TypeError):
                pass

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

        return Response(
            {"type": "FeatureCollection", "features": features, "count": len(features)}
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
    def clusters(self, request, workspace_pk=None):
        """Get asset clusters grouped by H3 prefix for map overview"""
        # Start with base queryset
        queryset = Asset.objects.all()

        # Filter by workspace if provided
        if workspace_pk:
            queryset = queryset.filter(workspace_memberships__workspace_id=workspace_pk)

        # Apply search filters if provided (POST request)
        if request.method == "POST" and request.data:
            filter_config = request.data
            q_filter = FilterSerializer(data=filter_config).build_query()
            if q_filter:
                queryset = queryset.filter(q_filter)
                queryset = queryset.distinct()

        # Apply bounding box filter if provided
        bbox_param = request.query_params.get("bbox")
        if bbox_param:
            try:
                bounds = [float(x) for x in bbox_param.split(",")]
                if len(bounds) == 4:
                    bbox = GEOSGeometry(
                        f"POLYGON(({bounds[0]} {bounds[1]}, {bounds[2]} {bounds[1]}, {bounds[2]} {bounds[3]}, {bounds[0]} {bounds[3]}, {bounds[0]} {bounds[1]}))",
                        srid=4326,
                    )
                    queryset = queryset.filter(geometry__intersects=bbox)
            except (ValueError, TypeError):
                pass

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

        # Filter assets with geometry
        queryset = queryset.exclude(geometry__isnull=True)

        # Group by h3_index prefix and count
        from django.db.models.functions import Substr
        from django.db.models import Count

        clusters = (
            queryset.annotate(h3_index_prefix=Substr("h3_index", 1, precision))
            .values("h3_index_prefix")
            .annotate(count=Count("id"))
            .order_by("-count")
        )

        # Build cluster response with centroids
        from django.db import connection

        cluster_data = []
        for cluster in clusters:
            hash_prefix = cluster["h3_index_prefix"]
            count = cluster["count"]

            if count == 1:
                # Serialize as a tile feature (GeoJSON)
                asset = (
                    Asset.objects.filter(h3_index__startswith=hash_prefix)
                    .only("id", "name", "geometry", "asset_type_id", "h3_index")
                    .first()
                )
                if asset and asset.geometry:
                    cluster_data.append(
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
                continue

            # Calculate centroid for this cluster
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT ST_Y(ST_Centroid(ST_Collect(geometry))) as lat, ST_X(ST_Centroid(ST_Collect(geometry))) as lon
                    FROM assets_asset
                    WHERE h3_index LIKE %s || '%%' AND geometry IS NOT NULL
                    """,
                    [hash_prefix],
                )
                result = cursor.fetchone()
                if result and result[0] is not None and result[1] is not None:
                    lat, lon = result
                    cluster_data.append(
                        {
                            "h3_index": hash_prefix,
                            "count": int(count),
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
