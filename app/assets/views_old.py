from rest_framework import viewsets, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Q
from django.contrib.gis.geos import GEOSGeometry, Point
from django.contrib.gis.measure import D
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, extend_schema_view, OpenApiExample
from .models import AssetType, AssetTypeAttribute, Asset
from .serializers import (
    AssetTypeSerializer,
    AssetTypeSummarySerializer,
    AssetTypeAttributeSerializer,
    AssetSerializer,
)


@extend_schema_view(
    list=extend_schema(tags=["Asset Types"]),
    create=extend_schema(tags=["Asset Types"]),
    retrieve=extend_schema(tags=["Asset Types"]),
    update=extend_schema(tags=["Asset Types"]),
    partial_update=extend_schema(tags=["Asset Types"]),
    destroy=extend_schema(tags=["Asset Types"]),
)
class AssetTypeViewSet(viewsets.ModelViewSet):
    """
    ViewSet for AssetType model.

    Asset types define the schema for assets with custom fields.
    """

    queryset = AssetType.objects.all()
    serializer_class = AssetTypeSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name", "description"]
    ordering_fields = ["name", "created_at"]

    def get_serializer_class(self):
        """Use summary serializer for list view"""
        if self.action == "list":
            return AssetTypeSummarySerializer
        return AssetTypeSerializer


