"""Tests for unit conversion utilities."""

import pytest
from decimal import Decimal

import pint

from .unit_conversion import (
    UNIT_CATEGORIES,
    get_unit_registry,
    get_unit_display_name,
    get_unit_symbol,
    convert_value,
    convert_to_base,
    convert_from_base,
    are_units_compatible,
    get_unit_category_for_unit,
    get_categories_for_api,
    validate_unit,
)


class TestGetUnitRegistry:
    """Tests for get_unit_registry function."""

    def test_returns_pint_registry(self):
        registry = get_unit_registry()
        assert isinstance(registry, pint.UnitRegistry)

    def test_returns_same_instance(self):
        """Should return the same singleton instance."""
        registry1 = get_unit_registry()
        registry2 = get_unit_registry()
        assert registry1 is registry2


class TestGetUnitDisplayName:
    """Tests for get_unit_display_name function."""

    def test_kilogram(self):
        assert get_unit_display_name("kg") == "kilogram"

    def test_meter(self):
        assert get_unit_display_name("m") == "meter"

    def test_celsius(self):
        assert get_unit_display_name("degC") == "degree_Celsius"

    def test_invalid_unit_returns_input(self):
        assert get_unit_display_name("invalid_unit_xyz") == "invalid_unit_xyz"

    def test_compound_unit(self):
        result = get_unit_display_name("m/s")
        assert "meter" in result


class TestGetUnitSymbol:
    """Tests for get_unit_symbol function."""

    def test_kilogram(self):
        assert get_unit_symbol("kg") == "kg"

    def test_kilogram_full_name(self):
        assert get_unit_symbol("kilogram") == "kg"

    def test_meter(self):
        assert get_unit_symbol("m") == "m"

    def test_mile(self):
        assert get_unit_symbol("mi") == "mi"

    def test_invalid_unit_returns_input(self):
        assert get_unit_symbol("invalid_unit_xyz") == "invalid_unit_xyz"


class TestConvertValue:
    """Tests for convert_value function."""

    def test_kg_to_lb(self):
        result = convert_value(1, "kg", "lb")
        assert pytest.approx(result, rel=1e-3) == 2.20462

    def test_lb_to_kg(self):
        result = convert_value(1, "lb", "kg")
        assert pytest.approx(result, rel=1e-3) == 0.453592

    def test_m_to_ft(self):
        result = convert_value(1, "m", "ft")
        assert pytest.approx(result, rel=1e-3) == 3.28084

    def test_celsius_to_fahrenheit(self):
        result = convert_value(0, "degC", "degF")
        assert pytest.approx(result, rel=1e-3) == 32

    def test_celsius_to_fahrenheit_100(self):
        result = convert_value(100, "degC", "degF")
        assert pytest.approx(result, rel=1e-3) == 212

    def test_fahrenheit_to_celsius(self):
        result = convert_value(32, "degF", "degC")
        assert pytest.approx(result, rel=1e-3) == 0

    def test_kelvin_to_celsius(self):
        result = convert_value(273.15, "kelvin", "degC")
        assert pytest.approx(result, rel=1e-3) == 0

    def test_none_value_returns_none(self):
        assert convert_value(None, "kg", "lb") is None

    def test_decimal_input(self):
        result = convert_value(Decimal("1.5"), "kg", "lb")
        assert pytest.approx(result, rel=1e-3) == 3.30693

    def test_integer_input(self):
        result = convert_value(5, "kg", "g")
        assert result == 5000

    def test_same_unit_returns_same_value(self):
        result = convert_value(42, "kg", "kg")
        assert result == 42

    def test_incompatible_units_raises_error(self):
        with pytest.raises(pint.DimensionalityError):
            convert_value(1, "kg", "m")

    def test_invalid_unit_raises_error(self):
        with pytest.raises(pint.UndefinedUnitError):
            convert_value(1, "invalid_unit", "kg")


class TestConvertToBase:
    """Tests for convert_to_base function."""

    def test_lb_to_kg_mass(self):
        result = convert_to_base(1, "lb", "mass")
        assert pytest.approx(result, rel=1e-3) == 0.453592

    def test_ft_to_m_length(self):
        result = convert_to_base(1, "ft", "length")
        assert pytest.approx(result, rel=1e-3) == 0.3048

    def test_base_unit_returns_same(self):
        result = convert_to_base(5, "kg", "mass")
        assert result == 5

    def test_none_value_returns_none(self):
        assert convert_to_base(None, "lb", "mass") is None

    def test_invalid_category_returns_float(self):
        result = convert_to_base(5, "kg", "invalid_category")
        assert result == 5.0


class TestConvertFromBase:
    """Tests for convert_from_base function."""

    def test_kg_to_lb_mass(self):
        result = convert_from_base(1, "lb", "mass")
        assert pytest.approx(result, rel=1e-3) == 2.20462

    def test_m_to_ft_length(self):
        result = convert_from_base(1, "ft", "length")
        assert pytest.approx(result, rel=1e-3) == 3.28084

    def test_base_unit_returns_same(self):
        result = convert_from_base(5, "kg", "mass")
        assert result == 5

    def test_none_value_returns_none(self):
        assert convert_from_base(None, "lb", "mass") is None

    def test_invalid_category_returns_float(self):
        result = convert_from_base(5, "lb", "invalid_category")
        assert result == 5.0


