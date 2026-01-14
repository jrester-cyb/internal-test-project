"""
Unit conversion utilities using Pint library.

Provides helpers for converting between units and getting available units
for number attributes.
"""

from functools import lru_cache
from typing import Optional, Union
from decimal import Decimal

import pint

# Create a single UnitRegistry instance (thread-safe, reusable)
ureg = pint.UnitRegistry()
ureg.formatter.default_format = "~P"  # Short pretty format (e.g., "kg" not "kilogram")


# Define unit categories with their common units for the UI
# Each category maps to compatible Pint units
UNIT_CATEGORIES = {
    "mass": {
        "name": "Mass / Weight",
        "base_unit": "kg",
        "units": ["kg", "g", "mg", "lb", "oz", "metric_ton", "stone"],
    },
    "length": {
        "name": "Length / Distance",
        "base_unit": "m",
        "units": ["m", "km", "cm", "mm", "mi", "yd", "ft", "inch", "nautical_mile"],
    },
    "area": {
        "name": "Area",
        "base_unit": "m**2",
        "units": ["m**2", "km**2", "hectare", "acre", "ft**2", "mi**2"],
    },
    "volume": {
        "name": "Volume",
        "base_unit": "liter",
        "units": [
            "liter",
            "ml",
            "m**3",
            "gallon",
            "quart",
            "pint",
            "fluid_ounce",
            "barrel",
        ],
    },
    "temperature": {
        "name": "Temperature",
        "base_unit": "degC",
        "units": ["degC", "degF", "kelvin"],
    },
    "speed": {
        "name": "Speed",
        "base_unit": "m/s",
        "units": ["m/s", "km/h", "mph", "knot", "ft/s"],
    },
    "time": {
        "name": "Time",
        "base_unit": "second",
        "units": ["second", "millisecond", "minute", "hour", "day", "week"],
    },
    "pressure": {
        "name": "Pressure",
        "base_unit": "pascal",
        "units": ["pascal", "kilopascal", "bar", "psi", "atm", "mmHg"],
    },
    "energy": {
        "name": "Energy",
        "base_unit": "joule",
        "units": [
            "joule",
            "kilojoule",
            "calorie",
            "kilocalorie",
            "watt_hour",
            "kWh",
            "BTU",
        ],
    },
    "power": {
        "name": "Power",
        "base_unit": "watt",
        "units": ["watt", "kilowatt", "megawatt", "horsepower"],
    },
    "data": {
        "name": "Data Size",
        "base_unit": "byte",
        "units": ["byte", "kilobyte", "megabyte", "gigabyte", "terabyte"],
    },
    "frequency": {
        "name": "Frequency",
        "base_unit": "hertz",
        "units": ["hertz", "kilohertz", "megahertz", "gigahertz"],
    },
    "electric_current": {
        "name": "Electric Current",
        "base_unit": "ampere",
        "units": ["ampere", "milliampere", "microampere"],
    },
    "voltage": {
        "name": "Voltage",
        "base_unit": "volt",
        "units": ["volt", "millivolt", "kilovolt"],
    },
    "force": {
        "name": "Force",
        "base_unit": "newton",
        "units": ["newton", "kilonewton", "pound_force", "dyne"],
    },
    "angle": {
        "name": "Angle",
        "base_unit": "degree",
        "units": ["degree", "radian", "arcminute", "arcsecond"],
    },
}


def get_unit_registry() -> pint.UnitRegistry:
    """Get the shared Pint UnitRegistry."""
    return ureg


@lru_cache(maxsize=128)
def get_unit_display_name(unit_str: str) -> str:
    """Get a human-readable display name for a unit."""
    try:
        unit = ureg.parse_expression(unit_str)
        # Use the full name
        return f"{unit.units:P}"
    except (pint.UndefinedUnitError, pint.DimensionalityError):
        return unit_str


@lru_cache(maxsize=128)
def get_unit_symbol(unit_str: str) -> str:
    """Get the short symbol for a unit (e.g., 'kg' for 'kilogram')."""
    try:
        unit = ureg.parse_expression(unit_str)
        return f"{unit.units:~P}"
    except (pint.UndefinedUnitError, pint.DimensionalityError):
        return unit_str


def convert_value(
    value: Union[float, int, Decimal],
    from_unit: str,
    to_unit: str,
) -> float:
    """
    Convert a value from one unit to another.

    Args:
        value: The numeric value to convert
        from_unit: The source unit (e.g., 'kg', 'lb', 'degC')
        to_unit: The target unit (e.g., 'lb', 'kg', 'degF')

    Returns:
        The converted value as a float

    Raises:
        pint.DimensionalityError: If units are incompatible
        pint.UndefinedUnitError: If a unit is not recognized
    """
    if value is None:
        return None

    # Use Quantity constructor for temperature (offset units)
    # This properly handles degC, degF, kelvin
    quantity = ureg.Quantity(float(value), from_unit)
    converted = quantity.to(to_unit)
    return converted.magnitude


