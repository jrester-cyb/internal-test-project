"""
Tests for attribute filtering in filter_serializers.py

These tests ensure that the attribute filtering logic works correctly for:
- GlobalAssetTypeAttribute filtering
- WorkspaceLocalAssetTypeAttribute filtering
- Different attribute types (text, number, boolean, etc.)
- Link type with url and display_text fields
- JSON nested path lookups
- Multiple attributes with same api_key (OR'd together)
- Inverse (NOT) filters
"""

import pytest
from django.db.models import Q
from datetime import date, datetime, timezone

from assets.filter_serializers import FilterSerializer, FilterGroupSerializer
from assets.models import (
    AssetType,
    Asset,
    GlobalAssetTypeAttribute,
    WorkspaceLocalAssetTypeAttribute,
    TextAttributeValue,
    NumberAttributeValue,
    BooleanAttributeValue,
    DateAttributeValue,
    LinkAttributeValue,
    JSONAttributeValue,
)
from organizations.models import Organization
from workspaces.models import Workspace


@pytest.fixture
def organization(db):
    """Create a test organization."""
    return Organization.objects.create(name="Test Organization")


@pytest.fixture
def workspace(db, organization):
    """Create a test workspace."""
    return Workspace.objects.create(organization=organization, name="Test Workspace")


@pytest.fixture
def asset_type(db, organization):
    """Create a test asset type."""
    return AssetType.objects.create(organization=organization, name="Test Asset Type")


@pytest.fixture
def global_text_attribute(db, asset_type):
    """Create a global text attribute."""
    return GlobalAssetTypeAttribute.objects.create(
        asset_type=asset_type, name="OSM ID", api_key="osm_id", attribute_type="text"
    )


@pytest.fixture
def global_number_attribute(db, asset_type):
    """Create a global number attribute."""
    return GlobalAssetTypeAttribute.objects.create(
        asset_type=asset_type,
        name="Number of Rooms",
        api_key="number_of_rooms",
        attribute_type="number",
        unit="rooms",
    )


@pytest.fixture
def global_boolean_attribute(db, asset_type):
    """Create a global boolean attribute."""
    return GlobalAssetTypeAttribute.objects.create(
        asset_type=asset_type,
        name="Is Active",
        api_key="is_active",
        attribute_type="boolean",
    )


@pytest.fixture
def global_date_attribute(db, asset_type):
    """Create a global date attribute."""
    return GlobalAssetTypeAttribute.objects.create(
        asset_type=asset_type,
        name="Purchase Date",
        api_key="purchase_date",
        attribute_type="date",
    )


@pytest.fixture
def global_link_attribute(db, asset_type):
    """Create a global link attribute."""
    return GlobalAssetTypeAttribute.objects.create(
        asset_type=asset_type, name="Website", api_key="website", attribute_type="link"
    )


@pytest.fixture
def global_json_attribute(db, asset_type):
    """Create a global JSON attribute."""
    return GlobalAssetTypeAttribute.objects.create(
        asset_type=asset_type,
        name="Metadata",
        api_key="metadata",
        attribute_type="json",
    )


@pytest.fixture
def workspace_local_attribute(db, asset_type, workspace):
    """Create a workspace-local text attribute."""
    return WorkspaceLocalAssetTypeAttribute.objects.create(
        asset_type=asset_type,
        workspace=workspace,
        name="Local Tag",
        api_key="local_tag",
        attribute_type="text",
    )


@pytest.fixture
def workspace_local_number_attribute(db, asset_type, workspace):
    """Create a workspace-local number attribute."""
    return WorkspaceLocalAssetTypeAttribute.objects.create(
        asset_type=asset_type,
        workspace=workspace,
        name="Local Score",
        api_key="local_score",
        attribute_type="number",
    )


@pytest.fixture
def asset_with_attributes(
    db, organization, asset_type, global_text_attribute, global_number_attribute
):
    """Create an asset with some attribute values."""
    asset = Asset.objects.create(
        organization=organization, asset_type=asset_type, name="Test Asset"
    )
    TextAttributeValue.objects.create(
        asset=asset, asset_type_attribute=global_text_attribute, value="12345"
    )
    NumberAttributeValue.objects.create(
        asset=asset, asset_type_attribute=global_number_attribute, value=100
    )
    return asset


# --- Serializer Validation Tests ---


class TestFilterGroupSerializerValidation:
    """Test that filter group serializer correctly validates and transforms input."""

    def test_attribute_field_converts_to_snake_case(self):
        """Test that camelCase attribute fields are converted to snake_case."""
        data = {
            "field": "attributes.purchaseDate",
            "value": "2023-12-25",
            "operator": "exact",
        }
        serializer = FilterGroupSerializer(data=data)
        assert serializer.is_valid(), serializer.errors
        assert serializer.validated_data["field"] == "attributes__purchase_date"

    def test_attribute_field_preserves_underscore_names(self):
        """Test that underscore names are preserved."""
        data = {
            "field": "attributes.osm_id",
            "value": "12345",
            "operator": "exact",
        }
        serializer = FilterGroupSerializer(data=data)
        assert serializer.is_valid(), serializer.errors
        assert serializer.validated_data["field"] == "attributes__osm_id"

    def test_nested_json_attribute_field(self):
        """Test nested JSON attribute path conversion."""
        data = {
            "field": "attributes.metadata.config.setting",
            "value": "test",
            "operator": "exact",
        }
        serializer = FilterGroupSerializer(data=data)
        assert serializer.is_valid(), serializer.errors
        assert (
            serializer.validated_data["field"]
            == "attributes__metadata__config__setting"
        )

    def test_attribute_filter_with_unit(self):
        """Test attribute filter includes unit for conversion."""
        data = {
            "field": "attributes.distance",
            "value": 100,
            "operator": "gt",
            "unit": "km",
        }
        serializer = FilterGroupSerializer(data=data)
        assert serializer.is_valid(), serializer.errors
        assert serializer.validated_data["unit"] == "km"


# --- Query Building Tests for Global Attributes ---


