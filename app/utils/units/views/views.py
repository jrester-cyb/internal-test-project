"""Views for utility endpoints."""

from rest_framework.views import APIView
from rest_framework.generics import ListAPIView
from rest_framework.response import Response
from rest_framework import status
from ..serializers import UnitCategorySerializer, UnitConvertSerializer

from ..helpers.unit_conversion import (
    get_categories_for_api,
    convert_value,
)
from pint.errors import DimensionalityError


class UnitCategoriesView(ListAPIView):
    """
    GET: List all available unit categories and their units.

    Query Parameters:
        search: Filter categories and units by name, code, or symbol
    """

    serializer_class = UnitCategorySerializer

    def get_queryset(self):
        """Return unit categories as a list, optionally filtered by search term."""
        search = self.request.query_params.get("search", None)
        return get_categories_for_api(search=search)


class UnitConvertView(APIView):
    """
    POST: Convert a value from one unit to another.

    Request body:
    {
        "value": 5,
        "from_unit": "kg",
        "to_unit": "lb"
    }

    Response:
    {
        "value": 11.0231,
        "from_unit": "kg",
        "to_unit": "lb"
    }
    """

    def post(self, request):
        """Convert a value between units."""

        serializer = UnitConvertSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        value = serializer.validated_data["value"]
        from_unit = serializer.validated_data["from_unit"]
        to_unit = serializer.validated_data["to_unit"]

        try:
            converted = convert_value(value, from_unit, to_unit)
            return Response(
                {
                    "value": converted,
                    "from_unit": from_unit,
                    "to_unit": to_unit,
                }
            )
        # Catch invalid unit errors
        except DimensionalityError as ve:
            return Response(
                {"error": str(ve)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Catch general exceptions from conversion failures
        except Exception as e:
            print(e.__class__)
            return Response(
                {"error": f"Conversion failed: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
