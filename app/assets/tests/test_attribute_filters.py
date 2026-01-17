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

from assets.models.attribute_value import WorkspaceAttributeValueOverride
from assets.filter_serializers import FilterSerializer, FilterGroupSerializer
from assets.models import (
    AssetType,
    Asset,
    GlobalAssetTypeAttribute,
    WorkspaceLocalAssetTypeAttribute,
    TextAttributeValue,
    NumberAttributeValue,
    BooleanAttributeValue,
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

    def test_workspace_overrides_global_attribute_filter(
        self, organization, asset_type, workspace, workspace_local_attribute
    ):
        # Test that an attribute value defined in the workspace overrides the global one
        global_attr = GlobalAssetTypeAttribute.objects.create(
            asset_type=asset_type,
            name="Status",
            api_key="status",
            attribute_type="text",
        )

        asset1 = Asset.objects.create(
            organization=organization, asset_type=asset_type, name="Asset 1"
        )
        global_value = TextAttributeValue.objects.create(
            asset=asset1, asset_type_attribute=global_attr, value="global_value"
        )
        local_attribute_value = TextAttributeValue.objects.create(
            asset=asset1,
            asset_type_attribute=global_attr,
            value="local_value",
        )

        # Create a workspace-local attribute value pointing at the global attribute
        WorkspaceAttributeValueOverride.objects.create(
            asset_type_attribute=global_attr,
            base_value=global_value,
            override_value=local_attribute_value,
            workspace=workspace,
        )

        # Filter for local_value should find the asset
        data = {
            "field": "attributes.status",
            "value": "local_value",
            "operator": "exact",
        }

        serializer = FilterGroupSerializer(data=data, context={"workspace": workspace})
        q = serializer.build_filter_query()
        results = Asset.objects.filter(q)
        assert results.count() == 1
        assert results.first() == asset1

        # Test that if we're in the workspace but filter for global_value, we get no results
        serializer_global = FilterGroupSerializer(
            data=data, context={"workspace": workspace}
        )
        q_global = serializer_global.build_filter_query()
        results_global = Asset.objects.filter(q_global)
        assert results_global.count() == 0

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

    def test_nin_with_multiple_attribute_definitions_same_api_key(
        self, organization, workspace
    ):
        """
        Test that nin operator works correctly when multiple attribute definitions
        have the same api_key (e.g., global and workspace-local attributes).

        Bug context: When there are multiple attribute definitions with the same api_key,
        the filter serializer was incorrectly OR-ing the negated conditions together:
        NOT(has value in attr1) OR NOT(has value in attr2)

        This is wrong because:
        - NOT(A) OR NOT(B) = NOT(A AND B)
        - This means "NOT (has value in BOTH attr1 AND attr2)"
        - But we want "NOT (has value in attr1 OR attr2)" = NOT(A OR B) = NOT(A) AND NOT(B)

        For nin filters, the correct behavior is to AND the negated conditions:
        NOT(has value in attr1) AND NOT(has value in attr2)

        This ensures an asset is excluded if it has the excluded value in ANY of the
        matching attribute definitions.
        """
        # Create two asset types that both have a "status" attribute
        asset_type1 = AssetType.objects.create(
            organization=organization, name="Type1 with status"
        )
        status_attr1 = GlobalAssetTypeAttribute.objects.create(
            asset_type=asset_type1,
            name="Status",
            api_key="status",
            attribute_type="text",
        )

        asset_type2 = AssetType.objects.create(
            organization=organization, name="Type2 with status"
        )
        status_attr2 = GlobalAssetTypeAttribute.objects.create(
            asset_type=asset_type2,
            name="Status",
            api_key="status",
            attribute_type="text",
        )

        # Create assets of type1 with different statuses
        type1_active = Asset.objects.create(
            organization=organization, asset_type=asset_type1, name="Type1 Active"
        )
        TextAttributeValue.objects.create(
            asset=type1_active, asset_type_attribute=status_attr1, value="active"
        )

        type1_inactive = Asset.objects.create(
            organization=organization, asset_type=asset_type1, name="Type1 Inactive"
        )
        TextAttributeValue.objects.create(
            asset=type1_inactive, asset_type_attribute=status_attr1, value="inactive"
        )

        # Create assets of type2 with different statuses
        type2_active = Asset.objects.create(
            organization=organization, asset_type=asset_type2, name="Type2 Active"
        )
        TextAttributeValue.objects.create(
            asset=type2_active, asset_type_attribute=status_attr2, value="active"
        )

        type2_inactive = Asset.objects.create(
            organization=organization, asset_type=asset_type2, name="Type2 Inactive"
        )
        TextAttributeValue.objects.create(
            asset=type2_inactive, asset_type_attribute=status_attr2, value="inactive"
        )

        # Filter: exclude assets where status = "inactive"
        # This should use the "status" api_key which matches BOTH attr1 and attr2
        data = {
            "field": "attributes.status",
            "value": ["inactive"],
            "operator": "nin",
        }

        serializer = FilterGroupSerializer(data=data)
        q = serializer.build_filter_query()

        print(f"Generated Q for nin with multiple attrs: {q}")

        results = Asset.objects.filter(q).filter(organization=organization)
        result_names = list(results.values_list("name", flat=True))
        print(f"Results: {result_names}")

        # Should include: type1_active, type2_active (status is "active", not "inactive")
        # Should NOT include: type1_inactive, type2_inactive (status is "inactive")
        assert (
            results.count() == 2
        ), f"Expected 2 results, got {results.count()}: {result_names}"
        assert type1_active in results
        assert type2_active in results
        assert type1_inactive not in results
        assert type2_inactive not in results

    def test_choice_attribute_filter(self, organization):
        """
        Test that filtering by choice attribute values works correctly.

        Choice attributes store values via ChoiceAttributeValue -> AssetTypeAttributeChoice,
        not directly in TextAttributeValue, NumberAttributeValue, etc.

        The filter serializer must use CHOICE_LOOKUP_MAP when the attribute has choices.
        """
        from assets.models import (
            ChoiceAttributeValue,
            TextAttributeChoice,
        )

        # Create asset type with a text attribute that HAS CHOICES
        asset_type = AssetType.objects.create(
            organization=organization, name="Type with choices"
        )
        status_attr = GlobalAssetTypeAttribute.objects.create(
            asset_type=asset_type,
            name="Status",
            api_key="status",
            attribute_type="text",
        )

        # Create choices for the attribute
        choice_active = TextAttributeChoice.objects.create(
            asset_type_attribute=status_attr,
            value="Active",
            order=0,
        )
        choice_inactive = TextAttributeChoice.objects.create(
            asset_type_attribute=status_attr,
            value="Inactive",
            order=1,
        )
        choice_pending = TextAttributeChoice.objects.create(
            asset_type_attribute=status_attr,
            value="Pending",
            order=2,
        )

        # Create assets with choice values
        asset_active = Asset.objects.create(
            organization=organization, asset_type=asset_type, name="Active Asset"
        )
        ChoiceAttributeValue.objects.create(
            asset=asset_active, asset_type_attribute=status_attr, choice=choice_active
        )

        asset_inactive = Asset.objects.create(
            organization=organization, asset_type=asset_type, name="Inactive Asset"
        )
        ChoiceAttributeValue.objects.create(
            asset=asset_inactive,
            asset_type_attribute=status_attr,
            choice=choice_inactive,
        )

        asset_pending = Asset.objects.create(
            organization=organization, asset_type=asset_type, name="Pending Asset"
        )
        ChoiceAttributeValue.objects.create(
            asset=asset_pending, asset_type_attribute=status_attr, choice=choice_pending
        )

        # Clear the cache to ensure we get fresh attribute definitions with has_choices
        from django.core.cache import cache

        cache.clear()

        # Test 1: Filter for exact value "Active"
        data = {
            "field": "attributes.status",
            "value": "Active",
            "operator": "exact",
        }
        serializer = FilterGroupSerializer(data=data)
        q = serializer.build_filter_query()

        results = Asset.objects.filter(q).filter(organization=organization)
        result_names = list(results.values_list("name", flat=True))
        print(f"Exact filter results: {result_names}")

        assert (
            results.count() == 1
        ), f"Expected 1 result for exact 'Active', got {results.count()}: {result_names}"
        assert asset_active in results

        # Test 2: Filter to exclude "Inactive" (nin operator)
        data = {
            "field": "attributes.status",
            "value": ["Inactive"],
            "operator": "nin",
        }
        serializer = FilterGroupSerializer(data=data)
        q = serializer.build_filter_query()

        results = Asset.objects.filter(q).filter(organization=organization)
        result_names = list(results.values_list("name", flat=True))
        print(f"Nin filter results: {result_names}")

        # Should include: Active, Pending (not Inactive)
        assert (
            results.count() == 2
        ), f"Expected 2 results for nin 'Inactive', got {results.count()}: {result_names}"
        assert asset_active in results
        assert asset_pending in results
        assert asset_inactive not in results

        # Test 3: Filter with "in" operator for multiple values
        data = {
            "field": "attributes.status",
            "value": ["Active", "Pending"],
            "operator": "in",
        }
        serializer = FilterGroupSerializer(data=data)
        q = serializer.build_filter_query()

        results = Asset.objects.filter(q).filter(organization=organization)
        result_names = list(results.values_list("name", flat=True))
        print(f"In filter results: {result_names}")

        # Should include: Active, Pending
        assert (
            results.count() == 2
        ), f"Expected 2 results for in ['Active', 'Pending'], got {results.count()}: {result_names}"
        assert asset_active in results
        assert asset_pending in results
        assert asset_inactive not in results

    def test_choice_attribute_filter_with_single_value_in_operator(self, organization):
        """
        Test that filtering by a single choice value using 'in' operator works.

        This is the scenario the user reported: They see an asset using a particular
        choice on a text attribute, but it isn't returned when filtering to only that value.

        The frontend typically sends: {"field": "attributes.foo", "value": ["ChoiceValue"], "operator": "in"}
        """
        from assets.models import (
            ChoiceAttributeValue,
            TextAttributeChoice,
        )

        # Create asset type with a text attribute that HAS CHOICES
        asset_type = AssetType.objects.create(
            organization=organization, name="Type with text choices"
        )
        category_attr = GlobalAssetTypeAttribute.objects.create(
            asset_type=asset_type,
            name="Category",
            api_key="category",
            attribute_type="text",
        )

        # Create a choice for the attribute
        choice_residential = TextAttributeChoice.objects.create(
            asset_type_attribute=category_attr,
            value="Residential",
            order=0,
        )
        choice_commercial = TextAttributeChoice.objects.create(
            asset_type_attribute=category_attr,
            value="Commercial",
            order=1,
        )

        # Create an asset with the "Residential" choice
        asset_with_choice = Asset.objects.create(
            organization=organization,
            asset_type=asset_type,
            name="Residential Building",
        )
        ChoiceAttributeValue.objects.create(
            asset=asset_with_choice,
            asset_type_attribute=category_attr,
            choice=choice_residential,
        )

        # Create another asset with a different choice
        asset_commercial = Asset.objects.create(
            organization=organization, asset_type=asset_type, name="Commercial Building"
        )
        ChoiceAttributeValue.objects.create(
            asset=asset_commercial,
            asset_type_attribute=category_attr,
            choice=choice_commercial,
        )

        # Clear the cache to ensure we get fresh attribute definitions with has_choices
        from django.core.cache import cache

        cache.clear()

        # This is what the frontend sends when the user selects just "Residential"
        data = {
            "field": "attributes.category",
            "value": ["Residential"],
            "operator": "in",
        }
        serializer = FilterGroupSerializer(data=data)
        q = serializer.build_filter_query()

        print(f"Generated Q object: {q}")

        results = Asset.objects.filter(q).filter(organization=organization)
        result_names = list(results.values_list("name", flat=True))
        print(f"Filter results: {result_names}")

        # Should find the asset with "Residential" choice
        assert (
            results.count() == 1
        ), f"Expected 1 result for in ['Residential'], got {results.count()}: {result_names}"
        assert asset_with_choice in results
        assert asset_commercial not in results

    def test_choice_attribute_filter_debug_query_path(self, organization):
        """
        Debug test to verify the query path for choice attributes.
        This test prints the actual SQL to help diagnose issues.
        """
        from assets.models import (
            ChoiceAttributeValue,
            TextAttributeChoice,
        )
        from assets.filter_serializers import get_attributes_by_api_key

        # Create asset type with a text attribute that HAS CHOICES
        asset_type = AssetType.objects.create(
            organization=organization, name="Debug Type"
        )
        status_attr = GlobalAssetTypeAttribute.objects.create(
            asset_type=asset_type,
            name="Debug Status",
            api_key="debug_status",
            attribute_type="text",
        )

        # Create a choice
        choice_active = TextAttributeChoice.objects.create(
            asset_type_attribute=status_attr,
            value="DebugActive",
            order=0,
        )

        # Create an asset with the choice
        asset = Asset.objects.create(
            organization=organization, asset_type=asset_type, name="Debug Asset"
        )
        cv = ChoiceAttributeValue.objects.create(
            asset=asset, asset_type_attribute=status_attr, choice=choice_active
        )

        # Clear the cache
        from django.core.cache import cache

        cache.clear()

        # Get attribute definitions
        attrs = get_attributes_by_api_key("debug_status")
        print(f"Attribute definitions: {attrs}")

        for attr in attrs:
            print(
                f"  Attr ID: {attr['id']}, Type: {attr['attribute_type']}, Has Choices: {attr.get('has_choices', 'N/A')}"
            )

        # Build filter
        data = {
            "field": "attributes.debug_status",
            "value": "DebugActive",
            "operator": "exact",
        }
        serializer = FilterGroupSerializer(data=data)
        q = serializer.build_filter_query()

        print(f"Generated Q: {q}")

        # Get the SQL
        qs = Asset.objects.filter(q)
        print(f"SQL Query: {qs.query}")

        results = qs.filter(organization=organization)
        result_names = list(results.values_list("name", flat=True))
        print(f"Results: {result_names}")

        assert (
            results.count() == 1
        ), f"Expected 1 result, got {results.count()}: {result_names}"
        assert asset in results

    def test_choice_attribute_filter_with_stale_cache(self, organization):
        """
        Test that choice attribute filtering fails when the cache has stale data.

        This tests the scenario where:
        1. An attribute was created without choices (cached without has_choices)
        2. Later, choices were added to the attribute
        3. An asset is created using a choice value
        4. Filtering fails because the cache says has_choices=False

        This is likely the bug the user is experiencing.
        """
        from assets.models import (
            ChoiceAttributeValue,
            TextAttributeChoice,
        )
        from assets.filter_serializers import get_attributes_by_api_key

        # Create asset type with a text attribute (NO CHOICES YET)
        asset_type = AssetType.objects.create(
            organization=organization, name="Stale Cache Type"
        )
        status_attr = GlobalAssetTypeAttribute.objects.create(
            asset_type=asset_type,
            name="Status",
            api_key="stale_status",
            attribute_type="text",
        )

        # Clear the cache and then query to populate it WITHOUT has_choices
        from django.core.cache import cache

        cache.clear()

        # This caches the attribute WITHOUT has_choices=True (because no choices exist yet)
        attrs_before = get_attributes_by_api_key("stale_status")
        print(f"Attrs BEFORE adding choices: {attrs_before}")
        assert (
            attrs_before[0].get("has_choices") == False
        ), "Should be False since no choices exist"

        # NOW add choices to the attribute (simulating a later modification)
        choice_active = TextAttributeChoice.objects.create(
            asset_type_attribute=status_attr,
            value="Active",
            order=0,
        )

        # Create an asset with the choice
        asset = Asset.objects.create(
            organization=organization, asset_type=asset_type, name="Stale Cache Asset"
        )
        ChoiceAttributeValue.objects.create(
            asset=asset, asset_type_attribute=status_attr, choice=choice_active
        )

        # DON'T clear the cache - this simulates the bug where cache is stale
        # The cache still thinks has_choices=False

        # Now try to filter - this SHOULD fail because the cache is stale
        data = {
            "field": "attributes.stale_status",
            "value": "Active",
            "operator": "exact",
        }
        serializer = FilterGroupSerializer(data=data)
        q = serializer.build_filter_query()

        print(f"Generated Q with stale cache: {q}")

        # The stale cache should cause this to use the wrong lookup path
        # (textattributevalue__value instead of choiceattributevalue__choice__textattributechoice__value)
        results = Asset.objects.filter(q).filter(organization=organization)
        result_names = list(results.values_list("name", flat=True))
        print(f"Results with stale cache: {result_names}")

        # This assertion documents the BUG - with stale cache, filtering fails
        # Comment: We expect 0 results because the query uses the wrong path
        # The actual values are stored in ChoiceAttributeValue, not TextAttributeValue
        assert results.count() == 0, (
            f"Expected 0 results with stale cache (BUG), got {results.count()}: {result_names}. "
            "If this passes with 1 result, the cache was properly refreshed."
        )

        # NOW clear the cache and retry - should work
        cache.clear()
        attrs_after = get_attributes_by_api_key("stale_status")
        print(f"Attrs AFTER cache clear: {attrs_after}")
        assert (
            attrs_after[0].get("has_choices") == True
        ), "Should be True since choices exist now"

        # Build filter again with fresh cache
        serializer = FilterGroupSerializer(data=data)
        q = serializer.build_filter_query()
        print(f"Generated Q with fresh cache: {q}")

        results = Asset.objects.filter(q).filter(organization=organization)
        result_names = list(results.values_list("name", flat=True))
        print(f"Results with fresh cache: {result_names}")

        # With fresh cache, should work
        assert (
            results.count() == 1
        ), f"Expected 1 result with fresh cache, got {results.count()}: {result_names}"
        assert asset in results

    def test_choice_attribute_nin_null_excludes_asset_without_choice(
        self, organization
    ):
        """
        User scenario: Two assets - one with a choice attribute set, one without.
        Filter: nin [null] to exclude assets without a value.
        Expected: Only the asset WITH the choice should be returned.
        """
        from assets.models import (
            ChoiceAttributeValue,
            TextAttributeChoice,
        )

        # Create asset type with a text attribute that HAS CHOICES
        asset_type = AssetType.objects.create(
            organization=organization, name="Type for nin null test"
        )
        lk_attr = GlobalAssetTypeAttribute.objects.create(
            asset_type=asset_type,
            name="LK",
            api_key="lk",
            attribute_type="text",
        )

        # Create a choice for the attribute
        choice_a = TextAttributeChoice.objects.create(
            asset_type_attribute=lk_attr,
            value="Choice A",
            order=0,
        )

        # Asset 1: HAS a choice value set
        asset_with_choice = Asset.objects.create(
            organization=organization, asset_type=asset_type, name="Asset WITH choice"
        )
        ChoiceAttributeValue.objects.create(
            asset=asset_with_choice, asset_type_attribute=lk_attr, choice=choice_a
        )

        # Asset 2: Does NOT have any value for the attribute (null)
        asset_without_value = Asset.objects.create(
            organization=organization,
            asset_type=asset_type,
            name="Asset WITHOUT choice",
        )

        # Clear the cache to get fresh attribute definitions
        from django.core.cache import cache

        cache.clear()

        # Filter: exclude null - should return only assets that HAVE a value
        data = {
            "field": "attributes.lk",
            "value": [None],
            "operator": "nin",
        }
        serializer = FilterGroupSerializer(data=data)
        q = serializer.build_filter_query()

        print(f"Generated Q for nin [null]: {q}")

        results = Asset.objects.filter(q).filter(organization=organization)
        result_names = list(results.values_list("name", flat=True))
        print(f"Results: {result_names}")

        # Should include only the asset WITH a choice value
        # Should exclude the asset WITHOUT a value (null)
        assert (
            results.count() == 1
        ), f"Expected 1 result (asset with choice), got {results.count()}: {result_names}"
        assert asset_with_choice in results
        assert asset_without_value not in results

    def test_choice_attribute_nin_excludes_specific_value(self, organization):
        """
        Test filtering choice attributes with nin to exclude specific values.

        Scenario: User wants to see all assets EXCEPT those with "Choice B"
        Filter: {"field": "attributes.lk", "value": ["Choice B"], "operator": "nin"}
        """
        from assets.models import (
            ChoiceAttributeValue,
            TextAttributeChoice,
        )

        # Create asset type with a text attribute that HAS CHOICES
        asset_type = AssetType.objects.create(
            organization=organization, name="Type for nin value test"
        )
        lk_attr = GlobalAssetTypeAttribute.objects.create(
            asset_type=asset_type,
            name="LK",
            api_key="lk_test",
            attribute_type="text",
        )

        # Create choices for the attribute
        choice_a = TextAttributeChoice.objects.create(
            asset_type_attribute=lk_attr,
            value="Choice A",
            order=0,
        )
        choice_b = TextAttributeChoice.objects.create(
            asset_type_attribute=lk_attr,
            value="Choice B",
            order=1,
        )

        # Create asset with Choice A
        asset_a = Asset.objects.create(
            organization=organization, asset_type=asset_type, name="Asset with Choice A"
        )
        ChoiceAttributeValue.objects.create(
            asset=asset_a, asset_type_attribute=lk_attr, choice=choice_a
        )

        # Create asset with Choice B
        asset_b = Asset.objects.create(
            organization=organization, asset_type=asset_type, name="Asset with Choice B"
        )
        ChoiceAttributeValue.objects.create(
            asset=asset_b, asset_type_attribute=lk_attr, choice=choice_b
        )

        # Create asset without any value
        asset_none = Asset.objects.create(
            organization=organization, asset_type=asset_type, name="Asset without value"
        )

        # Clear the cache
        from django.core.cache import cache

        cache.clear()

        # Exclude "Choice B" - should return asset_a and asset_none
        data = {
            "field": "attributes.lk_test",
            "value": ["Choice B"],
            "operator": "nin",
        }
        serializer = FilterGroupSerializer(data=data)
        q = serializer.build_filter_query()

        print(f"Generated Q for nin ['Choice B']: {q}")

        results = Asset.objects.filter(q).filter(organization=organization)
        result_names = list(results.values_list("name", flat=True))
        print(f"Results: {result_names}")

        # Should include asset_a (has Choice A, not Choice B)
        # Should include asset_none (has no value, not Choice B)
        # Should exclude asset_b (has Choice B)
        assert (
            results.count() == 2
        ), f"Expected 2 results, got {results.count()}: {result_names}"
        assert asset_a in results
        assert asset_none in results
        assert asset_b not in results

    def test_choice_attribute_in_selects_specific_value(self, organization):
        """
        Test filtering choice attributes with 'in' to include specific values.

        Scenario: User wants to see ONLY assets with "Choice A"
        Filter: {"field": "attributes.lk", "value": ["Choice A"], "operator": "in"}
        """
        from assets.models import (
            ChoiceAttributeValue,
            TextAttributeChoice,
        )

        # Create asset type with a text attribute that HAS CHOICES
        asset_type = AssetType.objects.create(
            organization=organization, name="Type for in value test"
        )
        lk_attr = GlobalAssetTypeAttribute.objects.create(
            asset_type=asset_type,
            name="LK",
            api_key="lk_in_test",
            attribute_type="text",
        )

        # Create choices for the attribute
        choice_a = TextAttributeChoice.objects.create(
            asset_type_attribute=lk_attr,
            value="Choice A",
            order=0,
        )
        choice_b = TextAttributeChoice.objects.create(
            asset_type_attribute=lk_attr,
            value="Choice B",
            order=1,
        )

        # Create asset with Choice A
        asset_a = Asset.objects.create(
            organization=organization, asset_type=asset_type, name="Asset with Choice A"
        )
        ChoiceAttributeValue.objects.create(
            asset=asset_a, asset_type_attribute=lk_attr, choice=choice_a
        )

        # Create asset with Choice B
        asset_b = Asset.objects.create(
            organization=organization, asset_type=asset_type, name="Asset with Choice B"
        )
        ChoiceAttributeValue.objects.create(
            asset=asset_b, asset_type_attribute=lk_attr, choice=choice_b
        )

        # Create asset without any value
        asset_none = Asset.objects.create(
            organization=organization, asset_type=asset_type, name="Asset without value"
        )

        # Clear the cache
        from django.core.cache import cache

        cache.clear()

        # Select only "Choice A"
        data = {
            "field": "attributes.lk_in_test",
            "value": ["Choice A"],
            "operator": "in",
        }
        serializer = FilterGroupSerializer(data=data)
        q = serializer.build_filter_query()

        print(f"Generated Q for in ['Choice A']: {q}")

        results = Asset.objects.filter(q).filter(organization=organization)
        result_names = list(results.values_list("name", flat=True))
        print(f"Results: {result_names}")

        # Should include ONLY asset_a (has Choice A)
        assert (
            results.count() == 1
        ), f"Expected 1 result, got {results.count()}: {result_names}"
        assert asset_a in results
        assert asset_b not in results
        assert asset_none not in results

    def test_workspace_local_choice_attribute_filter(self, organization, workspace):
        """
        Test filtering by choice on a WorkspaceLocalAssetTypeAttribute.

        This tests the scenario where the user has a workspace-local attribute
        with choices, and filtering by choice value should work correctly.
        """
        from assets.models import (
            ChoiceAttributeValue,
            TextAttributeChoice,
        )

        # Create asset type
        asset_type = AssetType.objects.create(
            organization=organization, name="Type for local attr test"
        )

        # Create a WORKSPACE LOCAL attribute with choices
        local_attr = WorkspaceLocalAssetTypeAttribute.objects.create(
            asset_type=asset_type,
            workspace=workspace,
            name="Local Status",
            api_key="local_status",
            attribute_type="text",
        )

        # Create choices for the local attribute
        choice_active = TextAttributeChoice.objects.create(
            asset_type_attribute=local_attr,
            value="Active",
            order=0,
        )
        choice_inactive = TextAttributeChoice.objects.create(
            asset_type_attribute=local_attr,
            value="Inactive",
            order=1,
        )

        # Create assets with different choices
        asset_active = Asset.objects.create(
            organization=organization, asset_type=asset_type, name="Active Local Asset"
        )
        ChoiceAttributeValue.objects.create(
            asset=asset_active, asset_type_attribute=local_attr, choice=choice_active
        )

        asset_inactive = Asset.objects.create(
            organization=organization,
            asset_type=asset_type,
            name="Inactive Local Asset",
        )
        ChoiceAttributeValue.objects.create(
            asset=asset_inactive,
            asset_type_attribute=local_attr,
            choice=choice_inactive,
        )

        asset_no_value = Asset.objects.create(
            organization=organization,
            asset_type=asset_type,
            name="No Value Local Asset",
        )

        # Clear the cache
        from django.core.cache import cache

        cache.clear()

        # Check what the cache returns
        from assets.filter_serializers import get_attributes_by_api_key

        attrs = get_attributes_by_api_key("local_status")
        print(f"Cached attrs for local_status: {attrs}")
        for attr in attrs:
            print(
                f"  ID: {attr['id']}, Type: {attr['attribute_type']}, Has Choices: {attr.get('has_choices')}"
            )

        # Filter for "Active" choice
        data = {
            "field": "attributes.local_status",
            "value": ["Active"],
            "operator": "in",
        }
        serializer = FilterGroupSerializer(data=data)
        q = serializer.build_filter_query()

        print(f"Generated Q for local attr: {q}")

        results = Asset.objects.filter(q).filter(organization=organization)
        result_names = list(results.values_list("name", flat=True))
        print(f"Results: {result_names}")

        # Should find only the active asset
        assert (
            results.count() == 1
        ), f"Expected 1 result, got {results.count()}: {result_names}"
        assert asset_active in results
        assert asset_inactive not in results
        assert asset_no_value not in results

    def test_workspace_local_choice_attribute_nin_null(self, organization, workspace):
        """
        Test nin [null] filter on a WorkspaceLocalAssetTypeAttribute with choices.

        This is the user's exact scenario - filtering to exclude null on a
        workspace-local attribute that uses choices.
        """
        from assets.models import (
            ChoiceAttributeValue,
            TextAttributeChoice,
        )

        # Create asset type
        asset_type = AssetType.objects.create(
            organization=organization, name="Type for local nin null test"
        )

        # Create a WORKSPACE LOCAL attribute with choices
        local_attr = WorkspaceLocalAssetTypeAttribute.objects.create(
            asset_type=asset_type,
            workspace=workspace,
            name="LK Local",
            api_key="lk_local",
            attribute_type="text",
        )

        # Create a choice
        choice_a = TextAttributeChoice.objects.create(
            asset_type_attribute=local_attr,
            value="Choice A",
            order=0,
        )

        # Asset WITH a choice value
        asset_with_choice = Asset.objects.create(
            organization=organization,
            asset_type=asset_type,
            name="Asset WITH local choice",
        )
        ChoiceAttributeValue.objects.create(
            asset=asset_with_choice, asset_type_attribute=local_attr, choice=choice_a
        )

        # Asset WITHOUT any value
        asset_without_value = Asset.objects.create(
            organization=organization,
            asset_type=asset_type,
            name="Asset WITHOUT local choice",
        )

        # Clear the cache
        from django.core.cache import cache

        cache.clear()

        # Check what the cache returns
        from assets.filter_serializers import get_attributes_by_api_key

        attrs = get_attributes_by_api_key("lk_local")
        print(f"Cached attrs for lk_local: {attrs}")
        for attr in attrs:
            print(
                f"  ID: {attr['id']}, Type: {attr['attribute_type']}, Has Choices: {attr.get('has_choices')}"
            )

        # Filter: exclude null
        data = {
            "field": "attributes.lk_local",
            "value": [None],
            "operator": "nin",
        }
        serializer = FilterGroupSerializer(data=data)
        q = serializer.build_filter_query()

        print(f"Generated Q for nin null on local attr: {q}")

        results = Asset.objects.filter(q).filter(organization=organization)
        result_names = list(results.values_list("name", flat=True))
        print(f"Results: {result_names}")

        # Should include only the asset WITH a choice value
        assert (
            results.count() == 1
        ), f"Expected 1 result (asset with choice), got {results.count()}: {result_names}"
        assert asset_with_choice in results
        assert asset_without_value not in results

    def test_workspace_local_choice_attribute_nin_specific_value(
        self, organization, workspace
    ):
        """
        Test nin with specific value on a single workspace local attribute with choices.

        User scenario: Single workspace, local attribute with choices, filter nin ["m"]
        should exclude the asset with choice value "m".
        """
        from assets.models import (
            ChoiceAttributeValue,
            TextAttributeChoice,
        )

        # Create asset type
        asset_type = AssetType.objects.create(
            organization=organization, name="Type for local nin specific value"
        )

        # Create a WORKSPACE LOCAL attribute with choices
        local_attr = WorkspaceLocalAssetTypeAttribute.objects.create(
            asset_type=asset_type,
            workspace=workspace,
            name="LK",
            api_key="lk_single",
            attribute_type="text",
        )

        # Create choices
        choice_m = TextAttributeChoice.objects.create(
            asset_type_attribute=local_attr,
            value="m",
            order=0,
        )
        choice_n = TextAttributeChoice.objects.create(
            asset_type_attribute=local_attr,
            value="n",
            order=1,
        )

        # Asset with choice "m"
        asset_m = Asset.objects.create(
            organization=organization, asset_type=asset_type, name="Asset with m"
        )
        asset_m.workspace_memberships.create(workspace=workspace)
        ChoiceAttributeValue.objects.create(
            asset=asset_m, asset_type_attribute=local_attr, choice=choice_m
        )

        # Asset with choice "n"
        asset_n = Asset.objects.create(
            organization=organization, asset_type=asset_type, name="Asset with n"
        )
        asset_n.workspace_memberships.create(workspace=workspace)
        ChoiceAttributeValue.objects.create(
            asset=asset_n, asset_type_attribute=local_attr, choice=choice_n
        )

        # Asset without any value
        asset_none = Asset.objects.create(
            organization=organization, asset_type=asset_type, name="Asset without value"
        )
        asset_none.workspace_memberships.create(workspace=workspace)

        # Clear cache
        from django.core.cache import cache

        cache.clear()

        # Check cached attrs
        from assets.filter_serializers import get_attributes_by_api_key

        attrs = get_attributes_by_api_key("lk_single")
        print(f"Cached attrs: {attrs}")
        for attr in attrs:
            print(
                f"  ID: {attr['id']}, Type: {attr['attribute_type']}, Has Choices: {attr.get('has_choices')}"
            )

        # Filter: nin ["m"] - should exclude asset with "m", include "n" and no value
        data = {
            "field": "attributes.lk_single",
            "value": ["m"],
            "operator": "nin",
        }
        serializer = FilterGroupSerializer(data=data)
        q = serializer.build_filter_query()

        print(f"Generated Q for nin ['m']: {q}")

        results = Asset.objects.filter(q).filter(organization=organization)
        result_names = list(results.values_list("name", flat=True))
        print(f"Results: {result_names}")

        # Should EXCLUDE asset_m (has choice "m")
        # Should INCLUDE asset_n (has choice "n", not "m")
        # Should INCLUDE asset_none (no value, not "m")
        assert (
            asset_m not in results
        ), f"Asset with 'm' should be EXCLUDED, got: {result_names}"
        assert (
            asset_n in results
        ), f"Asset with 'n' should be INCLUDED, got: {result_names}"
        assert (
            asset_none in results
        ), f"Asset without value should be INCLUDED, got: {result_names}"
        assert (
            results.count() == 2
        ), f"Expected 2 results, got {results.count()}: {result_names}"

    def test_workspace_local_choice_attribute_cross_workspace_conflict(
        self, organization
    ):
        """
        Test the case where TWO workspaces have local attributes with the SAME api_key,
        but only ONE has choices. This demonstrates the current bug where filtering
        uses the wrong lookup path because get_attributes_by_api_key doesn't filter
        by workspace.

        Scenario:
        - Workspace A: local attribute "lk" WITH choices
        - Workspace B: local attribute "lk" WITHOUT choices (plain text)
        - Asset in Workspace A has a ChoiceAttributeValue
        - Filtering should find the asset, but may fail if the wrong attribute is used
        """
        from assets.models import (
            ChoiceAttributeValue,
            TextAttributeChoice,
            TextAttributeValue,
        )
        from workspaces.models import Workspace

        # Create TWO workspaces
        workspace_a = Workspace.objects.create(
            organization=organization, name="Workspace A"
        )
        workspace_b = Workspace.objects.create(
            organization=organization, name="Workspace B"
        )

        # Create asset type
        asset_type = AssetType.objects.create(
            organization=organization, name="Type for cross-workspace test"
        )

        # Workspace A: local attribute WITH choices
        local_attr_a = WorkspaceLocalAssetTypeAttribute.objects.create(
            asset_type=asset_type,
            workspace=workspace_a,
            name="LK",
            api_key="lk_cross",  # Same api_key
            attribute_type="text",
        )
        choice_a = TextAttributeChoice.objects.create(
            asset_type_attribute=local_attr_a,
            value="Choice Value",
            order=0,
        )

        # Workspace B: local attribute WITHOUT choices (plain text)
        local_attr_b = WorkspaceLocalAssetTypeAttribute.objects.create(
            asset_type=asset_type,
            workspace=workspace_b,
            name="LK",
            api_key="lk_cross",  # Same api_key!
            attribute_type="text",
        )
        # No choices added to local_attr_b

        # Create asset in Workspace A with a CHOICE value
        asset_with_choice = Asset.objects.create(
            organization=organization,
            asset_type=asset_type,
            name="Asset in Workspace A",
        )
        asset_with_choice.workspace_memberships.create(workspace=workspace_a)
        ChoiceAttributeValue.objects.create(
            asset=asset_with_choice, asset_type_attribute=local_attr_a, choice=choice_a
        )

        # Create asset in Workspace B with a plain TEXT value (no choice)
        asset_with_text = Asset.objects.create(
            organization=organization,
            asset_type=asset_type,
            name="Asset in Workspace B",
        )
        asset_with_text.workspace_memberships.create(workspace=workspace_b)
        TextAttributeValue.objects.create(
            asset=asset_with_text,
            asset_type_attribute=local_attr_b,
            value="Plain Text Value",
        )

        # Clear the cache
        from django.core.cache import cache

        cache.clear()

        # Check what the cache returns - it will return BOTH attributes!
        from assets.filter_serializers import get_attributes_by_api_key

        attrs = get_attributes_by_api_key("lk_cross")
        print(f"Cached attrs for lk_cross: {attrs}")
        for attr in attrs:
            print(
                f"  ID: {attr['id']}, Type: {attr['attribute_type']}, Has Choices: {attr.get('has_choices')}"
            )

        # This shows the bug: we get BOTH attributes, one with choices, one without
        assert (
            len(attrs) == 2
        ), f"Expected 2 attributes (from both workspaces), got {len(attrs)}"

        # Now filter for "Choice Value"
        data = {
            "field": "attributes.lk_cross",
            "value": ["Choice Value"],
            "operator": "in",
        }
        serializer = FilterGroupSerializer(data=data)
        q = serializer.build_filter_query()

        print(f"Generated Q: {q}")

        # The query should find asset_with_choice (in Workspace A)
        # The current implementation ORs the queries for both attributes,
        # so it should still work, but the query is inefficient and
        # may have edge cases that fail
        results = Asset.objects.filter(q).filter(organization=organization)
        result_names = list(results.values_list("name", flat=True))
        print(f"Results: {result_names}")

        # Should find the asset with the choice value
        assert (
            asset_with_choice in results
        ), f"Expected to find asset_with_choice, got: {result_names}"
        # Should NOT find the asset with plain text (different value)
        assert asset_with_text not in results, f"Should not find asset_with_text"

    def test_workspace_local_choice_nin_null_cross_workspace(self, organization):
        """
        Test nin [null] with cross-workspace local attributes where one has choices
        and one doesn't.

        This is the likely root cause of the user's bug:
        - Workspace A: local attribute "lk" WITH choices, asset has a ChoiceAttributeValue
        - Workspace B: local attribute "lk" WITHOUT choices
        - Filter nin [null] should return the asset in Workspace A
        - But the query for attribute B (without choices) looks for textattributevalue__value
          which doesn't exist for the asset in Workspace A
        """
        from assets.models import (
            ChoiceAttributeValue,
            TextAttributeChoice,
        )
        from workspaces.models import Workspace

        # Create TWO workspaces
        workspace_a = Workspace.objects.create(
            organization=organization, name="Workspace A"
        )
        workspace_b = Workspace.objects.create(
            organization=organization, name="Workspace B"
        )

        # Create asset type
        asset_type = AssetType.objects.create(
            organization=organization, name="Type for nin null cross-workspace"
        )

        # Workspace A: local attribute WITH choices
        local_attr_a = WorkspaceLocalAssetTypeAttribute.objects.create(
            asset_type=asset_type,
            workspace=workspace_a,
            name="LK",
            api_key="lk_nin_cross",
            attribute_type="text",
        )
        choice_a = TextAttributeChoice.objects.create(
            asset_type_attribute=local_attr_a,
            value="Choice Value",
            order=0,
        )

        # Workspace B: local attribute WITHOUT choices
        local_attr_b = WorkspaceLocalAssetTypeAttribute.objects.create(
            asset_type=asset_type,
            workspace=workspace_b,
            name="LK",
            api_key="lk_nin_cross",  # Same api_key!
            attribute_type="text",
        )

        # Create asset in Workspace A with a CHOICE value
        asset_with_choice = Asset.objects.create(
            organization=organization,
            asset_type=asset_type,
            name="Asset with choice value",
        )
        asset_with_choice.workspace_memberships.create(workspace=workspace_a)
        ChoiceAttributeValue.objects.create(
            asset=asset_with_choice, asset_type_attribute=local_attr_a, choice=choice_a
        )

        # Create asset in Workspace A WITHOUT any value
        asset_without_value = Asset.objects.create(
            organization=organization, asset_type=asset_type, name="Asset without value"
        )
        asset_without_value.workspace_memberships.create(workspace=workspace_a)

        # Clear the cache
        from django.core.cache import cache

        cache.clear()

        # Check what the cache returns
        from assets.filter_serializers import get_attributes_by_api_key

        attrs = get_attributes_by_api_key("lk_nin_cross")
        print(f"Cached attrs for lk_nin_cross: {attrs}")
        for attr in attrs:
            print(
                f"  ID: {attr['id']}, Type: {attr['attribute_type']}, Has Choices: {attr.get('has_choices')}"
            )

        # Filter: nin [null] - should return only assets WITH a value
        data = {
            "field": "attributes.lk_nin_cross",
            "value": [None],
            "operator": "nin",
        }
        serializer = FilterGroupSerializer(data=data)
        q = serializer.build_filter_query()

        print(f"Generated Q for nin [null]: {q}")

        results = Asset.objects.filter(q).filter(organization=organization)
        result_names = list(results.values_list("name", flat=True))
        print(f"Results: {result_names}")

        # KEY ASSERTION: Should find asset_with_choice (it HAS a value)
        # This may FAIL if the cross-workspace attribute without choices
        # causes the wrong query to be used
        assert asset_with_choice in results, (
            f"Expected to find 'Asset with choice value', got: {result_names}. "
            "This is the BUG - cross-workspace attributes with same api_key "
            "but different has_choices settings cause incorrect filtering."
        )
        assert asset_without_value not in results

    def test_number_attribute_nin_null_with_asset_type_filter(
        self, organization, workspace
    ):
        """
        Test the exact scenario from the user's filter JSON:
        {"filters":[{"logic":"AND","filters":[
            {"field":"assetTypeId","value":"<uuid>","operator":"exact"},
            {"field":"attributes.number","value":[null],"operator":"nin"}
        ]}],"logic":"AND"}

        Scenario:
        - Asset type with a number attribute (has choices)
        - One asset WITH a number value set
        - One asset WITHOUT any value (null)
        - Filter: asset type exact AND nin [null] on the number attribute
        - Expected: Only the asset WITH the value should be returned (count = 1)
        """
        from assets.models import (
            ChoiceAttributeValue,
            NumberAttributeChoice,
        )

        # Create asset type
        asset_type = AssetType.objects.create(
            organization=organization, name="Type for number nin null"
        )

        # Create a number attribute WITH choices
        number_attr = GlobalAssetTypeAttribute.objects.create(
            asset_type=asset_type,
            name="Number",
            api_key="number",
            attribute_type="number",
        )

        # Create a choice for the number attribute
        choice_42 = NumberAttributeChoice.objects.create(
            asset_type_attribute=number_attr,
            value=42.0,
            order=0,
        )

        # Asset WITH a number value
        asset_with_value = Asset.objects.create(
            organization=organization, asset_type=asset_type, name="Asset WITH number"
        )
        ChoiceAttributeValue.objects.create(
            asset=asset_with_value, asset_type_attribute=number_attr, choice=choice_42
        )

        # Asset WITHOUT any value (null)
        asset_without_value = Asset.objects.create(
            organization=organization,
            asset_type=asset_type,
            name="Asset WITHOUT number",
        )

        # Clear the cache
        from django.core.cache import cache

        cache.clear()

        # This is the EXACT filter structure from the user's JSON
        data = {
            "logic": "AND",
            "filters": [
                {
                    "logic": "AND",
                    "filters": [
                        {
                            "field": "assetTypeId",
                            "value": str(asset_type.id),
                            "operator": "exact",
                        },
                        {
                            "field": "attributes.number",
                            "value": [None],
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

        # Should return exactly 1 asset - the one WITH a value
        assert (
            results.count() == 1
        ), f"Expected 1 result, got {results.count()}: {result_names}"
        assert asset_with_value in results
        assert asset_without_value not in results


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

    @pytest.mark.django_db
    def test_values_endpoint_returns_only_used_choices_for_choice_attribute(
        self, client, organization, workspace
    ):
        """
        Test that the values endpoint returns only the choices that are actually used
        by assets, not all defined choices.
        """
        from assets.models import TextAttributeChoice, ChoiceAttributeValue

        # Create asset type with a text attribute that HAS CHOICES
        asset_type = AssetType.objects.create(
            organization=organization, name="Type with choices"
        )
        status_attr = GlobalAssetTypeAttribute.objects.create(
            asset_type=asset_type,
            name="Status",
            api_key="status",
            attribute_type="text",
        )

        # Create choices for the attribute (3 choices, but we'll only use 2)
        choice_active = TextAttributeChoice.objects.create(
            asset_type_attribute=status_attr,
            value="Active",
            order=0,
        )
        choice_inactive = TextAttributeChoice.objects.create(
            asset_type_attribute=status_attr,
            value="Inactive",
            order=1,
        )
        choice_pending = TextAttributeChoice.objects.create(
            asset_type_attribute=status_attr,
            value="Pending",
            order=2,
        )

        # Create assets that use only Active and Pending (NOT Inactive)
        asset_active = Asset.objects.create(
            organization=organization, asset_type=asset_type, name="Active Asset"
        )
        ChoiceAttributeValue.objects.create(
            asset=asset_active, asset_type_attribute=status_attr, choice=choice_active
        )

        asset_pending = Asset.objects.create(
            organization=organization, asset_type=asset_type, name="Pending Asset"
        )
        ChoiceAttributeValue.objects.create(
            asset=asset_pending, asset_type_attribute=status_attr, choice=choice_pending
        )

        # Make a request to the values endpoint
        url = f"/api/workspaces/{workspace.id}/asset-types/{asset_type.id}/attributes/{status_attr.id}/values/"
        response = client.get(url)

        assert response.status_code == 200
        data = response.json()
        results = data["results"]

        print(f"Choice values endpoint results: {results}")

        # Should return: Blank, Active, Pending (only USED choices, in order)
        # Note: Inactive should NOT be in results because no asset uses it
        assert (
            results[0] == "Blank"
        ), f"Expected 'Blank' as first result, got {results[0]}"
        assert "Active" in results, "Expected 'Active' in results (it's used)"
        assert "Pending" in results, "Expected 'Pending' in results (it's used)"
        assert (
            "Inactive" not in results
        ), "Inactive should NOT be in results (it's not used)"

        # Verify order: Active (order=0) should come before Pending (order=2)
        active_idx = results.index("Active")
        pending_idx = results.index("Pending")
        assert (
            active_idx < pending_idx
        ), f"Expected Active before Pending, got indices: {active_idx}, {pending_idx}"

    @pytest.mark.django_db
    def test_values_endpoint_returns_link_with_url_and_text(
        self, client, organization, workspace, asset_type, global_link_attribute
    ):
        """
        Test that the values endpoint returns link values as objects with both
        url and text fields, not just the URL string.
        """
        # Create assets with link values
        asset1 = Asset.objects.create(
            organization=organization,
            asset_type=asset_type,
            name="Asset with link 1",
            geometry="POINT(0 0)",
        )
        LinkAttributeValue.objects.create(
            asset=asset1,
            asset_type_attribute=global_link_attribute,
            url="https://example.com",
            display_text="Example Site",
        )

        asset2 = Asset.objects.create(
            organization=organization,
            asset_type=asset_type,
            name="Asset with link 2",
            geometry="POINT(1 1)",
        )
        LinkAttributeValue.objects.create(
            asset=asset2,
            asset_type_attribute=global_link_attribute,
            url="https://google.com",
            display_text="",  # No display text - should fall back to URL
        )

        # Make a request to the values endpoint
        url = f"/api/workspaces/{workspace.id}/asset-types/{asset_type.id}/attributes/{global_link_attribute.id}/values/"
        response = client.get(url)

        assert response.status_code == 200
        data = response.json()
        results = data["results"]

        print(f"Link values endpoint results: {results}")

        # First should be "Blank"
        assert (
            results[0] == "Blank"
        ), f"Expected 'Blank' as first result, got {results[0]}"

        # The link values should be objects with url and text fields
        link_values = [r for r in results if isinstance(r, dict)]
        assert len(link_values) == 2, f"Expected 2 link values, got {len(link_values)}"

        # Find the example.com link
        example_link = next(
            (l for l in link_values if l.get("url") == "https://example.com"), None
        )
        assert example_link is not None, "Expected to find example.com link"
        assert (
            example_link["text"] == "Example Site"
        ), f"Expected text 'Example Site', got {example_link['text']}"

        # Find the google.com link (no display_text, should fall back to URL)
        google_link = next(
            (l for l in link_values if l.get("url") == "https://google.com"), None
        )
        assert google_link is not None, "Expected to find google.com link"
        assert (
            google_link["text"] == "https://google.com"
        ), f"Expected text to fall back to URL, got {google_link['text']}"

    @pytest.mark.django_db
    def test_values_endpoint_returns_link_choices_with_url_and_text(
        self, client, organization, workspace
    ):
        """
        Test that the values endpoint returns link choice values as objects with both
        url and text fields when the attribute has choices defined.
        """
        from assets.models import LinkAttributeChoice, ChoiceAttributeValue

        # Create asset type with a link attribute that HAS CHOICES
        asset_type = AssetType.objects.create(
            organization=organization, name="Type with link choices"
        )
        link_attr = GlobalAssetTypeAttribute.objects.create(
            asset_type=asset_type,
            name="Reference Link",
            api_key="reference_link",
            attribute_type="link",
        )

        # Create link choices
        choice1 = LinkAttributeChoice.objects.create(
            asset_type_attribute=link_attr,
            url="https://docs.example.com",
            display_text="Documentation",
            order=0,
        )
        choice2 = LinkAttributeChoice.objects.create(
            asset_type_attribute=link_attr,
            url="https://support.example.com",
            display_text="",  # No display text
            order=1,
        )
        # Unused choice - should not appear in results
        choice3 = LinkAttributeChoice.objects.create(
            asset_type_attribute=link_attr,
            url="https://unused.example.com",
            display_text="Unused",
            order=2,
        )

        # Create assets using only choice1 and choice2
        asset1 = Asset.objects.create(
            organization=organization, asset_type=asset_type, name="Asset 1"
        )
        ChoiceAttributeValue.objects.create(
            asset=asset1, asset_type_attribute=link_attr, choice=choice1
        )

        asset2 = Asset.objects.create(
            organization=organization, asset_type=asset_type, name="Asset 2"
        )
        ChoiceAttributeValue.objects.create(
            asset=asset2, asset_type_attribute=link_attr, choice=choice2
        )

        # Make a request to the values endpoint
        url = f"/api/workspaces/{workspace.id}/asset-types/{asset_type.id}/attributes/{link_attr.id}/values/"
        response = client.get(url)

        assert response.status_code == 200
        data = response.json()
        results = data["results"]

        print(f"Link choice values endpoint results: {results}")

        # First should be "Blank"
        assert (
            results[0] == "Blank"
        ), f"Expected 'Blank' as first result, got {results[0]}"

        # The link values should be objects with url and text fields
        link_values = [r for r in results if isinstance(r, dict)]
        assert (
            len(link_values) == 2
        ), f"Expected 2 link values (unused choice excluded), got {len(link_values)}"

        # Find the docs link
        docs_link = next(
            (l for l in link_values if l.get("url") == "https://docs.example.com"), None
        )
        assert docs_link is not None, "Expected to find docs.example.com link"
        assert (
            docs_link["text"] == "Documentation"
        ), f"Expected text 'Documentation', got {docs_link['text']}"

        # Find the support link (no display_text, should fall back to URL)
        support_link = next(
            (l for l in link_values if l.get("url") == "https://support.example.com"),
            None,
        )
        assert support_link is not None, "Expected to find support.example.com link"
        assert (
            support_link["text"] == "https://support.example.com"
        ), f"Expected text to fall back to URL, got {support_link['text']}"

        # Verify unused choice is NOT in results
        unused_urls = [l.get("url") for l in link_values]
        assert (
            "https://unused.example.com" not in unused_urls
        ), "Unused choice should NOT be in results"