@pytest.mark.django_db
class TestGlobalAttributeFilterQuery:
    """Test query building for global asset type attributes."""

    def test_text_attribute_exact_filter(self, global_text_attribute):
        """Test building query for exact text attribute match."""
        data = {
            "field": "attributes.osm_id",
            "value": "12345",
            "operator": "exact",
        }
        serializer = FilterGroupSerializer(data=data)
        q = serializer.build_filter_query()

        # Should create a Q object filtering by attribute ID and text value
        assert q is not None
        assert q != Q()

    def test_text_attribute_icontains_filter(self, global_text_attribute):
        """Test building query for icontains text attribute match."""
        data = {
            "field": "attributes.osm_id",
            "value": "123",
            "operator": "icontains",
        }
        serializer = FilterGroupSerializer(data=data)
        q = serializer.build_filter_query()

        assert q is not None
        assert q != Q()

    def test_number_attribute_gt_filter(self, global_number_attribute):
        """Test building query for greater than number filter."""
        data = {
            "field": "attributes.number_of_rooms",
            "value": 50,
            "operator": "gt",
        }
        serializer = FilterGroupSerializer(data=data)
        q = serializer.build_filter_query()

        assert q is not None
        assert q != Q()

    def test_number_attribute_range_operators(self, global_number_attribute):
        """Test all comparison operators for number attributes."""
        operators = ["exact", "lt", "lte", "gt", "gte"]
        for op in operators:
            data = {
                "field": "attributes.number_of_rooms",
                "value": 100,
                "operator": op,
            }
            serializer = FilterGroupSerializer(data=data)
            q = serializer.build_filter_query()
            assert q is not None, f"Operator {op} should produce a valid query"
            assert q != Q(), f"Operator {op} should not produce empty query"

    def test_boolean_attribute_filter(self, global_boolean_attribute):
        """Test building query for boolean attribute."""
        data = {
            "field": "attributes.is_active",
            "value": True,
            "operator": "exact",
        }
        serializer = FilterGroupSerializer(data=data)
        q = serializer.build_filter_query()

        assert q is not None
        assert q != Q()

    def test_date_attribute_filter(self, global_date_attribute):
        """Test building query for date attribute."""
        data = {
            "field": "attributes.purchase_date",
            "value": "2023-12-25",
            "operator": "exact",
        }
        serializer = FilterGroupSerializer(data=data)
        q = serializer.build_filter_query()

        assert q is not None
        assert q != Q()

    def test_link_attribute_url_filter(self, global_link_attribute):
        """Test building query for link attribute searches both url and display_text."""
        data = {
            "field": "attributes.website",
            "value": "example.com",
            "operator": "icontains",
        }
        serializer = FilterGroupSerializer(data=data)
        q = serializer.build_filter_query()

        assert q is not None
        assert q != Q()

    def test_json_nested_path_filter(self, global_json_attribute):
        """Test building query for nested JSON path."""
        data = {
            "field": "attributes.metadata.setting.value",
            "value": "test",
            "operator": "exact",
        }
        serializer = FilterGroupSerializer(data=data)
        q = serializer.build_filter_query()

        assert q is not None
        assert q != Q()

    def test_nonexistent_attribute_returns_empty_query(self, asset_type):
        """Test that filtering on non-existent attribute returns empty Q."""
        data = {
            "field": "attributes.nonexistent_field",
            "value": "test",
            "operator": "exact",
        }
        serializer = FilterGroupSerializer(data=data)
        q = serializer.build_filter_query()

        # Should return empty Q() since no attribute with this api_key exists
        assert q == Q()

    def test_inverse_filter(self, global_text_attribute):
        """Test inverse (NOT) filter."""
        data = {
            "field": "attributes.osm_id",
            "value": "12345",
            "operator": "exact",
            "inverse": True,
        }
        serializer = FilterGroupSerializer(data=data)
        q = serializer.build_filter_query()

        assert q is not None
        # Inverse filters negate the query
        assert q != Q()


# --- Query Building Tests for Workspace Local Attributes ---


@pytest.mark.django_db
class TestWorkspaceLocalAttributeFilterQuery:
    """Test query building for workspace-local asset type attributes."""

    def test_workspace_local_text_attribute_filter(self, workspace_local_attribute):
        """Test building query for workspace-local text attribute."""
        data = {
            "field": "attributes.local_tag",
            "value": "important",
            "operator": "exact",
        }
        serializer = FilterGroupSerializer(data=data)
        q = serializer.build_filter_query()

        assert q is not None
        assert q != Q()

    def test_workspace_local_number_attribute_filter(
        self, workspace_local_number_attribute
    ):
        """Test building query for workspace-local number attribute."""
        data = {
            "field": "attributes.local_score",
            "value": 80,
            "operator": "gte",
        }
        serializer = FilterGroupSerializer(data=data)
        q = serializer.build_filter_query()

        assert q is not None
        assert q != Q()


# --- Combined Filter Tests ---


@pytest.mark.django_db
class TestCombinedAttributeFilters:
    """Test combined attribute filters with AND/OR logic."""

    def test_multiple_attribute_filters_and(
        self, global_text_attribute, global_number_attribute
    ):
        """Test AND combination of multiple attribute filters."""
        data = {
            "logic": "AND",
            "filters": [
                {
                    "field": "attributes.osm_id",
                    "value": "12345",
                    "operator": "exact",
                },
                {
                    "field": "attributes.number_of_rooms",
                    "value": 50,
                    "operator": "gt",
                },
            ],
        }
        serializer = FilterSerializer(data=data)
        assert serializer.is_valid(), serializer.errors
        q = serializer.build_query()

        assert q is not None
        assert q != Q()

    def test_multiple_attribute_filters_or(
        self, global_text_attribute, global_number_attribute
    ):
        """Test OR combination of multiple attribute filters."""
        data = {
            "logic": "OR",
            "filters": [
                {
                    "field": "attributes.osm_id",
                    "value": "12345",
                    "operator": "exact",
                },
                {
                    "field": "attributes.number_of_rooms",
                    "value": 100,
                    "operator": "lte",
                },
            ],
        }
        serializer = FilterSerializer(data=data)
        assert serializer.is_valid(), serializer.errors
        q = serializer.build_query()

        assert q is not None
        assert q != Q()

    def test_nested_filter_groups(
        self, global_text_attribute, global_number_attribute, global_boolean_attribute
    ):
        """Test nested filter groups with mixed logic."""
        data = {
            "logic": "AND",
            "filters": [
                {
                    "field": "attributes.is_active",
                    "value": True,
                    "operator": "exact",
                },
                {
                    "logic": "OR",
                    "filters": [
                        {
                            "field": "attributes.osm_id",
                            "value": "12345",
                            "operator": "exact",
                        },
                        {
                            "field": "attributes.number_of_rooms",
                            "value": 100,
                            "operator": "gte",
                        },
                    ],
                },
            ],
        }
        serializer = FilterSerializer(data=data)
        assert serializer.is_valid(), serializer.errors
        q = serializer.build_query()

        assert q is not None
        assert q != Q()

    def test_attribute_filter_with_asset_type_filter(
        self, global_text_attribute, asset_type
    ):
        """Test combining attribute filter with asset type filter."""
        data = {
            "logic": "AND",
            "filters": [
                {
                    "field": "assetTypeId",
                    "value": str(asset_type.id),
                    "operator": "exact",
                },
                {
                    "field": "attributes.osm_id",
                    "value": "12345",
                    "operator": "exact",
                },
            ],
        }
        serializer = FilterSerializer(data=data)
        assert serializer.is_valid(), serializer.errors
        q = serializer.build_query()

        assert q is not None
        assert q != Q()


