from django.db.models import Q
from django.contrib.gis.geos import GEOSGeometry, Point
from django.contrib.gis.measure import D
import geohash2
from rest_framework import serializers
from .filter_serializers import FilterSerializer, FilterSerializer
from rest_framework.exceptions import ValidationError


# --- Filter builder functions ---
def build_filter_group(filter_config):
    """Recursively build Q objects from filter configuration"""
    # Validate first
    validated = validate_filter_config(filter_config)
    if "filters" in validated:
        filters = validated.get("filters", [])
        logic = validated.get("logic", "AND").upper()
        if not filters:
            return Q()
        q_objects = []
        for item in filters:
            item_valid = validate_filter_config(item)
            if "filters" in item_valid:
                q_objects.append(build_filter_group(item_valid))
            elif "type" in item_valid:
                filter_type = item_valid.get("type")
                if filter_type == "text":
                    q_objects.append(build_text_filter(item_valid))
                elif filter_type == "name":
                    q_objects.append(build_name_filter(item_valid))
                elif filter_type == "assetTypeName":
                    q_objects.append(build_asset_type_name_filter(item_valid))
                else:
                    q_objects.append(build_geographic_filter(item_valid))
            elif "name" in item_valid:
                q_objects.append(build_name_filter(item_valid))
            elif "asset_type_name" in item_valid:
                q_objects.append(build_asset_type_filter(item_valid))
            else:
                q_objects.append(build_attribute_filter(item_valid))
        if logic == "OR":
            combined_q = Q()
            for q in q_objects:
                combined_q |= q
            return combined_q
        else:
            combined_q = Q()
            for q in q_objects:
                combined_q &= q
            return combined_q
    else:
        item_valid = validated
        if "type" in item_valid:
            filter_type = item_valid.get("type")
            if filter_type == "text":
                return build_text_filter(item_valid)
            elif filter_type == "name":
                return build_name_filter(item_valid)
            elif filter_type == "assetTypeName":
                return build_asset_type_name_filter(item_valid)
            else:
                return build_geographic_filter(item_valid)
        elif "name" in item_valid:
            return build_name_filter(item_valid)
        elif "asset_type_name" in item_valid:
            return build_asset_type_filter(item_valid)
        else:
            return build_attribute_filter(item_valid)


def build_name_filter(name_filter):
    value = name_filter.get("value") or name_filter.get("name")
    operation = name_filter.get("operation", "contains")
    if value:
        if operation == "equals":
            return Q(name__iexact=value)
        elif operation == "startswith":
            return Q(name__istartswith=value)
        elif operation == "endswith":
            return Q(name__iendswith=value)
        else:
            return Q(name__icontains=value)
    return Q()


def build_asset_type_name_filter(type_filter):
    asset_type_name = type_filter.get("assetTypeName")
    if asset_type_name:
        return Q(asset_type__name__iexact=asset_type_name)
    return Q()


def build_attribute_filter(filter_item):
    attribute = filter_item.get("attribute")
    value = filter_item.get("value")
    operator = filter_item.get("operator", "equals")
    if not attribute or value is None:
        return Q()
    base_q = Q(attributes__asset_type_attribute__api_key=attribute)
    q = Q()
    if operator == "equals":
        q |= Q(attributes__textattributevalue__value=value)
        q |= Q(attributes__jsonattributevalue__value=value)
        try:
            float_val = float(value)
            q |= Q(attributes__numberattributevalue__value=float_val)
        except (TypeError, ValueError):
            pass
        if isinstance(value, bool):
            q |= Q(attributes__booleanattributevalue__value=value)
        elif isinstance(value, str) and value.lower() in ("true", "false"):
            q |= Q(attributes__booleanattributevalue__value=(value.lower() == "true"))
        return base_q & q
    elif operator == "contains":
        q |= Q(attributes__textattributevalue__value__icontains=value)
        q |= Q(attributes__jsonattributevalue__value__icontains=value)
        return base_q & q
    elif operator == "gt":
        try:
            float_val = float(value)
            return base_q & Q(attributes__numberattributevalue__value__gt=float_val)
        except (TypeError, ValueError):
            return Q()
    elif operator == "lt":
        try:
            float_val = float(value)
            return base_q & Q(attributes__numberattributevalue__value__lt=float_val)
        except (TypeError, ValueError):
            return Q()
    elif operator == "gte":
        try:
            float_val = float(value)
            return base_q & Q(attributes__numberattributevalue__value__gte=float_val)
        except (TypeError, ValueError):
            return Q()
    elif operator == "lte":
        try:
            float_val = float(value)
            return base_q & Q(attributes__numberattributevalue__value__lte=float_val)
        except (TypeError, ValueError):
            return Q()
    return Q()


def build_asset_type_filter(type_filter):
    asset_type_name = type_filter.get("asset_type_name")
    if asset_type_name:
        return Q(asset_type__name=asset_type_name)
    return Q()


def build_geographic_filter(geo_filter):
    filter_type = geo_filter.get("type")
    if filter_type == "geohash":
        hash_value = geo_filter.get("hash")
        include_neighbors = geo_filter.get("neighbors", False)
        if hash_value:
            if include_neighbors:
                neighbors = geohash2.neighbors(hash_value)
                hashes = [hash_value] + list(neighbors.values())
                return Q(geohash__startswith=hash_value) | Q(
                    geohash__in=[h for h in hashes if h]
                )
            else:
                return Q(geohash__startswith=hash_value)
    elif filter_type == "bbox":
        bounds = geo_filter.get("bounds")
        if bounds and len(bounds) == 4:
            bbox = GEOSGeometry(
                f"POLYGON(({bounds[0]} {bounds[1]}, {bounds[2]} {bounds[1]}, {bounds[2]} {bounds[3]}, {bounds[0]} {bounds[3]}, {bounds[0]} {bounds[1]}))",
                srid=4326,
            )
            return Q(geometry__intersects=bbox)
    elif filter_type == "distance":
        point_coords = geo_filter.get("point")
        distance = geo_filter.get("distance")
        unit = geo_filter.get("unit", "m")
        if point_coords and len(point_coords) == 2 and distance:
            point = Point(point_coords[0], point_coords[1], srid=4326)
            return Q(geometry__dwithin=(point, D(**{unit: distance})))
    elif filter_type == "within":
        geometry_data = geo_filter.get("geometry")
        if geometry_data:
            try:
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
        point_coords = geo_filter.get("point")
        if point_coords and len(point_coords) == 2:
            point = Point(point_coords[0], point_coords[1], srid=4326)
            return Q(geometry__contains=point)
    elif filter_type == "intersects":
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


def validate_filter_config(filter_config):
    """Validate filter config using serializers. Returns validated data or raises ValidationError."""
    if "filters" in filter_config:
        serializer = FilterSerializer(data=filter_config)
    else:
        serializer = FilterSerializer(data=filter_config)
    serializer.is_valid(raise_exception=True)
    return serializer.validated_data