def convert_to_base(
    value: Union[float, int, Decimal],
    from_unit: str,
    unit_category: str,
) -> float:
    """
    Convert a value to the base unit for its category.

    Args:
        value: The numeric value to convert
        from_unit: The source unit
        unit_category: The category key (e.g., 'mass', 'length')

    Returns:
        The value converted to the category's base unit
    """
    if value is None:
        return None

    category = UNIT_CATEGORIES.get(unit_category)
    if not category:
        # No category, return as-is
        return float(value)

    base_unit = category["base_unit"]
    return convert_value(value, from_unit, base_unit)


def convert_from_base(
    value: Union[float, int, Decimal],
    to_unit: str,
    unit_category: str,
) -> float:
    """
    Convert a value from the base unit to a target unit.

    Args:
        value: The numeric value in base units
        to_unit: The target unit
        unit_category: The category key (e.g., 'mass', 'length')

    Returns:
        The converted value
    """
    if value is None:
        return None

    category = UNIT_CATEGORIES.get(unit_category)
    if not category:
        return float(value)

    base_unit = category["base_unit"]
    return convert_value(value, base_unit, to_unit)


def are_units_compatible(unit1: str, unit2: str) -> bool:
    """Check if two units are compatible (same dimensionality)."""
    try:
        q1 = ureg.parse_expression(unit1)
        q2 = ureg.parse_expression(unit2)
        return q1.dimensionality == q2.dimensionality
    except (pint.UndefinedUnitError, pint.DimensionalityError):
        return False


def get_unit_category_for_unit(unit_str: str) -> Optional[str]:
    """Find which category a unit belongs to."""
    try:
        unit = ureg.parse_expression(unit_str)
        for category_key, category in UNIT_CATEGORIES.items():
            base = ureg.parse_expression(category["base_unit"])
            if unit.dimensionality == base.dimensionality:
                return category_key
    except (pint.UndefinedUnitError, pint.DimensionalityError):
        pass
    return None


def get_categories_for_api(
    search: Optional[str] = None, category: Optional[str] = None
) -> list:
    """
    Get unit categories formatted for API response.
    Used by endpoints that need to list available units.

    Args:
        search: Optional search term to filter by category name or unit name/code/symbol
        category: Optional category key to filter by (e.g., 'mass', 'length')

    Returns:
        List of category dictionaries
    """
    search_lower = search.lower().strip() if search else None
    category_filter = category.lower().strip() if category else None
    categories_list = []

    for key, cat in UNIT_CATEGORIES.items():
        # If category filter specified, skip non-matching categories
        if category_filter and key.lower() != category_filter:
            continue

        # Check if category matches search
        category_matches = False
        if search_lower:
            category_matches = (
                search_lower in key.lower() or search_lower in cat["name"].lower()
            )

        units_list = []
        for unit_str in cat["units"]:
            try:
                symbol = get_unit_symbol(unit_str)
                name = get_unit_display_name(unit_str)

                # If searching, check if unit matches
                if search_lower and not category_matches:
                    unit_matches = (
                        search_lower in unit_str.lower()
                        or search_lower in symbol.lower()
                        or search_lower in name.lower()
                    )
                    if not unit_matches:
                        continue

                units_list.append(
                    {
                        "code": unit_str,
                        "symbol": symbol,
                        "name": name,
                        "is_base": unit_str == cat["base_unit"],
                    }
                )
            except (pint.UndefinedUnitError, pint.DimensionalityError):
                continue

        # Only include category if it has matching units or the category itself matches
        if units_list or (category_matches and not search_lower):
            # If category matches, include all units
            if category_matches and not units_list:
                # Re-fetch all units for this category
                for unit_str in cat["units"]:
                    try:
                        units_list.append(
                            {
                                "code": unit_str,
                                "symbol": get_unit_symbol(unit_str),
                                "name": get_unit_display_name(unit_str),
                                "is_base": unit_str == cat["base_unit"],
                            }
                        )
                    except (pint.UndefinedUnitError, pint.DimensionalityError):
                        continue

            if units_list:
                categories_list.append(
                    {
                        "key": key,
                        "name": cat["name"],
                        "base_unit": cat["base_unit"],
                        "units": units_list,
                    }
                )

    return categories_list


def validate_unit(unit_str: str) -> bool:
    """Check if a unit string is valid."""
    try:
        ureg.parse_expression(unit_str)
        return True
    except (pint.UndefinedUnitError, pint.DimensionalityError):
        return False