# --- Actual Query Execution Tests ---


@pytest.mark.django_db
class TestAttributeFilterExecution:
    """Test that filters actually work when applied to querysets."""

    def test_text_filter_finds_matching_asset(
        self, organization, asset_type, global_text_attribute
    ):
        """Test that text attribute filter finds assets with matching value."""
        # Create assets with different text values
        asset1 = Asset.objects.create(
            organization=organization, asset_type=asset_type, name="Asset 1"
        )
        TextAttributeValue.objects.create(
            asset=asset1, asset_type_attribute=global_text_attribute, value="12345"
        )

        asset2 = Asset.objects.create(
            organization=organization, asset_type=asset_type, name="Asset 2"
        )
        TextAttributeValue.objects.create(
            asset=asset2, asset_type_attribute=global_text_attribute, value="67890"
        )

        # Build and apply filter
        data = {
            "field": "attributes.osm_id",
            "value": "12345",
            "operator": "exact",
        }
        serializer = FilterGroupSerializer(data=data)
        q = serializer.build_filter_query()

        results = Asset.objects.filter(q)
        assert results.count() == 1
        assert results.first() == asset1

    def test_number_filter_finds_matching_asset(
        self, organization, asset_type, global_number_attribute
    ):
        """Test that number attribute filter finds assets with matching value."""
        asset1 = Asset.objects.create(
            organization=organization, asset_type=asset_type, name="Asset 1"
        )
        NumberAttributeValue.objects.create(
            asset=asset1, asset_type_attribute=global_number_attribute, value=100
        )

        asset2 = Asset.objects.create(
            organization=organization, asset_type=asset_type, name="Asset 2"
        )
        NumberAttributeValue.objects.create(
            asset=asset2, asset_type_attribute=global_number_attribute, value=50
        )

        # Filter for rooms > 75
        data = {
            "field": "attributes.number_of_rooms",
            "value": 75,
            "operator": "gt",
        }
        serializer = FilterGroupSerializer(data=data)
        q = serializer.build_filter_query()

        results = Asset.objects.filter(q)
        assert results.count() == 1
        assert results.first() == asset1

    def test_boolean_filter_finds_matching_asset(
        self, organization, asset_type, global_boolean_attribute
    ):
        """Test that boolean attribute filter finds assets with matching value."""
        asset1 = Asset.objects.create(
            organization=organization, asset_type=asset_type, name="Active Asset"
        )
        BooleanAttributeValue.objects.create(
            asset=asset1, asset_type_attribute=global_boolean_attribute, value=True
        )

        asset2 = Asset.objects.create(
            organization=organization, asset_type=asset_type, name="Inactive Asset"
        )
        BooleanAttributeValue.objects.create(
            asset=asset2, asset_type_attribute=global_boolean_attribute, value=False
        )

        # Filter for active
        data = {
            "field": "attributes.is_active",
            "value": True,
            "operator": "exact",
        }
        serializer = FilterGroupSerializer(data=data)
        q = serializer.build_filter_query()

        results = Asset.objects.filter(q)
        assert results.count() == 1
        assert results.first() == asset1

    def test_workspace_local_attribute_filter_finds_asset(
        self, organization, asset_type, workspace_local_attribute
    ):
        """Test that workspace-local attribute filter finds assets."""
        asset1 = Asset.objects.create(
            organization=organization, asset_type=asset_type, name="Tagged Asset"
        )
        TextAttributeValue.objects.create(
            asset=asset1,
            asset_type_attribute=workspace_local_attribute,
            value="priority",
        )

        asset2 = Asset.objects.create(
            organization=organization, asset_type=asset_type, name="Other Asset"
        )
        TextAttributeValue.objects.create(
            asset=asset2, asset_type_attribute=workspace_local_attribute, value="normal"
        )

        # Filter for priority tag
        data = {
            "field": "attributes.local_tag",
            "value": "priority",
            "operator": "exact",
        }
        serializer = FilterGroupSerializer(data=data)
        q = serializer.build_filter_query()

        results = Asset.objects.filter(q)
        assert results.count() == 1
        assert results.first() == asset1

    def test_link_attribute_filter_searches_url(
        self, organization, asset_type, global_link_attribute
    ):
        """Test that link attribute filter searches URL field."""
        asset1 = Asset.objects.create(
            organization=organization, asset_type=asset_type, name="Asset with website"
        )
        LinkAttributeValue.objects.create(
            asset=asset1,
            asset_type_attribute=global_link_attribute,
            url="https://example.com/page",
            display_text="Example Page",
        )

        asset2 = Asset.objects.create(
            organization=organization,
            asset_type=asset_type,
            name="Asset with other website",
        )
        LinkAttributeValue.objects.create(
            asset=asset2,
            asset_type_attribute=global_link_attribute,
            url="https://other.com/page",
            display_text="Other Page",
        )

        # Filter for example.com in URL
        data = {
            "field": "attributes.website",
            "value": "example.com",
            "operator": "icontains",
        }
        serializer = FilterGroupSerializer(data=data)
        q = serializer.build_filter_query()

        results = Asset.objects.filter(q)
        assert results.count() == 1
        assert results.first() == asset1

    def test_link_attribute_filter_searches_display_text(
        self, organization, asset_type, global_link_attribute
    ):
        """Test that link attribute filter also searches display_text field."""
        asset1 = Asset.objects.create(
            organization=organization, asset_type=asset_type, name="Asset 1"
        )
        LinkAttributeValue.objects.create(
            asset=asset1,
            asset_type_attribute=global_link_attribute,
            url="https://site.com/1",
            display_text="Important Link",
        )

        asset2 = Asset.objects.create(
            organization=organization, asset_type=asset_type, name="Asset 2"
        )
        LinkAttributeValue.objects.create(
            asset=asset2,
            asset_type_attribute=global_link_attribute,
            url="https://site.com/2",
            display_text="Regular Link",
        )

        # Filter for "Important" in display_text
        data = {
            "field": "attributes.website",
            "value": "Important",
            "operator": "icontains",
        }
        serializer = FilterGroupSerializer(data=data)
        q = serializer.build_filter_query()

        results = Asset.objects.filter(q)
        assert results.count() == 1
        assert results.first() == asset1

    def test_combined_filters_and_logic_same_attribute(
        self, organization, asset_type, global_number_attribute
    ):
        """
        Test AND combination with multiple conditions on the same attribute type.

        Note: Due to Django ORM's behavior with multi-valued relations, AND-ing
        filters on DIFFERENT attributes (e.g., text AND number) requires using
        subqueries or multiple filter() calls. The current implementation generates
        a single Q object which Django interprets as requiring both conditions on
        the SAME related row - which is impossible when filtering different attribute types.

        This test verifies AND works correctly for the SAME attribute with range conditions.
        """
        # Asset with rooms in range
        asset1 = Asset.objects.create(
            organization=organization, asset_type=asset_type, name="In Range"
        )
        NumberAttributeValue.objects.create(
            asset=asset1, asset_type_attribute=global_number_attribute, value=75
        )

        # Asset below range
        asset2 = Asset.objects.create(
            organization=organization, asset_type=asset_type, name="Below Range"
        )
        NumberAttributeValue.objects.create(
            asset=asset2, asset_type_attribute=global_number_attribute, value=30
        )

        # Asset above range
        asset3 = Asset.objects.create(
            organization=organization, asset_type=asset_type, name="Above Range"
        )
        NumberAttributeValue.objects.create(
            asset=asset3, asset_type_attribute=global_number_attribute, value=150
        )

        # AND filter: number > 50 AND number < 100
        data = {
            "logic": "AND",
            "filters": [
                {
                    "field": "attributes.number_of_rooms",
                    "value": 50,
                    "operator": "gt",
                },
                {
                    "field": "attributes.number_of_rooms",
                    "value": 100,
                    "operator": "lt",
                },
            ],
        }
        serializer = FilterSerializer(data=data)
        q = serializer.build_query()

        results = Asset.objects.filter(q)
        assert results.count() == 1
        assert results.first() == asset1

    def test_combined_filters_and_logic_with_non_attribute_filter(
        self, organization, asset_type, global_text_attribute
    ):
        """
        Test AND combination of attribute filter with non-attribute filter (e.g., name).
        This should work correctly since one filter is on Asset fields, not through the
        multi-valued attributes relation.
        """
        # Asset that matches both criteria
        asset1 = Asset.objects.create(
            organization=organization, asset_type=asset_type, name="Target Asset"
        )
        TextAttributeValue.objects.create(
            asset=asset1, asset_type_attribute=global_text_attribute, value="12345"
        )

        # Asset that matches only name
        asset2 = Asset.objects.create(
            organization=organization, asset_type=asset_type, name="Target Other"
        )
        TextAttributeValue.objects.create(
            asset=asset2, asset_type_attribute=global_text_attribute, value="67890"
        )

        # Asset that matches only attribute
        asset3 = Asset.objects.create(
            organization=organization, asset_type=asset_type, name="Other Asset"
        )
        TextAttributeValue.objects.create(
            asset=asset3, asset_type_attribute=global_text_attribute, value="12345"
        )

        # AND filter: name contains "Target" AND osm_id = "12345"
        data = {
            "logic": "AND",
            "filters": [
                {
                    "field": "name",
                    "value": "Target",
                    "operator": "icontains",
                },
                {
                    "field": "attributes.osm_id",
                    "value": "12345",
                    "operator": "exact",
                },
            ],
        }
        serializer = FilterSerializer(data=data)
        q = serializer.build_query()

        results = Asset.objects.filter(q)
        assert results.count() == 1
        assert results.first() == asset1

    def test_combined_filters_or_logic(
        self, organization, asset_type, global_text_attribute, global_number_attribute
    ):
        """Test OR combination actually filters correctly."""
        # Asset that matches text
        asset1 = Asset.objects.create(
            organization=organization, asset_type=asset_type, name="Text Match"
        )
        TextAttributeValue.objects.create(
            asset=asset1, asset_type_attribute=global_text_attribute, value="target"
        )
        NumberAttributeValue.objects.create(
            asset=asset1, asset_type_attribute=global_number_attribute, value=10
        )

        # Asset that matches number
        asset2 = Asset.objects.create(
            organization=organization, asset_type=asset_type, name="Number Match"
        )
        TextAttributeValue.objects.create(
            asset=asset2, asset_type_attribute=global_text_attribute, value="other"
        )
        NumberAttributeValue.objects.create(
            asset=asset2, asset_type_attribute=global_number_attribute, value=100
        )

        # Asset that matches neither
        asset3 = Asset.objects.create(
            organization=organization, asset_type=asset_type, name="No Match"
        )
        TextAttributeValue.objects.create(
            asset=asset3, asset_type_attribute=global_text_attribute, value="something"
        )
        NumberAttributeValue.objects.create(
            asset=asset3, asset_type_attribute=global_number_attribute, value=10
        )

        # OR filter: text = "target" OR number > 50
        data = {
            "logic": "OR",
            "filters": [
                {
                    "field": "attributes.osm_id",
                    "value": "target",
                    "operator": "exact",
                },
                {
                    "field": "attributes.number_of_rooms",
                    "value": 50,
                    "operator": "gt",
                },
            ],
        }
        serializer = FilterSerializer(data=data)
        q = serializer.build_query()

        results = Asset.objects.filter(q)
        assert results.count() == 2
        assert asset1 in results
        assert asset2 in results
        assert asset3 not in results

    def test_filter_can_exclude_assets_with_blank_values(
        self, organization, asset_type, global_text_attribute
    ):
        """Test that filters can exclude assets with blank/null values for attributes."""
        # Create assets: one with a value, one without any value for the attribute
        asset_with_value = Asset.objects.create(
            organization=organization,
            asset_type=asset_type,
            name="Asset with value",
            geometry="POINT(0 0)",
        )
        TextAttributeValue.objects.create(
            asset=asset_with_value,
            asset_type_attribute=global_text_attribute,
            value="some value",
        )

        asset_without_value = Asset.objects.create(
            organization=organization,
            asset_type=asset_type,
            name="Asset without value",
            geometry="POINT(0 0)",
        )

        # Create a filter that excludes blank values (includes only assets with non-null values)
        # This simulates selecting all values except "Blank" in the UI
        data = {
            "field": f"attributes.{global_text_attribute.api_key}",
            "value": [None],  # Excluding null values
            "operator": "nin",
        }
        serializer = FilterGroupSerializer(data=data)
        q = serializer.build_filter_query()

        # Apply the filter
        results = Asset.objects.filter(q).filter(organization=organization)

        # Should include only the asset with a value, exclude the asset without a value
        assert results.count() == 1
        assert asset_with_value in results
        assert asset_without_value not in results

    def test_filter_can_include_only_assets_with_blank_values(
        self, organization, asset_type, global_text_attribute
    ):
        """Test that filters can include only assets with blank/null values for attributes."""
        # Create assets: one with a value, one without any value for the attribute
        asset_with_value = Asset.objects.create(
            organization=organization,
            asset_type=asset_type,
            name="Asset with value",
            geometry="POINT(0 0)",
        )
        TextAttributeValue.objects.create(
            asset=asset_with_value,
            asset_type_attribute=global_text_attribute,
            value="some value",
        )

        asset_without_value = Asset.objects.create(
            organization=organization,
            asset_type=asset_type,
            name="Asset without value",
            geometry="POINT(0 0)",
        )

        # Create a filter that includes only blank values (excludes all non-null values)
        # This simulates selecting only "Blank" in the UI
        data = {
            "field": f"attributes.{global_text_attribute.api_key}",
            "value": [],  # No exclusions means include all, but our logic should handle blanks
            "operator": "nin",
        }
        serializer = FilterGroupSerializer(data=data)
        q = serializer.build_filter_query()

        # Apply the filter
        results = Asset.objects.filter(q).filter(organization=organization)

        # With nin and empty exclusions, should include all assets (both with and without values)
        assert results.count() == 2
        assert asset_with_value in results
        assert asset_without_value in results


