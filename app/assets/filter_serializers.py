from typing import Any
from rest_framework import serializers
import re
from django.db.models import Q
from django.contrib.gis.geos import GEOSGeometry
import json
from datetime import date, datetime

from assets.models import AssetTypeAttribute


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
        ],
        "number": ["exact", "lt", "lte", "gt", "gte", "range", "ne"],
        "boolean": ["exact"],
        "date": ["exact", "lt", "lte", "gt", "gte", "range"],
        "datetime": ["exact", "lt", "lte", "gt", "gte", "range"],
        "json": ["exact", "contains"],
        "geometry": ["within", "intersects", "contains", "exact"],
        "h3_index": ["exact", "startswith"],
    }
    LOOKUP_MAP = {
        "text": "textattributevalue__value",
        "number": "numberattributevalue__value",
        "boolean": "booleanattributevalue__value",
        "date": "dateattributevalue__value",
        "datetime": "datetimeattributevalue__value",
        "json": "jsonattributevalue__value",
    }

    inverse = serializers.BooleanField(default=False)
    field = serializers.CharField(required=True)
    value = serializers.JSONField(required=True)
    operator = serializers.CharField(required=True)

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

        if field.startswith("attributes.") or field.startswith("attributes__"):
            attr_prefix = field.replace(".", "__")
            parts = attr_prefix.split("__")
            if len(parts) == 2:
                api_key = parts[1]
                # Get the model type based on the api_key
                asset_attribute_type_qs = AssetTypeAttribute.objects.filter(
                    api_key=api_key
                ).only("attribute_type")
                q = None
                for attr in asset_attribute_type_qs:
                    attr_type = attr.attribute_type

                    new_q = Q(
                        **{
                            "attributes__asset_type_attribute__api_key": api_key,
                            f"attributes__{self.LOOKUP_MAP[attr_type]}__{operator}": value,
                        }
                    )
                    if q is None:
                        q = new_q
                    else:
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
                q = Q(
                    **{
                        "attributes__asset_type_attribute__api_key": api_key,
                        f"attributes__jsonattributevalue__value__{json_path}__{operator}": value,
                    }
                )
                if self.validated_data.get("inverse", False):
                    q = ~q
                return q

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
        q_object = None

        for item in filters:
            # If item has "logic", it's a nested group
            if "logic" in item:
                new_q_object = FilterSerializer(data=item).build_query()
            else:
                new_q_object = FilterGroupSerializer(data=item).build_filter_query()

            if q_object is None:
                q_object = new_q_object
            else:
                if logic == "AND":
                    q_object &= new_q_object
                elif logic == "OR":
                    q_object |= new_q_object

        return q_object if q_object is not None else Q()

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
