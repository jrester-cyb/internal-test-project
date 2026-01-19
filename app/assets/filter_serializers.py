from typing import Any
from rest_framework import serializers
import re
from django.db.models import Q
from django.db.models.functions import Cast
from django.db.models import FloatField
from django.contrib.gis.geos import GEOSGeometry
from django.core.cache import cache
import json
from datetime import date, datetime

from assets.models import GlobalAssetTypeAttribute, WorkspaceLocalAssetTypeAttribute
from utils.units.helpers.unit_conversion import convert_value, validate_unit


def get_attribute_info_by_api_key(api_key: str) -> dict | None:
    """
    Get attribute type and unit info by api_key, with caching.
    Returns dict with attribute_type and unit, or None if not found.
    Cache TTL is 5 minutes.
    """
    cache_key = f"attr_info:{api_key}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached if cached != "NOT_FOUND" else None

    from itertools import chain

    global_attrs = (
        GlobalAssetTypeAttribute.objects.filter(
            api_key=api_key, deleted_at__isnull=True
        )
        .only("attribute_type", "unit")
        .first()
    )

    if global_attrs:
        result = {
            "attribute_type": global_attrs.attribute_type,
            "unit": global_attrs.unit,
        }
        cache.set(cache_key, result, timeout=300)
        return result

    local_attrs = (
        WorkspaceLocalAssetTypeAttribute.objects.filter(
            api_key=api_key, deleted_at__isnull=True
        )
        .only("attribute_type", "unit")
        .first()
    )

    if local_attrs:
        result = {
            "attribute_type": local_attrs.attribute_type,
            "unit": local_attrs.unit,
        }
        cache.set(cache_key, result, timeout=300)
        return result

    cache.set(cache_key, "NOT_FOUND", timeout=300)
    return None