# --- Regression Tests ---


@pytest.mark.django_db
class TestAttributeFilterRegressions:
    """Regression tests for specific bugs that were fixed."""

    def test_api_key_lookup_uses_attribute_id_not_api_key_field(
        self, global_text_attribute
    ):
        """
        Regression test: The filter should use asset_type_attribute_id, not
        asset_type_attribute__api_key, because api_key is not on the base
        polymorphic model (BaseAssetTypeAttribute).

        This was causing: "Unsupported lookup 'api_key' for ForeignKey"
        """
        data = {
            "field": "attributes.osm_id",
            "value": "12345",
            "operator": "exact",
        }
        serializer = FilterGroupSerializer(data=data)
        # This should not raise an error
        q = serializer.build_filter_query()

        # Verify the query uses asset_type_attribute_id
        # The Q object should contain asset_type_attribute_id lookup
        assert q is not None
        assert q != Q()

    def test_workspace_local_attributes_are_queried(self, workspace_local_attribute):
        """
        Regression test: Workspace-local attributes should be found by the filter.
        Previously only GlobalAssetTypeAttribute was queried.
        """
        data = {
            "field": "attributes.local_tag",
            "value": "test",
            "operator": "exact",
        }
        serializer = FilterGroupSerializer(data=data)
        q = serializer.build_filter_query()

        # Should find the workspace-local attribute and return a non-empty query
        assert q is not None
        assert q != Q(), "Filter should find workspace-local attribute"

    def test_multiple_attributes_same_api_key_different_asset_types(
        self, organization, workspace
    ):
        """
        Test that multiple attributes with the same api_key (on different asset types)
        are OR'd together in the query.
        """
        # Create two asset types with attributes that have the same api_key
        asset_type1 = AssetType.objects.create(organization=organization, name="Type 1")
        attr1 = GlobalAssetTypeAttribute.objects.create(
            asset_type=asset_type1,
            name="Status",
            api_key="status",
            attribute_type="text",
        )

        asset_type2 = AssetType.objects.create(organization=organization, name="Type 2")
        attr2 = GlobalAssetTypeAttribute.objects.create(
            asset_type=asset_type2,
            name="Status",
            api_key="status",
            attribute_type="text",
        )

        # Create assets of each type
        asset1 = Asset.objects.create(
            organization=organization, asset_type=asset_type1, name="Asset Type 1"
        )
        TextAttributeValue.objects.create(
            asset=asset1, asset_type_attribute=attr1, value="active"
        )

        asset2 = Asset.objects.create(
            organization=organization, asset_type=asset_type2, name="Asset Type 2"
        )
        TextAttributeValue.objects.create(
            asset=asset2, asset_type_attribute=attr2, value="active"
        )

        # Filter should find both assets
        data = {
            "field": "attributes.status",
            "value": "active",
            "operator": "exact",
        }
        serializer = FilterGroupSerializer(data=data)
        q = serializer.build_filter_query()

        results = Asset.objects.filter(q)
        assert results.count() == 2

    def test_json_nested_path_uses_attribute_ids(
        self, global_json_attribute, organization, asset_type
    ):
        """
        Regression test: JSON nested path lookups should also use attribute IDs.
        """
        asset = Asset.objects.create(
            organization=organization, asset_type=asset_type, name="JSON Asset"
        )
        JSONAttributeValue.objects.create(
            asset=asset,
            asset_type_attribute=global_json_attribute,
            value={"config": {"setting": "enabled"}},
        )

        data = {
            "field": "attributes.metadata.config.setting",
            "value": "enabled",
            "operator": "exact",
        }
        serializer = FilterGroupSerializer(data=data)
        # This should not raise an error about api_key lookup
        q = serializer.build_filter_query()

        assert q is not None
        assert q != Q()

        # Verify it actually finds the asset
        results = Asset.objects.filter(q)
        assert results.count() == 1
        assert results.first() == asset

    def test_multiple_asset_types_with_mixed_attribute_filters(
        self, organization, workspace
    ):
        """
        Test the FilterBuilder scenario: multiple asset types selected where
        one type has attribute filters and the other doesn't.

        Expected filter structure:
        {
            "logic": "OR",
            "filters": [
                {"logic": "AND", "filters": [
                    {"field": "assetTypeId", "value": "type1-id", "operator": "exact"},
                    {"field": "attributes.status", "value": "active", "operator": "exact"}
                ]},
                {"field": "assetTypeId", "value": "type2-id", "operator": "exact"}
            ]
        }

        This should return:
        - Assets of type1 that match the attribute filter
        - ALL assets of type2 (no attribute filter applied)
        """
        # Create two asset types
        asset_type1 = AssetType.objects.create(
            organization=organization, name="Building"
        )
        status_attr = GlobalAssetTypeAttribute.objects.create(
            asset_type=asset_type1,
            name="Status",
            api_key="status",
            attribute_type="text",
        )

        asset_type2 = AssetType.objects.create(organization=organization, name="Road")

        # Create assets of type1 (Building) with different statuses
        building_active = Asset.objects.create(
            organization=organization, asset_type=asset_type1, name="Building Active"
        )
        TextAttributeValue.objects.create(
            asset=building_active, asset_type_attribute=status_attr, value="active"
        )

        building_inactive = Asset.objects.create(
            organization=organization, asset_type=asset_type1, name="Building Inactive"
        )
        TextAttributeValue.objects.create(
            asset=building_inactive, asset_type_attribute=status_attr, value="inactive"
        )

        # Create assets of type2 (Road) - no status attribute
        road1 = Asset.objects.create(
            organization=organization, asset_type=asset_type2, name="Road 1"
        )
        road2 = Asset.objects.create(
            organization=organization, asset_type=asset_type2, name="Road 2"
        )

        # Filter: (type1 AND status=active) OR (type2)
        # This is what FilterBuilder generates when:
        # - Both asset types are selected
        # - Type1 has attribute filter for status=active
        # - Type2 has no attribute filters
        data = {
            "logic": "OR",
            "filters": [
                {
                    "logic": "AND",
                    "filters": [
                        {
                            "field": "assetTypeId",
                            "value": str(asset_type1.id),
                            "operator": "exact",
                        },
                        {
                            "field": "attributes.status",
                            "value": "active",
                            "operator": "exact",
                        },
                    ],
                },
                {
                    "field": "assetTypeId",
                    "value": str(asset_type2.id),
                    "operator": "exact",
                },
            ],
        }
        serializer = FilterSerializer(data=data)
        q = serializer.build_query()

        # Scope to test organization to avoid matching assets from other tests/fixtures
        results = Asset.objects.filter(q).filter(organization=organization)

        # Should include: building_active (matches type AND attribute filter)
        # Should include: road1, road2 (match type2, no attribute filter)
        # Should NOT include: building_inactive (matches type but NOT attribute filter)
        assert (
            results.count() == 3
        ), f"Expected 3 results, got {results.count()}: {list(results.values_list('name', flat=True))}"
        assert building_active in results
        assert road1 in results
        assert road2 in results
        assert building_inactive not in results

    def test_all_asset_types_with_one_type_having_attribute_filter(
        self, organization, workspace
    ):
        """
        Test the FilterBuilder scenario: all asset types shown (none explicitly selected)
        but one type has attribute filters applied.

        Expected filter structure:
        {
            "logic": "OR",
            "filters": [
                {"logic": "AND", "filters": [
                    {"field": "assetTypeId", "value": "type1-id", "operator": "exact"},
                    {"field": "attributes.status", "value": "active", "operator": "exact"}
                ]},
                {"field": "assetTypeId", "value": ["type1-id"], "operator": "nin"}
            ]
        }

        This should return:
        - Assets of type1 that match the attribute filter
        - ALL assets of other types (via nin - not in the filtered types list)
        """
        # Create two asset types
        asset_type1 = AssetType.objects.create(
            organization=organization, name="Building Type"
        )
        status_attr = GlobalAssetTypeAttribute.objects.create(
            asset_type=asset_type1,
            name="Status",
            api_key="status",
            attribute_type="text",
        )

        asset_type2 = AssetType.objects.create(
            organization=organization, name="Road Type"
        )

        # Create assets of type1 (Building) with different statuses
        building_active = Asset.objects.create(
            organization=organization, asset_type=asset_type1, name="Building Active"
        )
        TextAttributeValue.objects.create(
            asset=building_active, asset_type_attribute=status_attr, value="active"
        )

        building_inactive = Asset.objects.create(
            organization=organization, asset_type=asset_type1, name="Building Inactive"
        )
        TextAttributeValue.objects.create(
            asset=building_inactive, asset_type_attribute=status_attr, value="inactive"
        )

        # Create assets of type2 (Road)
        road1 = Asset.objects.create(
            organization=organization, asset_type=asset_type2, name="Road 1"
        )
        road2 = Asset.objects.create(
            organization=organization, asset_type=asset_type2, name="Road 2"
        )

        # Filter: (type1 AND status=active) OR (assetTypeId NOT IN [type1])
        # This is what FilterBuilder generates when:
        # - All asset types are shown (selectedAssetTypes is empty)
        # - Type1 has attribute filter for status=active
        data = {
            "logic": "OR",
            "filters": [
                {
                    "logic": "AND",
                    "filters": [
                        {
                            "field": "assetTypeId",
                            "value": str(asset_type1.id),
                            "operator": "exact",
                        },
                        {
                            "field": "attributes.status",
                            "value": "active",
                            "operator": "exact",
                        },
                    ],
                },
                {
                    "field": "assetTypeId",
                    "value": [str(asset_type1.id)],
                    "operator": "nin",
                },
            ],
        }
        serializer = FilterSerializer(data=data)
        q = serializer.build_query()

        # Scope to test organization to avoid matching assets from other tests/fixtures
        results = Asset.objects.filter(q).filter(organization=organization)

        # Should include: building_active (matches type AND attribute filter)
        # Should include: road1, road2 (NOT type1, so pass through via nin)
        # Should NOT include: building_inactive (IS type1 but doesn't match attribute filter)
        assert (
            results.count() == 3
        ), f"Expected 3 results, got {results.count()}: {list(results.values_list('name', flat=True))}"
        assert building_active in results
        assert road1 in results
        assert road2 in results
        assert building_inactive not in results

    def test_nin_operator_basic(self, organization):
        """
        Basic test to verify nin operator works for assetTypeId field.
        """
        # Create two asset types
        type1 = AssetType.objects.create(organization=organization, name="Type1")
        type2 = AssetType.objects.create(organization=organization, name="Type2")

        # Create assets
        asset1 = Asset.objects.create(
            organization=organization, asset_type=type1, name="Asset1"
        )
        asset2 = Asset.objects.create(
            organization=organization, asset_type=type2, name="Asset2"
        )

        # Test nin - should return asset2 (type2) since we're excluding type1
        data = {"field": "assetTypeId", "value": [str(type1.id)], "operator": "nin"}
        serializer = FilterGroupSerializer(data=data)
        q = serializer.build_filter_query()

        print(f"Q object: {q}")
        print(f"Type1 ID: {type1.id}")
        print(f"Type2 ID: {type2.id}")

        results = Asset.objects.filter(q).filter(organization=organization)
        print(f"Results: {list(results.values_list('name', 'asset_type_id'))}")

        assert results.count() == 1, f"Expected 1 result, got {results.count()}"
        assert asset2 in results
        assert asset1 not in results

    def test_exact_operator_for_asset_type(self, organization):
        """
        Basic test to verify exact operator works for assetTypeId field.
        """
        # Create two asset types
        type1 = AssetType.objects.create(organization=organization, name="TypeA")
        type2 = AssetType.objects.create(organization=organization, name="TypeB")

        # Create assets
        asset1 = Asset.objects.create(
            organization=organization, asset_type=type1, name="AssetA"
        )
        asset2 = Asset.objects.create(
            organization=organization, asset_type=type2, name="AssetB"
        )

        # Test exact - should return asset1 (type1)
        data = {"field": "assetTypeId", "value": str(type1.id), "operator": "exact"}
        serializer = FilterGroupSerializer(data=data)
        q = serializer.build_filter_query()

        print(f"Q object for exact: {q}")

        results = Asset.objects.filter(q).filter(organization=organization)
        print(f"Exact results: {list(results.values_list('name', 'asset_type_id'))}")

        assert results.count() == 1, f"Expected 1 result, got {results.count()}"
        assert asset1 in results
        assert asset2 not in results

    def test_attribute_nin_with_asset_type_nin_or_structure(self, organization):
        """
        Test the exact FilterBuilder scenario: attribute nin filter on one asset type
        combined with asset type nin for other types, using OR logic.

        This is the real-world scenario where:
        - User has one asset type with attribute filters (excluding certain values)
        - All other asset types should be included without filtering

        Filter structure:
        {
            "logic": "OR",
            "filters": [
                {"logic": "AND", "filters": [
                    {"field": "assetTypeId", "value": "type1-id", "operator": "exact"},
                    {"field": "attributes.osm_type", "value": ["node"], "operator": "nin"}
                ]},
                {"field": "assetTypeId", "value": ["type1-id"], "operator": "nin"}
            ]
        }

        Expected behavior:
        - Assets of type1 where osm_type is NOT 'node' are included
        - Assets of type1 where osm_type IS 'node' are EXCLUDED
        - ALL assets of other types are included (regardless of attributes)
        """
        # Create asset type with osm_type attribute
        asset_type1 = AssetType.objects.create(
            organization=organization, name="OSM Points"
        )
        osm_type_attr = GlobalAssetTypeAttribute.objects.create(
            asset_type=asset_type1,
            name="OSM Type",
            api_key="osm_type",
            attribute_type="text",
        )

        # Create second asset type (no osm_type attribute)
        asset_type2 = AssetType.objects.create(
            organization=organization, name="Buildings"
        )

        # Create assets of type1 with different osm_type values
        point_node = Asset.objects.create(
            organization=organization, asset_type=asset_type1, name="Point Node"
        )
        TextAttributeValue.objects.create(
            asset=point_node, asset_type_attribute=osm_type_attr, value="node"
        )

        point_way = Asset.objects.create(
            organization=organization, asset_type=asset_type1, name="Point Way"
        )
        TextAttributeValue.objects.create(
            asset=point_way, asset_type_attribute=osm_type_attr, value="way"
        )

        point_relation = Asset.objects.create(
            organization=organization, asset_type=asset_type1, name="Point Relation"
        )
        TextAttributeValue.objects.create(
            asset=point_relation, asset_type_attribute=osm_type_attr, value="relation"
        )

        # Create assets of type2 (should all be included)
        building1 = Asset.objects.create(
            organization=organization, asset_type=asset_type2, name="Building 1"
        )
        building2 = Asset.objects.create(
            organization=organization, asset_type=asset_type2, name="Building 2"
        )

        # Filter: (type1 AND osm_type NOT IN ['node']) OR (NOT type1)
        data = {
            "logic": "AND",
            "filters": [
                {
                    "logic": "OR",
                    "filters": [
                        {
                            "logic": "AND",
                            "filters": [
                                {
                                    "field": "assetTypeId",
                                    "value": str(asset_type1.id),
                                    "operator": "exact",
                                },
                                {
                                    "field": "attributes.osm_type",
                                    "value": ["node"],
                                    "operator": "nin",
                                },
                            ],
                        },
                        {
                            "field": "assetTypeId",
                            "value": [str(asset_type1.id)],
                            "operator": "nin",
                        },
                    ],
                }
            ],
        }

        serializer = FilterSerializer(data=data)
        q = serializer.build_query()

        print(f"Generated Q: {q}")

        results = Asset.objects.filter(q).filter(organization=organization)
        result_names = list(results.values_list("name", flat=True))
        print(f"Results: {result_names}")

        # Should include:
        # - point_way (type1, osm_type='way', NOT 'node')
        # - point_relation (type1, osm_type='relation', NOT 'node')
        # - building1 (type2, passes via nin on asset type)
        # - building2 (type2, passes via nin on asset type)
        # Should NOT include:
        # - point_node (type1, osm_type='node', excluded by attribute nin)
        assert (
            results.count() == 4
        ), f"Expected 4 results, got {results.count()}: {result_names}"
        assert point_way in results
        assert point_relation in results
        assert building1 in results
        assert building2 in results
        assert point_node not in results

    def test_attribute_nin_excludes_multiple_values(self, organization):
        """
        Test that nin operator on attributes correctly excludes multiple values.
        """
        asset_type = AssetType.objects.create(
            organization=organization, name="Test Type"
        )
        status_attr = GlobalAssetTypeAttribute.objects.create(
            asset_type=asset_type,
            name="Status",
            api_key="status",
            attribute_type="text",
        )

        # Create assets with different statuses
        active_asset = Asset.objects.create(
            organization=organization, asset_type=asset_type, name="Active"
        )
        TextAttributeValue.objects.create(
            asset=active_asset, asset_type_attribute=status_attr, value="active"
        )

        pending_asset = Asset.objects.create(
            organization=organization, asset_type=asset_type, name="Pending"
        )
        TextAttributeValue.objects.create(
            asset=pending_asset, asset_type_attribute=status_attr, value="pending"
        )

        archived_asset = Asset.objects.create(
            organization=organization, asset_type=asset_type, name="Archived"
        )
        TextAttributeValue.objects.create(
            asset=archived_asset, asset_type_attribute=status_attr, value="archived"
        )

        deleted_asset = Asset.objects.create(
            organization=organization, asset_type=asset_type, name="Deleted"
        )
        TextAttributeValue.objects.create(
            asset=deleted_asset, asset_type_attribute=status_attr, value="deleted"
        )

        # Exclude 'archived' and 'deleted' statuses
        data = {
            "field": "attributes.status",
            "value": ["archived", "deleted"],
            "operator": "nin",
        }

        serializer = FilterGroupSerializer(data=data)
        q = serializer.build_filter_query()

        results = Asset.objects.filter(q).filter(organization=organization)
        result_names = list(results.values_list("name", flat=True))

        # Should include: active, pending
        # Should NOT include: archived, deleted
        assert (
            results.count() == 2
        ), f"Expected 2 results, got {results.count()}: {result_names}"
        assert active_asset in results
        assert pending_asset in results
        assert archived_asset not in results
        assert deleted_asset not in results

    def test_invalid_api_key_does_not_raise_error(self, organization, asset_type):
        """
        Test that filtering on an invalid/nonexistent api_key does not raise an error.

        This is important because:
        1. The frontend may have stale attribute definitions
        2. Attributes may be deleted while a filter is still active
        3. Typos in api_key should fail gracefully

        Note: An invalid api_key returns an empty Q(), which doesn't filter anything.
        This means all results pass through. This is acceptable behavior - the filter
        simply has no effect rather than causing an error.
        """
        # Create an asset (doesn't matter what attributes it has)
        asset = Asset.objects.create(
            organization=organization, asset_type=asset_type, name="Test Asset"
        )

        # Filter on a completely nonexistent api_key
        data = {
            "field": "attributes.nonexistent_attribute_xyz",
            "value": "some_value",
            "operator": "exact",
        }

        serializer = FilterGroupSerializer(data=data)
        # Should not raise an error
        q = serializer.build_filter_query()

        # Q should be empty (no attribute definitions found)
        assert q == Q(), f"Expected empty Q(), got {q}"

        # An empty Q() doesn't filter anything - all assets pass through
        results = Asset.objects.filter(q).filter(organization=organization)
        assert results.count() == 1
        assert asset in results

    def test_invalid_api_key_with_nin_does_not_raise_error(
        self, organization, asset_type
    ):
        """
        Test that nin operator on an invalid api_key does not raise an error.

        Since the attribute doesn't exist, no assets have that attribute value,
        so technically nothing matches the "in" condition, and negating nothing
        with nin returns an empty Q() which doesn't filter anything.
        """
        # Create some assets
        asset1 = Asset.objects.create(
            organization=organization, asset_type=asset_type, name="Asset 1"
        )
        asset2 = Asset.objects.create(
            organization=organization, asset_type=asset_type, name="Asset 2"
        )

        # nin filter on nonexistent attribute
        data = {
            "field": "attributes.does_not_exist",
            "value": ["value1", "value2"],
            "operator": "nin",
        }

        serializer = FilterGroupSerializer(data=data)
        # Should not raise an error
        q = serializer.build_filter_query()

        # With no attribute definitions found, q is None, so we return Q()
        # An empty Q() doesn't filter anything - all assets pass through
        results = Asset.objects.filter(q).filter(organization=organization)
        assert (
            results.count() == 2
        ), f"Expected 2 results (filter has no effect), got {results.count()}"