@extend_schema_view(
    list=extend_schema(tags=["Asset Field Definitions"]),
    create=extend_schema(tags=["Asset Field Definitions"]),
    retrieve=extend_schema(tags=["Asset Field Definitions"]),
    update=extend_schema(tags=["Asset Field Definitions"]),
    partial_update=extend_schema(tags=["Asset Field Definitions"]),
    destroy=extend_schema(tags=["Asset Field Definitions"]),
)
class AssetTypeAttributeViewSet(viewsets.ModelViewSet):
    """
    ViewSet for AssetTypeAttribute model.

    Define custom fields for asset types.
    """

    serializer_class = AssetTypeAttributeSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["asset_type", "field_type", "is_required"]
    ordering_fields = ["order", "field_name", "created_at"]

    def get_queryset(self):
        """Filter field definitions by parent asset type"""
        return AssetTypeAttribute.objects.filter(
            asset_type_id=self.kwargs["assettype_pk"]
        )

    def perform_create(self, serializer):
        """Automatically set the asset_type when creating"""
        serializer.save(asset_type_id=self.kwargs["assettype_pk"])


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

        # Filter by attributes using query parameters like ?attr_hostname=server01
        for param, value in self.request.query_params.items():
            if param.startswith("attr_"):
                api_key = param[5:]  # Remove 'attr_' prefix
                queryset = (
                    queryset.filter(
                        attributes__field_definition__api_key=api_key,
                        attributes__textattributevalue__value=value,
                    )
                    | queryset.filter(
                        attributes__field_definition__api_key=api_key,
                        attributes__numberattributevalue__value=(
                            float(value)
                            if value.replace(".", "", 1).isdigit()
                            else None
                        ),
                    )
                    | queryset.filter(
                        attributes__field_definition__api_key=api_key,
                        attributes__booleanattributevalue__value=value.lower()
                        in ["true", "1", "yes"],
                    )
                )

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

    def _build_attribute_filter(self, filter_item):
        """Build a Q object for a single attribute filter"""
        attribute = filter_item.get("attribute")
        value = filter_item.get("value")
        operator = filter_item.get("operator", "equals")

        if not attribute or value is None:
            return Q()

        base_q = Q(attributes__field_definition__api_key=attribute)

        if operator == "equals":
            return base_q & (
                Q(attributes__textattributevalue__value=value)
                | Q(attributes__numberattributevalue__value=value)
                | Q(attributes__booleanattributevalue__value=value)
                | Q(attributes__jsonattributevalue__value=value)
            )
        elif operator == "contains":
            return base_q & Q(attributes__textattributevalue__value__icontains=value)
        elif operator == "gt":
            return base_q & Q(attributes__numberattributevalue__value__gt=value)
        elif operator == "lt":
            return base_q & Q(attributes__numberattributevalue__value__lt=value)
        elif operator == "gte":
            return base_q & Q(attributes__numberattributevalue__value__gte=value)
        elif operator == "lte":
            return base_q & Q(attributes__numberattributevalue__value__lte=value)

        return Q()

    def _build_asset_type_filter(self, type_filter):
        """Build a Q object for asset type filters"""
        asset_type_name = type_filter.get("asset_type_name")

        if asset_type_name:
            return Q(asset_type__name=asset_type_name)

        return Q()

    def _build_geographic_filter(self, geo_filter):
        """Build a Q object for geographic filters"""
        filter_type = geo_filter.get("type")

        if filter_type == "bbox":
            # Bounding box filter: {"type": "bbox", "bounds": [min_lon, min_lat, max_lon, max_lat]}
            bounds = geo_filter.get("bounds")
            if bounds and len(bounds) == 4:
                bbox = GEOSGeometry(
                    f"POLYGON(({bounds[0]} {bounds[1]}, {bounds[2]} {bounds[1]}, {bounds[2]} {bounds[3]}, {bounds[0]} {bounds[3]}, {bounds[0]} {bounds[1]}))",
                    srid=4326,
                )
                return Q(geometry__intersects=bbox)

        elif filter_type == "distance":
            # Distance from point filter: {"type": "distance", "point": [lon, lat], "distance": 1000, "unit": "m"}
            point_coords = geo_filter.get("point")
            distance = geo_filter.get("distance")
            unit = geo_filter.get("unit", "m")  # m, km, mi, ft

            if point_coords and len(point_coords) == 2 and distance:
                point = Point(point_coords[0], point_coords[1], srid=4326)
                return Q(geometry__dwithin=(point, D(**{unit: distance})))

        elif filter_type == "within":
            # Within geometry filter: {"type": "within", "geometry": {...GeoJSON...}}
            geometry_data = geo_filter.get("geometry")
            if geometry_data:
                try:
                    # Handle both GeoJSON dict and WKT string
                    if isinstance(geometry_data, dict):
                        from django.contrib.gis.geos import GEOSGeometry
                        import json

                        geometry = GEOSGeometry(json.dumps(geometry_data))
                    else:
                        geometry = GEOSGeometry(geometry_data, srid=4326)
                    return Q(geometry__within=geometry)
                except Exception:
                    pass

        elif filter_type == "contains":
            # Contains point filter: {"type": "contains", "point": [lon, lat]}
            point_coords = geo_filter.get("point")
            if point_coords and len(point_coords) == 2:
                point = Point(point_coords[0], point_coords[1], srid=4326)
                return Q(geometry__contains=point)

        elif filter_type == "intersects":
            # Intersects geometry filter: {"type": "intersects", "geometry": {...GeoJSON...}}
            geometry_data = geo_filter.get("geometry")
            if geometry_data:
                try:
                    if isinstance(geometry_data, dict):
                        import json

                        geometry = GEOSGeometry(json.dumps(geometry_data))
                    else:
                        geometry = GEOSGeometry(geometry_data, srid=4326)
                    return Q(geometry__intersects=geometry)
                except Exception:
                    pass

        return Q()

    def _build_filter_group(self, filter_config):
        """Recursively build Q objects from filter configuration"""
        if "filters" in filter_config:
            # This is a filter group
            filters = filter_config.get("filters", [])
            logic = filter_config.get("logic", "AND").upper()

            if not filters:
                return Q()

            # Build Q objects for all filters/subgroups
            q_objects = []
            for item in filters:
                if "filters" in item:
                    # Nested filter group
                    q_objects.append(self._build_filter_group(item))
                elif "type" in item:
                    # Geographic filter
                    q_objects.append(self._build_geographic_filter(item))
                elif "asset_type_name" in item:
                    # Asset type filter
                    q_objects.append(self._build_asset_type_filter(item))
                else:
                    # Single attribute filter
                    q_objects.append(self._build_attribute_filter(item))

            # Combine with AND or OR
            if logic == "OR":
                combined_q = Q()
                for q in q_objects:
                    combined_q |= q
                return combined_q
            else:  # AND
                combined_q = Q()
                for q in q_objects:
                    combined_q &= q
                return combined_q
        else:
            # Single filter item
            if "type" in filter_config:
                return self._build_geographic_filter(filter_config)
            elif "asset_type_name" in filter_config:
                return self._build_asset_type_filter(filter_config)
            else:
                return self._build_attribute_filter(filter_config)

    @extend_schema(
        tags=["Assets"],
        summary="Filter assets by attributes and geography",
        description="Filter assets by asset type, attribute values, and geography with AND/OR logic. Supports equals, contains, gt, lt, gte, lte operators for attributes, and bbox, distance, within, contains, intersects for geographic filters.",
        examples=[
            OpenApiExample(
                "Asset Type Filter",
                value={
                    "logic": "AND",
                    "filters": [
                        {"assetTypeName": "Server"},
                        {
                            "attribute": "status",
                            "value": "active",
                            "operator": "equals",
                        },
                    ],
                },
                request_only=True,
            ),
            OpenApiExample(
                "Multiple Asset Types (OR)",
                value={
                    "logic": "OR",
                    "filters": [
                        {"assetTypeName": "Server"},
                        {"assetTypeName": "Router"},
                    ],
                },
                request_only=True,
            ),
            OpenApiExample(
                "Attribute Filters with Nested Logic",
                value={
                    "logic": "AND",
                    "filters": [
                        {
                            "attribute": "hostname",
                            "value": "server01",
                            "operator": "equals",
                        },
                        {
                            "logic": "OR",
                            "filters": [
                                {
                                    "attribute": "status",
                                    "value": "active",
                                    "operator": "equals",
                                },
                                {
                                    "attribute": "status",
                                    "value": "pending",
                                    "operator": "equals",
                                },
                            ],
                        },
                    ],
                },
                request_only=True,
            ),
            OpenApiExample(
                "Geographic Filters",
                value={
                    "logic": "AND",
                    "filters": [
                        {"assetTypeName": "Sensor"},
                        {
                            "attribute": "status",
                            "value": "active",
                            "operator": "equals",
                        },
                        {"type": "bbox", "bounds": [-122.5, 37.7, -122.3, 37.9]},
                        {
                            "type": "distance",
                            "point": [-122.4, 37.8],
                            "distance": 5000,
                            "unit": "m",
                        },
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
            # Top-level access: return all assets
            queryset = Asset.objects.all()

        if filter_config:
            q_filter = self._build_filter_group(filter_config)
            if q_filter:
                queryset = queryset.filter(q_filter)

        queryset = queryset.distinct()
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)