class FilterGroupSerializer(serializers.Serializer):
    """
    Builds filter queries for Asset filtering.

    For attribute filters (field starts with "attributes."), queries use the
    Asset.cached_attributes JSONB field directly for efficient filtering.
    """

    ALLOWED_OPERATORS = {
        "text": [
            "exact",
            "contains",
            "startswith",
            "endswith",
            "iexact",
            "icontains",
            "istartswith",
            "iendswith",
            "in",
            "nin",
        ],
        "number": ["exact", "lt", "lte", "gt", "gte", "range", "ne", "in", "nin"],
        "boolean": ["exact", "in", "nin"],
        "date": ["exact", "lt", "lte", "gt", "gte", "range", "in", "nin"],
        "datetime": ["exact", "lt", "lte", "gt", "gte", "range", "in", "nin"],
        "json": ["exact", "contains", "in", "nin"],
        "link": [
            "exact",
            "contains",
            "startswith",
            "endswith",
            "iexact",
            "icontains",
            "istartswith",
            "iendswith",
            "in",
            "nin",
        ],
        "geometry": ["within", "intersects", "contains", "exact"],
        "h3_index": ["exact", "startswith"],
    }

    inverse = serializers.BooleanField(default=False)
    field = serializers.CharField(required=True)
    value = serializers.JSONField(required=True)
    operator = serializers.CharField(required=True)
    unit = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_field(self, value: str) -> str:
        # Only allow non-alphanumeric characters ".", "_", no spaces
        if not all(c.isalnum() or c in "._" for c in value):
            raise serializers.ValidationError("Field name contains invalid characters.")

        # Convert camelCase to snake_case, lowercase, and replace "." with "__" for nested fields
        s1 = re.sub("(.)([A-Z][a-z]+)", r"\1_\2", value)
        snake = re.sub("([a-z0-9])([A-Z])", r"\1_\2", s1).lower()
        return snake.replace(".", "__")

    def validate_value(self, value: Any) -> Any:
        # Geometry conversion: GeoJSON dict or WKT string to GEOSGeometry
        field = self.initial_data.get("field")
        if field == "geometry":
            if isinstance(value, dict) and "type" in value and "coordinates" in value:
                return GEOSGeometry(json.dumps(value), srid=4326)
            if isinstance(value, str):
                return GEOSGeometry(value, srid=4326)

        # If the value is a datetime or date string, convert to appropriate type
        if isinstance(value, str):
            try:
                return serializers.DateField().to_internal_value(value)
            except (serializers.ValidationError, TypeError, ValueError):
                pass
            try:
                return serializers.DateTimeField().to_internal_value(value)
            except (serializers.ValidationError, TypeError, ValueError):
                pass
        return value

    def build_filter_query(self):
        """
        Build a Django Q object for filtering assets.

        For attribute filters, uses the Asset.cached_attributes JSONB field
        which is maintained by database triggers.
        """
        self.is_valid(raise_exception=True)
        field = self.validated_data["field"]
        operator = self.validated_data["operator"]
        value = self.validated_data["value"]
        query_unit = self.validated_data.get("unit", "")

        # Support a convenience field name `geometry_intersects` which applies
        # a bbox-prefilter followed by a precise ST_Intersects check to encourage
        # GiST index usage in PostGIS.
        if field in ("geometry_intersects", "geom_intersects"):
            return self._build_geometry_intersects_query(value)

        if field.startswith("attributes.") or field.startswith("attributes__"):
            return self._build_cached_attributes_query(
                field, operator, value, query_unit
            )

        # Special handling for geometry_type filter
        return self._build_regular_field_query(field, operator, value)

    def _build_geometry_intersects_query(self, value: Any) -> Q:
        """Build a Q object that first applies a bbox overlap prefilter and then
        a precise intersects check. Accepts GeoJSON dict, WKT string, or
        a GEOSGeometry instance."""
        geom = None
        if isinstance(value, GEOSGeometry):
            geom = value
        elif isinstance(value, dict) and "type" in value and "coordinates" in value:
            geom = GEOSGeometry(json.dumps(value), srid=4326)
        elif isinstance(value, str):
            try:
                geom = GEOSGeometry(value, srid=4326)
            except Exception:
                geom = None

        if geom is None:
            return Q()

        # Apply bbox-prefilter (fast && operator) then precise intersects
        try:
            return Q(geometry__bboverlaps=geom) & Q(geometry__intersects=geom)
        except Exception:
            # Fallback to intersects-only if bboverlaps isn't available
            return Q(geometry__intersects=geom)

    def _build_cached_attributes_query(
        self, field: str, operator: str, value: Any, query_unit: str
    ) -> Q:
        """
        Build a Q object for filtering on Asset.cached_attributes JSONB field.

        The cached_attributes field contains: {"api_key": value, ...}
        """
        attr_prefix = field.replace(".", "__")
        parts = attr_prefix.split("__")

        if len(parts) < 2:
            return Q()

        api_key = parts[1]

        # Get attribute info for unit conversion (cached)
        attr_info = get_attribute_info_by_api_key(api_key)

        filter_value = value

        # For number types with units, convert the query value to the stored unit
        if attr_info and attr_info.get("attribute_type") == "number" and query_unit:
            attr_unit = attr_info.get("unit", "")
            if attr_unit:
                if isinstance(filter_value, list):
                    filter_value = [
                        convert_value(v, query_unit, attr_unit) if v is not None else v
                        for v in filter_value
                    ]
                elif filter_value is not None:
                    filter_value = convert_value(filter_value, query_unit, attr_unit)

        # Handle nested JSON paths (e.g., attributes.my_json_field.nested.key)
        if len(parts) > 2:
            # Build nested JSONB path: cached_attributes__api_key__nested__key
            json_path = "__".join(parts[1:])
            return self._build_jsonb_query(
                f"cached_attributes__{json_path}", operator, filter_value
            )

        # Simple attribute lookup: cached_attributes__api_key
        json_field = f"cached_attributes__{api_key}"
        return self._build_jsonb_query(json_field, operator, filter_value)

    def _build_jsonb_query(self, json_field: str, operator: str, value: Any) -> Q:
        """
        Build a Q object for JSONB field queries with various operators.
        """
        is_negated = operator == "nin"
        actual_operator = "in" if is_negated else operator

        # Handle null values
        if isinstance(value, list):
            has_null = None in value
            non_null_values = [v for v in value if v is not None]
        else:
            has_null = value is None
            non_null_values = [] if has_null else [value]

        # Build the query based on operator
        if actual_operator == "in":
            if has_null and non_null_values:
                # Match null OR any of the non-null values
                q = Q(**{f"{json_field}__isnull": True}) | Q(
                    **{f"{json_field}__in": non_null_values}
                )
            elif has_null:
                # Match null only
                q = Q(**{f"{json_field}__isnull": True})
            else:
                # Match any of the values
                q = Q(**{f"{json_field}__in": value})
        elif actual_operator == "exact":
            if has_null:
                q = Q(**{f"{json_field}__isnull": True})
            else:
                q = Q(**{json_field: value})
        elif actual_operator == "contains":
            # For text fields, use icontains for case-insensitive search
            q = Q(**{f"{json_field}__icontains": value})
        elif actual_operator == "icontains":
            q = Q(**{f"{json_field}__icontains": value})
        elif actual_operator == "startswith":
            q = Q(**{f"{json_field}__startswith": value})
        elif actual_operator == "istartswith":
            q = Q(**{f"{json_field}__istartswith": value})
        elif actual_operator == "endswith":
            q = Q(**{f"{json_field}__endswith": value})
        elif actual_operator == "iendswith":
            q = Q(**{f"{json_field}__iendswith": value})
        elif actual_operator == "iexact":
            q = Q(**{f"{json_field}__iexact": value})
        elif actual_operator in ("lt", "lte", "gt", "gte"):
            # For numeric comparisons on JSONB, we need to ensure proper type handling
            q = Q(**{f"{json_field}__{actual_operator}": value})
        elif actual_operator == "range":
            # Range expects a tuple/list of (start, end)
            if isinstance(value, (list, tuple)) and len(value) == 2:
                q = Q(**{f"{json_field}__gte": value[0]}) & Q(
                    **{f"{json_field}__lte": value[1]}
                )
            else:
                q = Q()
        elif actual_operator == "ne":
            # Not equal
            if has_null:
                q = Q(**{f"{json_field}__isnull": False})
            else:
                q = ~Q(**{json_field: value})
        else:
            # Fallback to generic lookup
            q = Q(**{f"{json_field}__{actual_operator}": value})

        # Apply negation for nin operator
        if is_negated:
            q = ~q

        # Apply inverse if set
        if self.validated_data.get("inverse", False):
            q = ~q

        return q

    def _build_regular_field_query(self, field: str, operator: str, value: Any) -> Q:
        """Build Q object for non-attribute fields."""
        if field == "geometry_type":
            # geometry_type filters on the geometry's type (Point, LineString, Polygon)
            # Use geometry__geom_type which returns the OGC geometry type name
            if operator == "nin":
                query_obj = ~Q(geometry__geom_type__in=value)
            elif operator == "in":
                query_obj = Q(geometry__geom_type__in=value)
            elif operator == "exact":
                query_obj = Q(geometry__geom_type=value)
            else:
                query_obj = Q(**{f"geometry__geom_type__{operator}": value})
            if self.validated_data.get("inverse", False):
                query_obj = ~query_obj
            return query_obj

        # For direct geometry filters (field == 'geometry'), prefer a bbox
        # prefilter before running the expensive ST_Intersects check so the
        # planner can use GiST indexes. Use the same helper as
        # `geometry_intersects` convenience field.
        if field == "geometry" and operator == "intersects":
            try:
                return self._build_geometry_intersects_query(value)
            except Exception:
                return Q(geometry__intersects=value)

        # Special-case H3 prefix startswith to produce a metadata-only Q that
        # callers can use to add an index-friendly LEFT(h3_index, N) prefilter.
        if field == "h3_index" and operator in ("startswith", "istartswith"):
            prefix = value if isinstance(value, str) else str(value)
            prefix_len = len(prefix)
            if operator == "istartswith":
                prefix = prefix.lower()
            q = Q()
            # Attach prefilter metadata for callers to inspect
            q._h3_prefilter = {
                "prefix": prefix,
                "len": prefix_len,
                "case_insensitive": operator == "istartswith",
            }
            if self.validated_data.get("inverse", False):
                q = ~q
            return q

        # Handle nin (not in) operator for regular fields
        if operator == "nin":
            query_obj = ~Q(**{f"{field}__in": value})
        elif operator == "exact":
            query_obj = Q(**{field: value})
        else:
            query_obj = Q(**{f"{field}__{operator}": value})
        if self.validated_data.get("inverse", False):
            query_obj = ~query_obj
        return query_obj