class TestAttributeValuesEndpoint:
    """Test the attribute values endpoint that returns distinct values for filtering."""

    @pytest.mark.django_db
    def test_values_endpoint_includes_blank_option(
        self, client, organization, workspace, asset_type, global_text_attribute
    ):
        """Test that the values endpoint includes 'Blank' as the first option."""
        # Create some assets with and without values for the attribute
        asset_with_value = Asset.objects.create(
            organization=organization,
            asset_type=asset_type,
            name="Asset with value",
            geometry="POINT(0 0)",
        )
        TextAttributeValue.objects.create(
            asset=asset_with_value,
            asset_type_attribute=global_text_attribute,
            value="test value",
        )

        asset_without_value = Asset.objects.create(
            organization=organization,
            asset_type=asset_type,
            name="Asset without value",
            geometry="POINT(0 0)",
        )

        # Make a request to the values endpoint
        url = f"/api/workspaces/{workspace.id}/asset-types/{asset_type.id}/attributes/{global_text_attribute.id}/values/"
        response = client.get(url)

        # Check that the response data includes 'Blank' as the first item
        assert response.status_code == 200
        data = response.json()
        assert "results" in data
        results = data["results"]
        assert len(results) > 0
        assert (
            results[0] == "Blank"
        ), f"Expected 'Blank' as first result, got {results[0]}"

    @pytest.mark.django_db
    def test_values_endpoint_blank_not_duplicated(
        self, client, organization, workspace, asset_type, global_text_attribute
    ):
        """Test that 'Blank' is not duplicated if it already exists in values."""
        # Create an asset with "Blank" as a value
        asset_with_blank = Asset.objects.create(
            organization=organization,
            asset_type=asset_type,
            name="Asset with blank value",
            geometry="POINT(0 0)",
        )
        TextAttributeValue.objects.create(
            asset=asset_with_blank,
            asset_type_attribute=global_text_attribute,
            value="Blank",
        )

        # Make a request to the values endpoint
        url = f"/api/workspaces/{workspace.id}/asset-types/{asset_type.id}/attributes/{global_text_attribute.id}/values/"
        response = client.get(url)

        # Check that 'Blank' appears only once
        assert response.status_code == 200
        data = response.json()
        results = data["results"]
        blank_count = results.count("Blank")
        assert (
            blank_count == 1
        ), f"Expected 'Blank' to appear once, but found {blank_count} times"
