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
import geohash2
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
        # Also select_related for field_definition on attributes
        queryset = queryset.prefetch_related("attributes__field_definition")

        # Special case: filter by attributes using query parameters like ?attr_hostname=server01
        from django.db.models import Q

        for param, value in self.request.query_params.items():
            if param.startswith("attr_"):
                api_key = param[5:]
                q = (
                    Q(
                        attributes__field_definition__api_key=api_key,
                        attributes__textattributevalue__value=value,
                    )
                    | Q(
                        attributes__field_definition__api_key=api_key,
                        attributes__numberattributevalue__value=(
                            float(value)
                            if value.replace(".", "", 1).isdigit()
                            else None
                        ),
                    )
                    | Q(
                        attributes__field_definition__api_key=api_key,
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
        description="Filter assets by asset type, attribute values, and geography with AND/OR logic. Supports equals, contains, gt, lt, gte, lte operators for attributes, and geohash, bbox, distance, within, contains, intersects for geographic filters.",
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
        queryset = queryset.prefetch_related("attributes__field_definition")

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
            filters, logic, interpretation = self._interpret_with_keywords(query_text)

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

Available filter types:
1. text: General text search across name and attributes (use for location names, neighborhoods, or general terms)
   Example: {{"type": "text", "value": "French Quarter"}}
   Example: {{"type": "text", "value": "waterfront"}}

2. name: Search by asset name (supports partial matching, case-insensitive)
   Example: {{"type": "name", "value": "Ph"}} - finds names starting with or containing "Ph"
   Example: {{"type": "name", "value": "Starbucks"}}

3. assetTypeName: Filter by asset type (restaurant, hotel, building, park, school, hospital, shop, bar, cafe, etc.)
   Example: {{"type": "assetTypeName", "assetTypeName": "restaurant"}}

4. assetTypeId: Filter by specific asset type ID
   Example: {{"type": "assetTypeId", "assetTypeId": "123"}}

5. attribute: Filter by specific attribute key/value (for properties like cuisine, parking, amenities, etc.)
   Example: {{"type": "attribute", "key": "cuisine", "value": "italian"}}
   Example: {{"type": "attribute", "key": "parking", "value": "yes"}}

6. geohash: Filter by geohash region
   Example: {{"type": "geohash", "hash": "9q8yy"}}

7. bbox: Filter by bounding box [minLon, minLat, maxLon, maxLat]
   Example: {{"type": "bbox", "bbox": [-90.1, 29.9, -90.0, 30.0]}}

8. radius: Filter by radius from a point
   Example: {{"type": "radius", "lat": 29.95, "lon": -90.07, "radius_km": 2}}

Logic operators: "AND" or "OR" (determines how multiple filters are combined)

IMPORTANT GUIDELINES:
- Use "name" filter for specific business/asset names or name prefixes
- Use "text" filter for locations, neighborhoods, and general descriptive terms
- For partial name matches like "Ph", use name filter
- For location names like "New Orleans", "French Quarter", use text filter
- Combine filters logically - names with locations should use AND logic

Respond with ONLY a JSON object in this exact format:
{{
  "filters": [...array of filter objects...],
  "logic": "AND" or "OR",
  "interpretation": "human readable description of what filters will find"
}}

Examples:
Query: "restaurants in French Quarter"
Response: {{"filters": [{{"type": "assetTypeName", "assetTypeName": "restaurant"}}, {{"type": "text", "value": "French Quarter"}}], "logic": "AND", "interpretation": "restaurants in French Quarter"}}

Query: "hotels with parking near downtown"
Response: {{"filters": [{{"type": "assetTypeName", "assetTypeName": "hotel"}}, {{"type": "attribute", "key": "parking", "value": "yes"}}, {{"type": "text", "value": "downtown"}}], "logic": "AND", "interpretation": "hotels with parking near downtown"}}

Query: "name starts with Ph in New Orleans"
Response: {{"filters": [{{"type": "name", "value": "Ph"}}, {{"type": "text", "value": "New Orleans"}}], "logic": "AND", "interpretation": "assets with names starting with 'Ph' in New Orleans"}}

Query: "Starbucks locations"
Response: {{"filters": [{{"type": "name", "value": "Starbucks"}}], "logic": "AND", "interpretation": "Starbucks locations"}}

Query: "italian or french restaurants"
Response: {{"filters": [{{"type": "assetTypeName", "assetTypeName": "restaurant"}}, {{"type": "attribute", "key": "cuisine", "value": "italian"}}, {{"type": "attribute", "key": "cuisine", "value": "french"}}], "logic": "OR", "interpretation": "restaurants serving italian or french cuisine"}}

Now convert the query: "{query_text}"
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

    def _interpret_with_keywords(self, query_text):
        """Fallback keyword-based interpretation"""
        filters = []
        logic = "AND"
        query_lower = query_text.lower()

        # Check for asset type keywords
        type_keywords = {
            "restaurant": [
                "restaurant",
                "restaurants",
                "dining",
                "eatery",
                "cafe",
                "cafes",
            ],
            "hotel": ["hotel", "hotels", "motel", "inn", "lodging"],
            "building": ["building", "buildings", "structure"],
            "park": ["park", "parks", "garden"],
            "school": ["school", "schools", "university", "college"],
            "hospital": ["hospital", "hospitals", "clinic", "medical"],
            "shop": ["shop", "shops", "store", "stores", "retail"],
            "bar": ["bar", "bars", "pub", "pubs", "tavern"],
        }

        for asset_type, keywords in type_keywords.items():
            if any(keyword in query_lower for keyword in keywords):
                filters.append({"type": "assetTypeName", "assetTypeName": asset_type})
                break

        # Check for location references
        location_patterns = [
            (r"in\s+([a-z\s]+?)(?:\s+area|\s+neighborhood|$)", "in"),
            (r"near\s+([a-z\s]+?)(?:\s+area|\s+neighborhood|$)", "near"),
            (r"around\s+([a-z\s]+?)(?:\s+area|\s+neighborhood|$)", "around"),
        ]

        for pattern, keyword in location_patterns:
            match = re.search(pattern, query_lower)
            if match:
                location = match.group(1).strip()
                filters.append({"type": "text", "value": location})
                break

        # If no specific filters were detected, do a general text search
        if not filters:
            filters.append({"type": "text", "value": query_text})

        interpretation = self._describe_filters(filters, logic)
        return filters, logic, interpretation

    def _describe_filters(self, filters, logic):
        """Generate human-readable description of filters"""
        if not filters:
            return "No filters applied"

        descriptions = []
        for f in filters:
            if f.get("type") == "text":
                descriptions.append(f"searching for '{f['value']}'")
            elif f.get("type") == "name":
                descriptions.append(f"name contains '{f['value']}'")
            elif f.get("type") == "assetTypeName":
                descriptions.append(f"type is {f['assetTypeName']}")
            elif f.get("type") == "attribute":
                descriptions.append(f"{f['key']} is {f['value']}")
            elif f.get("type") == "bbox":
                descriptions.append("within map bounds")
            elif f.get("type") == "radius":
                descriptions.append(f"within {f['radius_km']}km of location")

        return f" {logic} ".join(descriptions) if descriptions else "General search"

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

        # Only fetch necessary fields for performance
        queryset = queryset.only("id", "name", "geometry", "asset_type_id", "geohash")

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
                            "geohash": asset.geohash,
                        },
                    }
                )

        return Response(
            {"type": "FeatureCollection", "features": features, "count": len(features)}
        )

    @extend_schema(
        tags=["Assets"],
        summary="Get clustered assets for map overview",
        description="Returns asset clusters grouped by geohash for efficient map rendering at high zoom levels.",
        parameters=[
            OpenApiParameter(
                name="precision",
                description="Geohash precision (1-9, default based on zoom)",
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
        """Get asset clusters grouped by geohash prefix for map overview"""
        # Start with base queryset
        queryset = Asset.objects.all()

        # Apply search filters if provided (POST request)
        if request.method == "POST" and request.data:
            filter_config = request.data
            q_filter = self._build_filter_group(filter_config)
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

        # Determine geohash precision based on zoom level or use provided precision
        zoom = request.query_params.get("zoom")
        precision = request.query_params.get("precision")

        if precision:
            try:
                precision = int(precision)
                precision = max(1, min(9, precision))  # Clamp between 1-9
            except (ValueError, TypeError):
                precision = 4
        elif zoom:
            # Map zoom levels to geohash precision
            try:
                zoom = int(zoom)
                zoom_to_precision = {
                    range(0, 3): 1,  # World/continent
                    range(3, 5): 2,  # Country
                    range(5, 7): 3,  # State/region
                    range(7, 10): 4,  # City
                    range(10, 12): 5,  # District
                    range(12, 14): 6,  # Neighborhood
                    range(14, 16): 7,  # Street
                    range(16, 18): 8,  # Building
                    range(18, 21): 9,  # Sub-building
                }
                precision = 4  # Default
                for zoom_range, prec in zoom_to_precision.items():
                    if zoom in zoom_range:
                        precision = prec
                        break
            except (ValueError, TypeError):
                precision = 4
        else:
            precision = 4  # Default to city level

        # Filter assets with geometry
        queryset = queryset.exclude(geometry__isnull=True)

        # Group by geohash prefix and count
        from django.db.models.functions import Substr
        from django.db.models import Count

        clusters = (
            queryset.annotate(geohash_prefix=Substr("geohash", 1, precision))
            .values("geohash_prefix")
            .annotate(count=Count("id"))
            .order_by("-count")
        )

        # Build cluster response with centroids
        from django.db import connection
        cluster_data = []
        for cluster in clusters:
            hash_prefix = cluster["geohash_prefix"]
            count = cluster["count"]

            # Calculate centroid for this cluster
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT ST_Y(ST_Centroid(ST_Collect(geometry))) as lat, ST_X(ST_Centroid(ST_Collect(geometry))) as lon
                    FROM assets_asset
                    WHERE geohash LIKE %s || '%%' AND geometry IS NOT NULL
                    """,
                    [hash_prefix]
                )
                result = cursor.fetchone()
                if result and result[0] is not None and result[1] is not None:
                    lat, lon = result
                    cluster_data.append({
                        "geohash": hash_prefix,
                        "count": int(count),
                        "center": {"lat": float(lat), "lon": float(lon)}
                    })

        return Response({
            "clusters": cluster_data,
            "precision": precision,
            "totalClusters": len(cluster_data),
        })
