from typing import Any
from rest_framework import serializers
import re
from django.db.models import Q
from django.contrib.gis.geos import GEOSGeometry
import json
from datetime import date, datetime

from assets.models import GlobalAssetTypeAttribute, WorkspaceLocalAssetTypeAttribute
from utils.units.helpers.unit_conversion import convert_value, validate_unit


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
    LOOKUP_MAP = {
        "text": "textattributevalue__value",
        "number": "numberattributevalue__value",
        "boolean": "booleanattributevalue__value",
        "date": "dateattributevalue__value",
        "datetime": "datetimeattributevalue__value",
        "json": "jsonattributevalue__value",
        "link": "linkattributevalue__url",
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
                # Get the model type and unit based on the api_key
                # Check both GlobalAssetTypeAttribute and WorkspaceLocalAssetTypeAttribute
                from itertools import chain
                global_attrs = GlobalAssetTypeAttribute.objects.filter(
                    api_key=api_key
                ).only("id", "attribute_type", "unit")
                local_attrs = WorkspaceLocalAssetTypeAttribute.objects.filter(
                    api_key=api_key
                ).only("id", "attribute_type", "unit")

                q = None
                # Handle nin (not in) operator - convert to 'in' with negation
                is_negated = operator == "nin"
                actual_operator = "in" if is_negated else operator

                for attr in chain(global_attrs, local_attrs):
                    attr_type = attr.attribute_type
                    filter_value = value

                    # For number types with units, convert the query value to the stored unit
                    if attr_type == "number" and query_unit and attr.unit:
                        try:
                            # Convert from query unit to the attribute's stored unit
                            filter_value = convert_value(value, query_unit, attr.unit)
                        except Exception:
                            # If conversion fails, use the original value
                            pass

                    # Link type searches both url and display_text fields
                    # Use the attribute ID directly since api_key is not on the base table
                    if attr_type == "link":
                        new_q = Q(
                            **{
                                "attributes__asset_type_attribute_id": attr.id,
                            }
                        ) & (
                            Q(
                                **{
                                    f"attributes__linkattributevalue__url__{actual_operator}": filter_value
                                }
                            )
                            | Q(
                                **{
                                    f"attributes__linkattributevalue__display_text__{actual_operator}": filter_value
                                }
                            )
                        )
                    else:
                        new_q = Q(
                            **{
                                "attributes__asset_type_attribute_id": attr.id,
                                f"attributes__{self.LOOKUP_MAP[attr_type]}__{actual_operator}": filter_value,
                            }
                        )

                    if q is None:
                        q = new_q
                    else:
                        # Always OR the attribute definitions together
                        # (asset matches if ANY attribute definition matches)
                        q |= new_q

                # Apply negation AFTER combining all attribute matches with OR
                # For nin: we want NOT(has value in attr1 OR has value in attr2)
                if is_negated and q is not None:
                    q = ~q

                if q is None:
                    return Q()
                if self.validated_data.get("inverse", False):
                    q = ~q
                return q
            else:
                # For deeper paths, only JSONField supports nested lookups
                api_key = parts[1]
                json_path = "__".join(parts[2:])
                # Get attribute IDs for the api_key
                from itertools import chain
                global_attrs = GlobalAssetTypeAttribute.objects.filter(
                    api_key=api_key
                ).only("id")
                local_attrs = WorkspaceLocalAssetTypeAttribute.objects.filter(
                    api_key=api_key
                ).only("id")

                attr_ids = [attr.id for attr in chain(global_attrs, local_attrs)]
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
