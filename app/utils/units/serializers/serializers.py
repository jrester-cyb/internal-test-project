from utils.units.helpers.unit_conversion import validate_unit
from rest_framework import serializers


class UnitSerializer(serializers.Serializer):
    """Serializer for a single unit."""

    code = serializers.CharField()
    symbol = serializers.CharField()
    name = serializers.CharField()
    is_base = serializers.BooleanField()


class UnitCategorySerializer(serializers.Serializer):
    """Serializer for a unit category with its units."""

    key = serializers.CharField()
    name = serializers.CharField()
    base_unit = serializers.CharField()
    units = UnitSerializer(many=True)


class UnitConvertSerializer(serializers.Serializer):
    """Serializer for unit conversion request and response."""

    value = serializers.FloatField()
    from_unit = serializers.CharField()
    to_unit = serializers.CharField()

    def validate_from_unit(self, value):
        if not validate_unit(value):
            raise serializers.ValidationError(f"Invalid from_unit: {value}")
        return value

    def validate_to_unit(self, value):
        if not validate_unit(value):
            raise serializers.ValidationError(f"Invalid to_unit: {value}")
        return value