class TestAreUnitsCompatible:
    """Tests for are_units_compatible function."""

    def test_kg_and_lb_compatible(self):
        assert are_units_compatible("kg", "lb") is True

    def test_m_and_ft_compatible(self):
        assert are_units_compatible("m", "ft") is True

    def test_degc_and_degf_compatible(self):
        assert are_units_compatible("degC", "degF") is True

    def test_kg_and_m_incompatible(self):
        assert are_units_compatible("kg", "m") is False

    def test_invalid_unit_returns_false(self):
        assert are_units_compatible("invalid_unit", "kg") is False

    def test_both_invalid_returns_false(self):
        assert are_units_compatible("invalid1", "invalid2") is False


class TestGetUnitCategoryForUnit:
    """Tests for get_unit_category_for_unit function."""

    def test_kg_is_mass(self):
        assert get_unit_category_for_unit("kg") == "mass"

    def test_lb_is_mass(self):
        assert get_unit_category_for_unit("lb") == "mass"

    def test_m_is_length(self):
        assert get_unit_category_for_unit("m") == "length"

    def test_ft_is_length(self):
        assert get_unit_category_for_unit("ft") == "length"

    def test_degc_is_temperature(self):
        assert get_unit_category_for_unit("degC") == "temperature"

    def test_degf_is_temperature(self):
        assert get_unit_category_for_unit("degF") == "temperature"

    def test_invalid_unit_returns_none(self):
        assert get_unit_category_for_unit("invalid_unit") is None


class TestValidateUnit:
    """Tests for validate_unit function."""

    def test_kg_valid(self):
        assert validate_unit("kg") is True

    def test_lb_valid(self):
        assert validate_unit("lb") is True

    def test_degc_valid(self):
        assert validate_unit("degC") is True

    def test_m_s_compound_valid(self):
        assert validate_unit("m/s") is True

    def test_invalid_unit(self):
        assert validate_unit("invalid_unit_xyz") is False

    def test_empty_string_is_dimensionless(self):
        # Empty string is valid in Pint (dimensionless)
        assert validate_unit("") is True

    def test_gibberish_invalid(self):
        assert validate_unit("asdfqwer123") is False


