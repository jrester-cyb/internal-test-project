from assets.filter_serializers import FilterSerializer, FilterGroupSerializer
from datetime import datetime, date, timezone
from django.db.models import Q


def test_valid_geohash_from_latlon_string():
    data = {
        "field": "geohash",
        "value": "9q8yyzvpg",
        "operator": "exact",
    }
    serializer = FilterGroupSerializer(data=data)
    assert serializer.is_valid(), serializer.errors
    # Should encode to a geohash string of length 9
    geohash_value = serializer.validated_data["value"]
    assert isinstance(geohash_value, str)
    assert len(geohash_value) == 9


def test_valid_geohash_from_geohash_string():
    data = {
        "field": "geohash",
        "value": "9q8yyzvpg",
        "operator": "exact",
    }
    serializer = FilterGroupSerializer(data=data)
    assert serializer.is_valid(), serializer.errors
    assert serializer.validated_data["value"] == "9q8yyzvpg"


# --- Single filter tests ---
def test_valid_name_filter():
    data = {
        "logic": "AND",
        "filters": [
            {
                "field": "name",
                "value": "Ph",
                "operator": "contains",
            }
        ],
    }
    serializer = FilterSerializer(data=data)
    assert serializer.is_valid(), serializer.errors
    assert serializer.validated_data["filters"][0]["field"] == "name"
    assert serializer.validated_data["filters"][0]["value"] == "Ph"
    assert serializer.validated_data["filters"][0]["operator"] == "contains"


def test_valid_asset_field_name_filter():
    data = {
        "field": "assetType",
        "value": "Restaurant",
        "operator": "exact",
    }
    serializer = FilterGroupSerializer(data=data)
    assert serializer.is_valid(), serializer.errors
    assert serializer.validated_data["field"] == "asset_type"
    assert serializer.validated_data["value"] == "Restaurant"
    assert serializer.validated_data["operator"] == "exact"


def test_able_to_query_by_location():
    data = {
        "field": "geometry",
        "value": "POLYGON((-122.5 37.7, -122.5 37.8, -122.4 37.8, -122.4 37.7, -122.5 37.7))",
        "operator": "within",
    }
    serializer = FilterGroupSerializer(data=data)
    assert serializer.is_valid(), serializer.errors
    assert serializer.validated_data["field"] == "geometry"
    assert (
        serializer.validated_data["value"]
        == "POLYGON((-122.5 37.7, -122.5 37.8, -122.4 37.8, -122.4 37.7, -122.5 37.7))"
    )
    assert serializer.validated_data["operator"] == "within"


def test_query_by_created_at_datetime():
    data = {
        "field": "created_at",
        "value": "2024-01-01T00:00:00Z",
        "operator": "gte",
    }
    serializer = FilterGroupSerializer(data=data)
    assert serializer.is_valid(), serializer.errors
    assert serializer.validated_data["field"] == "created_at"

    assert serializer.validated_data["value"] == datetime(
        2024, 1, 1, 0, 0, tzinfo=timezone.utc
    )
    assert serializer.validated_data["operator"] == "gte"


def test_query_by_attribute_date():
    data = {
        "field": "attributes.purchaseDate",
        "value": "2023-12-25",
        "operator": "exact",
    }
    serializer = FilterGroupSerializer(data=data)
    assert serializer.is_valid(), serializer.errors
    assert serializer.validated_data["field"] == "attributes__purchase_date"
    assert serializer.validated_data["value"] == date(2023, 12, 25)
    assert serializer.validated_data["operator"] == "exact"


def test_build_query():
    data = {
        "logic": "AND",
        "filters": [
            {
                "field": "name",
                "value": "Ph",
                "operator": "contains",
            },
            {
                "field": "assetType.name",
                "value": "Restaurant",
                "operator": "iexact",
            },
            {
                "logic": "OR",
                "filters": [
                    {
                        "field": "created_at",
                        "value": "2024-01-01T00:00:00Z",
                        "operator": "gte",
                    },
                    {
                        "field": "created_at",
                        "value": "2024-06-01T00:00:00Z",
                        "operator": "lte",
                    },
                ],
            },
        ],
    }
    serializer = FilterSerializer(data=data)
    assert serializer.is_valid(), serializer.errors
    q_object = serializer.build_query()
    assert q_object == Q({"name__contains": "Ph"}) & Q(
        {"asset_type__name__iexact": "Restaurant"}
    ) & (
        Q({"created_at__gte": datetime(2024, 1, 1, 0, 0, tzinfo=timezone.utc)})
        | Q({"created_at__lte": datetime(2024, 6, 1, 0, 0, tzinfo=timezone.utc)})
    )


# def test_missing_field():
#     data = {"value": "Ph"}
#     serializer = FilterSerializer(data=data)
#     assert not serializer.is_valid()
#     assert "field" in serializer.errors


# # --- Filter group tests ---
# def test_valid_filter_group():
#     data = {
#         "logic": "AND",
#         "filters": [
#             {"field": "name", "value": "Ph"},
#             {"field": "assetfieldName", "assetfieldName": "Restaurant"},
#         ],
#     }
#     serializer = FilterGroupSerializer(data=data)
#     assert serializer.is_valid(), serializer.errors
#     assert serializer.validated_data["logic"] == "AND"
#     assert len(serializer.validated_data["filters"]) == 2


# def test_nested_filter_group():
#     data = {
#         "logic": "OR",
#         "filters": [
#             {"field": "name", "value": "Ph"},
#             {
#                 "logic": "AND",
#                 "filters": [
#                     {"field": "assetfieldName", "assetfieldName": "Restaurant"},
#                     {"field": "name", "value": "Starbucks"},
#                 ],
#             },
#         ],
#     }
#     serializer = FilterGroupSerializer(data=data)
#     assert serializer.is_valid(), serializer.errors
#     assert serializer.validated_data["logic"] == "OR"
#     assert len(serializer.validated_data["filters"]) == 2


# # --- Error cases ---
# def test_invalid_filter_in_group():
#     data = {
#         "logic": "AND",
#         "filters": [
#             {"value": "Ph"},  # missing field
#         ],
#     }
#     serializer = FilterGroupSerializer(data=data)
#     assert not serializer.is_valid()
#     assert "filters" in serializer.errors
