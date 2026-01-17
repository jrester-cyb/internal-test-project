from typing import Any
from rest_framework import serializers
import re
from django.db.models import Q
from django.contrib.gis.geos import GEOSGeometry
from django.core.cache import cache
import json
from datetime import date, datetime

from assets.models import GlobalAssetTypeAttribute, WorkspaceLocalAssetTypeAttribute
from utils.units.helpers.unit_conversion import convert_value, validate_unit


def get_attributes_by_api_key(api_key: str) -> list[dict]:
    """
    Get attribute definitions by api_key, with caching.
    Returns a list of dicts with id, attribute_type, unit, and has_choices.
    Cache TTL is 5 minutes.
    """
    cache_key = f"attr_filter:{api_key}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    from itertools import chain

    global_attrs = GlobalAssetTypeAttribute.objects.filter(api_key=api_key).prefetch_related(
        "choices"
    ).only("id", "attribute_type", "unit")
    local_attrs = WorkspaceLocalAssetTypeAttribute.objects.filter(api_key=api_key).prefetch_related(
        "choices"
    ).only("id", "attribute_type", "unit")

    # Convert to list of dicts for caching (can't cache querysets)
    attrs = [
        {
            "id": attr.id,
            "attribute_type": attr.attribute_type,
            "unit": attr.unit,
            "has_choices": attr.choices.exists(),
        }
        for attr in chain(global_attrs, local_attrs)
    ]

    cache.set(cache_key, attrs, timeout=300)  # 5 minutes
    return attrs