class TestGetCategoriesForApi:
    """Tests for get_categories_for_api function."""

    def test_returns_list(self):
        result = get_categories_for_api()
        assert isinstance(result, list)

    def test_has_all_categories(self):
        result = get_categories_for_api()
        category_keys = {cat["key"] for cat in result}
        assert category_keys == set(UNIT_CATEGORIES.keys())

    def test_category_has_required_fields(self):
        result = get_categories_for_api()
        for category in result:
            assert "key" in category
            assert "name" in category
            assert "base_unit" in category
            assert "units" in category

    def test_unit_has_required_fields(self):
        result = get_categories_for_api()
        for category in result:
            for unit in category["units"]:
                assert "code" in unit
                assert "symbol" in unit
                assert "name" in unit
                assert "is_base" in unit

    def test_base_unit_marked_correctly(self):
        result = get_categories_for_api()
        mass_category = next(cat for cat in result if cat["key"] == "mass")
        kg_unit = next(u for u in mass_category["units"] if u["code"] == "kg")
        lb_unit = next(u for u in mass_category["units"] if u["code"] == "lb")
        assert kg_unit["is_base"] is True
        assert lb_unit["is_base"] is False

    def test_search_by_category_name(self):
        """Search by category name returns that category with all units."""
        result = get_categories_for_api(search="mass")
        assert len(result) == 1
        assert result[0]["key"] == "mass"
        # Should have all units when category matches
        assert len(result[0]["units"]) > 1

    def test_search_by_category_key(self):
        """Search by category key (e.g. 'temperature') returns that category."""
        result = get_categories_for_api(search="temperature")
        assert len(result) == 1
        assert result[0]["key"] == "temperature"

    def test_search_by_unit_code(self):
        """Search by unit code returns categories containing matching units."""
        result = get_categories_for_api(search="kg")
        assert len(result) >= 1
        mass_category = next((cat for cat in result if cat["key"] == "mass"), None)
        assert mass_category is not None
        # Should contain kg unit
        unit_codes = [u["code"] for u in mass_category["units"]]
        assert "kg" in unit_codes

    def test_search_by_unit_name(self):
        """Search by unit name returns matching units."""
        result = get_categories_for_api(search="meter")
        assert len(result) >= 1
        # Should find length category
        length_category = next((cat for cat in result if cat["key"] == "length"), None)
        assert length_category is not None

    def test_search_case_insensitive(self):
        """Search should be case insensitive."""
        result_lower = get_categories_for_api(search="mass")
        result_upper = get_categories_for_api(search="MASS")
        result_mixed = get_categories_for_api(search="Mass")
        assert len(result_lower) == len(result_upper) == len(result_mixed)

    def test_search_no_results(self):
        """Search with no matches returns empty list."""
        result = get_categories_for_api(search="xyznonexistent123")
        assert result == []

    def test_search_empty_string(self):
        """Empty search string returns all categories."""
        result_empty = get_categories_for_api(search="")
        result_none = get_categories_for_api(search=None)
        result_all = get_categories_for_api()
        assert len(result_empty) == len(result_none) == len(result_all)

    def test_search_partial_match(self):
        """Partial search term should match."""
        result = get_categories_for_api(search="kilo")
        # Should find multiple categories with kilo- units
        assert len(result) >= 1
        # Check that we got categories with kilo- units
        all_unit_names = []
        for cat in result:
            for unit in cat["units"]:
                all_unit_names.append(unit["name"].lower())
        assert any("kilo" in name for name in all_unit_names)

    def test_filter_by_category(self):
        """Filter by category returns only that category."""
        result = get_categories_for_api(category="mass")
        assert len(result) == 1
        assert result[0]["key"] == "mass"

    def test_filter_by_category_case_insensitive(self):
        """Category filter should be case insensitive."""
        result = get_categories_for_api(category="MASS")
        assert len(result) == 1
        assert result[0]["key"] == "mass"

    def test_filter_by_category_invalid(self):
        """Invalid category returns empty list."""
        result = get_categories_for_api(category="nonexistent")
        assert result == []

    def test_filter_by_category_with_search(self):
        """Category filter combined with search."""
        result = get_categories_for_api(category="mass", search="kilo")
        assert len(result) == 1
        assert result[0]["key"] == "mass"
        # Should only have units matching 'kilo'
        unit_names = [u["name"].lower() for u in result[0]["units"]]
        assert all("kilo" in name for name in unit_names)

    def test_categories_only_mode(self):
        """Categories only mode returns categories without units."""
        result = get_categories_for_api(categories_only=True)
        assert len(result) > 0
        for category in result:
            assert "key" in category
            assert "name" in category
            assert "base_unit" in category
            assert "units" in category
            assert category["units"] == []  # Should be empty

    def test_categories_only_with_search(self):
        """Categories only mode with search filters categories."""
        result = get_categories_for_api(search="mass", categories_only=True)
        assert len(result) == 1
        assert result[0]["key"] == "mass"
        assert result[0]["units"] == []

    def test_categories_only_with_category_filter(self):
        """Categories only mode with category filter."""
        result = get_categories_for_api(category="temperature", categories_only=True)
        assert len(result) == 1
        assert result[0]["key"] == "temperature"
        assert result[0]["units"] == []

    def test_units_only_mode(self):
        """Units only mode returns flat list of units."""
        result = get_categories_for_api(units_only=True)
        assert len(result) > 0
        # Should be a flat list of unit objects, not categories
        for unit in result:
            assert "code" in unit
            assert "symbol" in unit
            assert "name" in unit
            assert "is_base" in unit
            assert "category_key" in unit
            assert "category_name" in unit
            # Should not have category structure
            assert "units" not in unit

    def test_units_only_with_search(self):
        """Units only mode with search filters units."""
        result = get_categories_for_api(search="kilo", units_only=True)
        assert len(result) > 0
        # All units should contain 'kilo' in name, code, symbol, or category
        for unit in result:
            has_kilo = (
                "kilo" in unit["name"].lower()
                or "kilo" in unit["code"].lower()
                or "kilo" in unit["symbol"].lower()
                or "kilo" in unit["category_name"].lower()
            )
            assert has_kilo

    def test_units_only_with_category_filter(self):
        """Units only mode with category filter."""
        result = get_categories_for_api(category="mass", units_only=True)
        assert len(result) > 0
        # All units should be from mass category
        for unit in result:
            assert unit["category_key"] == "mass"


class TestUnitCategories:
    """Tests for UNIT_CATEGORIES constant."""

    def test_all_units_are_valid(self):
        """Ensure all units in UNIT_CATEGORIES are recognized by Pint."""
        for category_key, category in UNIT_CATEGORIES.items():
            for unit_str in category["units"]:
                assert validate_unit(
                    unit_str
                ), f"Invalid unit '{unit_str}' in category '{category_key}'"

    def test_base_unit_in_units_list(self):
        """Ensure base_unit is included in the units list."""
        for category_key, category in UNIT_CATEGORIES.items():
            assert (
                category["base_unit"] in category["units"]
            ), f"Base unit '{category['base_unit']}' not in units list for '{category_key}'"

    def test_units_in_category_are_compatible(self):
        """Ensure all units in a category are compatible with each other."""
        for category_key, category in UNIT_CATEGORIES.items():
            base_unit = category["base_unit"]
            for unit_str in category["units"]:
                assert are_units_compatible(
                    base_unit, unit_str
                ), f"Unit '{unit_str}' is not compatible with base '{base_unit}' in '{category_key}'"