class FilterSerializer(serializers.Serializer):
    logic = serializers.CharField(required=False, default="AND")
    filters = serializers.ListField(child=serializers.DictField(), required=True)

    def build_filter_group(self, group_data):
        logic = group_data.get("logic", "AND").upper()
        filters = group_data.get("filters", [])

        # Collect all Q objects for this group
        q_objects = []
        for item in filters:
            # If item has "logic", it's a nested group
            if "logic" in item:
                new_q_object = FilterSerializer(data=item).build_query()
            else:
                new_q_object = FilterGroupSerializer(data=item).build_filter_query()
            q_objects.append(new_q_object)

        if not q_objects:
            return Q()

        # Create a Q object with the correct connector
        if logic == "OR":
            # Use Q with OR connector
            result = Q()
            result.connector = Q.OR
            result.children = list(q_objects)
            # Collect any h3 prefilter metadata from children
            h3s = []
            for q in q_objects:
                if hasattr(q, "_h3_prefilter"):
                    h3s.append(q._h3_prefilter)
                if hasattr(q, "_h3_prefilters"):
                    h3s.extend(q._h3_prefilters)
            if h3s:
                result._h3_prefilters = h3s
            return result
        else:
            # AND logic - combine with &
            result = q_objects[0]
            for q in q_objects[1:]:
                result &= q
            # Collect any h3 prefilter metadata from children
            h3s = []
            for q in q_objects:
                if hasattr(q, "_h3_prefilter"):
                    h3s.append(q._h3_prefilter)
                if hasattr(q, "_h3_prefilters"):
                    h3s.extend(q._h3_prefilters)
            if h3s:
                # Attach to the combined result for callers to use
                result._h3_prefilters = h3s
            return result

    def validate_filters(self, value):
        # Each filter can be either a FilterGroup or a FilterSerializer
        validated = []
        for item in value:
            if "logic" in item:
                validated.append(FilterSerializer(data=item).validate(item))
            else:
                validated.append(FilterGroupSerializer(data=item).validate(item))
        return validated

    def build_query(self):
        self.is_valid(raise_exception=True)

        return self.build_filter_group(self.validated_data)