class FilterGroupSerializer(serializers.Serializer):
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
    # Lookup paths for direct attribute values (no choices)
    LOOKUP_MAP = {
        "text": "textattributevalue__value",
        "number": "numberattributevalue__value",
        "boolean": "booleanattributevalue__value",
        "date": "dateattributevalue__value",
        "datetime": "datetimeattributevalue__value",
        "json": "jsonattributevalue__value",
        "link": "linkattributevalue__url",
    }
    # Lookup paths for choice attribute values (via ChoiceAttributeValue -> polymorphic choice)
    CHOICE_LOOKUP_MAP = {
        "text": "choiceattributevalue__choice__textattributechoice__value",
        "number": "choiceattributevalue__choice__numberattributechoice__value",
        "date": "choiceattributevalue__choice__dateattributechoice__value",
        "datetime": "choiceattributevalue__choice__datetimeattributechoice__value",
        "json": "choiceattributevalue__choice__jsonattributechoice__value",
        "link": "choiceattributevalue__choice__linkattributechoice__url",
        # Boolean attributes cannot have choices (enforced by DB trigger)
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
        self.is_valid(raise_exception=True)
        field = self.validated_data["field"]
        operator = self.validated_data["operator"]
        value = self.validated_data["value"]
        query_unit = self.validated_data.get("unit", "")

        if field.startswith("attributes.") or field.startswith("attributes__"):
            attr_prefix = field.replace(".", "__")
            parts = attr_prefix.split("__")
            if len(parts) == 2:
                api_key = parts[1]
                # Get attribute definitions (cached)
                attrs = get_attributes_by_api_key(api_key)

                q = None
                # Handle nin (not in) operator - convert to 'in' with negation
                is_negated = operator == "nin"
                actual_operator = "in" if is_negated else operator

                for attr in attrs:
                    attr_type = attr["attribute_type"]
                    attr_id = attr["id"]
                    attr_unit = attr["unit"]
                    has_choices = attr.get("has_choices", False)
                    filter_value = value

                    # Select the correct lookup path based on whether the attribute has choices
                    lookup_map = self.CHOICE_LOOKUP_MAP if has_choices else self.LOOKUP_MAP

                    # For number types with units, convert the query value to the stored unit
                    if attr_type == "number" and query_unit and attr_unit:
                        if isinstance(filter_value, list):
                            filter_value = [
                                (
                                    convert_value(v, query_unit, attr_unit)
                                    if v is not None
                                    else v
                                )
                                for v in filter_value
                            ]
                        else:
                            filter_value = (
                                convert_value(filter_value, query_unit, attr_unit)
                                if filter_value is not None
                                else filter_value
                            )

                    if isinstance(filter_value, list):
                        has_null = None in filter_value
                        non_null_values = [v for v in filter_value if v is not None]
                    else:
                        has_null = filter_value is None
                        non_null_values = [] if has_null else [filter_value]

                    # Link type searches both url and display_text fields
                    if attr_type == "link":
                        # Select the correct path prefix based on whether attribute has choices
                        if has_choices:
                            url_path = "choiceattributevalue__choice__linkattributechoice__url"
                            text_path = "choiceattributevalue__choice__linkattributechoice__display_text"
                        else:
                            url_path = "linkattributevalue__url"
                            text_path = "linkattributevalue__display_text"

                        if actual_operator == "in":
                            if has_null:
                                new_q = (
                                    Q(
                                        **{
                                            "attributes__asset_type_attribute_id": attr_id
                                        }
                                    )
                                    & (
                                        Q(
                                            **{
                                                f"attributes__{url_path}__in": non_null_values
                                            }
                                        )
                                        | Q(
                                            **{
                                                f"attributes__{text_path}__in": non_null_values
                                            }
                                        )
                                    )
                                ) | Q(
                                    **{
                                        "attributes__asset_type_attribute_id": attr_id,
                                        f"attributes__isnull": True,
                                    }
                                )
                            else:
                                new_q = Q(
                                    **{"attributes__asset_type_attribute_id": attr_id}
                                ) & (
                                    Q(
                                        **{
                                            f"attributes__{url_path}__in": filter_value
                                        }
                                    )
                                    | Q(
                                        **{
                                            f"attributes__{text_path}__in": filter_value
                                        }
                                    )
                                )
                        else:
                            if has_null:
                                new_q = Q(
                                    **{
                                        "attributes__asset_type_attribute_id": attr_id,
                                        f"attributes__isnull": True,
                                    }
                                )
                            else:
                                new_q = Q(
                                    **{"attributes__asset_type_attribute_id": attr_id}
                                ) & (
                                    Q(
                                        **{
                                            f"attributes__{url_path}__{actual_operator}": filter_value
                                        }
                                    )
                                    | Q(
                                        **{
                                            f"attributes__{text_path}__{actual_operator}": filter_value
                                        }
                                    )
                                )
                    else:
                        if actual_operator == "in":
                            if is_negated:
                                # Use Exists with a filtered subquery to ensure both
                                # asset_type_attribute_id and value are checked together
                                # in the same row (avoiding Django's separate subquery issue)
                                from django.db.models import Exists, OuterRef
                                from assets.models import BaseAttributeValue

                                if has_null:
                                    # nin [null] or nin [null, "foo", ...]:
                                    # Exclude assets with null values (or specified non-null values)
                                    # = Include assets that HAVE a non-null value not in the exclusion list
                                    subquery = BaseAttributeValue.objects.filter(
                                        asset_id=OuterRef("pk"),
                                        asset_type_attribute_id=attr_id,
                                        **{f"{lookup_map[attr_type]}__isnull": False},
                                    )
                                    if non_null_values:
                                        # Also exclude specific values
                                        subquery = subquery.exclude(
                                            **{f"{lookup_map[attr_type]}__in": non_null_values}
                                        )
                                    new_q = Exists(subquery)
                                else:
                                    # nin ["foo", "bar"]: Exclude assets with these specific values
                                    subquery = BaseAttributeValue.objects.filter(
                                        asset_id=OuterRef("pk"),
                                        asset_type_attribute_id=attr_id,
                                        **{f"{lookup_map[attr_type]}__in": filter_value},
                                    )
                                    new_q = ~Exists(subquery)
                            else:
                                if has_null:
                                    new_q = Q(
                                        **{
                                            "attributes__asset_type_attribute_id": attr_id,
                                            f"attributes__{lookup_map[attr_type]}__in": non_null_values,
                                        }
                                    ) | Q(
                                        **{
                                            "attributes__asset_type_attribute_id": attr_id,
                                            f"attributes__{lookup_map[attr_type]}__isnull": True,
                                        }
                                    )
                                else:
                                    new_q = Q(
                                        **{
                                            "attributes__asset_type_attribute_id": attr_id,
                                            f"attributes__{lookup_map[attr_type]}__in": filter_value,
                                        }
                                    )
                        else:
                            if is_negated:
                                new_q = Q(
                                    **{"attributes__asset_type_attribute_id": attr_id}
                                ) & ~Q(
                                    **{
                                        f"attributes__{lookup_map[attr_type]}__{actual_operator}": filter_value
                                    }
                                )
                            else:
                                if has_null:
                                    new_q = Q(
                                        **{
                                            "attributes__asset_type_attribute_id": attr_id,
                                            f"attributes__{lookup_map[attr_type]}__isnull": True,
                                        }
                                    )
                                else:
                                    new_q = Q(
                                        **{
                                            "attributes__asset_type_attribute_id": attr_id,
                                            f"attributes__{lookup_map[attr_type]}__{actual_operator}": filter_value,
                                        }
                                    )

                    if q is None:
                        q = new_q
                    else:
                        # Logic for combining queries across multiple attributes with same api_key:
                        #
                        # For nin with specific values (e.g., nin ["foo", "bar"]):
                        #   "Exclude assets where value is foo OR bar"
                        #   = NOT(attr1 in values) AND NOT(attr2 in values)
                        #   = AND logic
                        #
                        # For nin with only null (e.g., nin [null]):
                        #   "Exclude assets where value is null" = "Include assets that HAVE a value"
                        #   = (attr1 exists and not null) OR (attr2 exists and not null)
                        #   = OR logic (asset is included if it has a value in ANY matching attribute)
                        #
                        # For positive filters (in, exact, etc.):
                        #   "Include assets where value matches"
                        #   = (attr1 matches) OR (attr2 matches)
                        #   = OR logic
                        if is_negated and non_null_values:
                            # nin with specific values: AND logic
                            q &= new_q
                        else:
                            # nin with only null, or positive filters: OR logic
                            q |= new_q

                if q is None:
                    return Q()
                if self.validated_data.get("inverse", False):
                    q = ~q
                return q
            else:
                # For deeper paths, only JSONField supports nested lookups
                api_key = parts[1]
                json_path = "__".join(parts[2:])
                # Get attribute definitions (cached)
                attrs = get_attributes_by_api_key(api_key)
                attr_ids = [attr["id"] for attr in attrs]
                if not attr_ids:
                    return Q()

                q = Q(
                    **{
                        "attributes__asset_type_attribute_id__in": attr_ids,
                        f"attributes__jsonattributevalue__value__{json_path}__{operator}": value,
                    }
                )
                if self.validated_data.get("inverse", False):
                    q = ~q
                return q

        # Special handling for geometry_type filter
        if field == "geometry_type":
            # geometry_type filters on the geometry's type (Point, LineString, Polygon)
            # Use geometry__geom_type which returns the OGC geometry type name
            if operator == "nin":
                # Exclude these geometry types
                query_obj = ~Q(geometry__geom_type__in=value)
            elif operator == "in":
                # Include only these geometry types
                query_obj = Q(geometry__geom_type__in=value)
            elif operator == "exact":
                query_obj = Q(geometry__geom_type=value)
            else:
                query_obj = Q(**{f"geometry__geom_type__{operator}": value})
            if self.validated_data.get("inverse", False):
                query_obj = ~query_obj
            return query_obj

        # Handle nin (not in) operator for regular fields
        if operator == "nin":
            query_obj = ~Q(**{f"{field}__in": value})
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
            return result
        else:
            # AND logic - combine with &
            result = q_objects[0]
            for q in q_objects[1:]:
                result &= q
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
