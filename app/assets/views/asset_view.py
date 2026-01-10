from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination
from django.db.models import Q, Count
from django.contrib.gis.geos import GEOSGeometry, Point
from django.contrib.gis.measure import D
from django.contrib.gis.db.models.functions import Centroid
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import (
    extend_schema,
    extend_schema_view,
    OpenApiExample,
    OpenApiParameter,
)
from ..filter_serializers import FilterSerializer
import re
import json
import boto3
import os
from ..models import Asset
from ..serializers import AssetSerializer


class AssetPagination(PageNumberPagination):
    page_size = 100
    page_size_query_param = "page_size"
    max_page_size = 10000


@extend_schema_view(
    list=extend_schema(tags=["Assets"]),
    create=extend_schema(tags=["Assets"]),
    retrieve=extend_schema(tags=["Assets"]),
    update=extend_schema(tags=["Assets"]),
    partial_update=extend_schema(tags=["Assets"]),
    destroy=extend_schema(tags=["Assets"]),
)
class AssetViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Asset model.

    Assets are instances of asset types with dynamic field values.
    """

    serializer_class = AssetSerializer
    pagination_class = AssetPagination
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_fields = ["asset_type"]
    search_fields = ["name", "description"]
    ordering_fields = ["name", "created_at"]

    def get_queryset(self):
        """Filter assets by parent asset type (if nested) and optionally by attributes"""
        # If accessed via nested route, filter by asset type
        if "assettype_pk" in self.kwargs:
            queryset = Asset.objects.filter(asset_type_id=self.kwargs["assettype_pk"])
        else:
            # Top-level access: return all assets
            queryset = Asset.objects.all()

        # Prefetch all attribute value types and select_related for field_definition
        queryset = queryset.prefetch_related(
            "attributes",
            "attributes__textattributevalue",
            "attributes__numberattributevalue",
            "attributes__booleanattributevalue",
            "attributes__dateattributevalue",
            "attributes__datetimeattributevalue",
            "attributes__jsonattributevalue",
        ).select_related()
        # Also select_related for attribute_type_attribute on attributes
        queryset = queryset.prefetch_related("attributes__attribute_type_attribute")

        # Special case: filter by attributes using query parameters like ?attr_hostname=server01
        from django.db.models import Q

        for param, value in self.request.query_params.items():
            if param.startswith("attr_"):
                api_key = param[5:]
                q = (
                    Q(
                        attributes__attribute_type_attribute__api_key=api_key,
                        attributes__textattributevalue__value=value,
                    )
                    | Q(
                        attributes__attribute_type_attribute__api_key=api_key,
                        attributes__numberattributevalue__value=(
                            float(value)
                            if value.replace(".", "", 1).isdigit()
                            else None
                        ),
                    )
                    | Q(
                        attributes__attribute_type_attribute__api_key=api_key,
                        attributes__booleanattributevalue__value=value.lower()
                        in ["true", "1", "yes"],
                    )
                )
                queryset = queryset.filter(q)

        # Special case: filter by any field starting with 'attributes.' or 'attributes__'
        for param, value in self.request.query_params.items():
            if param.startswith("attributes.") or param.startswith("attributes__"):
                # Normalize to double underscore
                field = param.replace(".", "__", 1)
                queryset = queryset.filter(**{field: value})

        return queryset.distinct()

    def perform_create(self, serializer):
        """Automatically set the asset_type when creating via nested route"""
        if "assettype_pk" in self.kwargs:
            serializer.save(asset_type_id=self.kwargs["assettype_pk"])
        else:
            serializer.save()

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
    def search(self, request, assettype_pk=None):
        """Search assets by multiple attribute and geographic conditions with AND/OR logic"""
        filter_config = request.data

        # If accessed via nested route, filter by asset type
        if "assettype_pk" in self.kwargs:
            queryset = Asset.objects.filter(asset_type_id=self.kwargs["assettype_pk"])
        else:
            queryset = Asset.objects.all()

        # Prefetch all attribute value types and select_related for attribute_type_attribute
        queryset = queryset.prefetch_related(
            "attributes",
            "attributes__textattributevalue",
            "attributes__numberattributevalue",
            "attributes__booleanattributevalue",
            "attributes__dateattributevalue",
            "attributes__datetimeattributevalue",
            "attributes__jsonattributevalue",
        ).select_related()
        queryset = queryset.prefetch_related("attributes__attribute_type_attribute")

        if filter_config:
            q_filter = FilterSerializer(data=filter_config).build_query()
            print(q_filter)
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
    def interpret_search(self, request):
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
    def tiles(self, request):
        """Get assets as lightweight GeoJSON features for map rendering"""
        # Start with base queryset
        queryset = Asset.objects.all()

        # Apply search filters if provided (POST request)
        if request.method == "POST" and request.data:
            filter_config = request.data
            q_filter = FilterSerializer(data=filter_config).build_filter_group()
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
    def clusters(self, request):
        """Get asset clusters grouped by H3 prefix for map overview"""
        # Start with base queryset
        queryset = Asset.objects.all()

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
                asset = Asset.objects.filter(h3_index__startswith=hash_prefix).first()
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
