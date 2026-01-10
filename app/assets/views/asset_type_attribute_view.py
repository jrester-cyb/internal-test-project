from rest_framework import viewsets, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, extend_schema_view
from ..models import AssetTypeAttribute, Asset
from ..serializers import AssetTypeAttributeSerializer


class AttributeValuesPagination(PageNumberPagination):
    page_size = 100
    page_size_query_param = "page_size"
    max_page_size = 1000


@extend_schema_view(
    list=extend_schema(tags=["Asset Type Attributes"]),
    create=extend_schema(tags=["Asset Type Attributes"]),
    retrieve=extend_schema(tags=["Asset Type Attributes"]),
    update=extend_schema(tags=["Asset Type Attributes"]),
    partial_update=extend_schema(tags=["Asset Type Attributes"]),
    destroy=extend_schema(tags=["Asset Type Attributes"]),
)
class AssetTypeAttributeViewSet(viewsets.ModelViewSet):
    """
    ViewSet for AssetTypeAttribute model.

    Define custom fields for asset types.
    """

    serializer_class = AssetTypeAttributeSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["asset_type", "attribute_type", "is_required"]
    ordering_fields = ["order", "name", "created_at"]

    LOOKUP_MAP = {
        "text": "textattributevalue__value",
        "number": "numberattributevalue__value",
        "boolean": "booleanattributevalue__value",
        "date": "dateattributevalue__value",
        "datetime": "datetimeattributevalue__value",
        "json": "jsonattributevalue__value",
    }

    def get_queryset(self):
        """Filter attributes by parent asset type"""
        return AssetTypeAttribute.objects.filter(
            asset_type_id=self.kwargs["assettype_pk"]
        )

    def perform_create(self, serializer):
        """Automatically set the asset_type when creating"""
        serializer.save(asset_type_id=self.kwargs["assettype_pk"])

    @extend_schema(
        tags=["Asset Type Attributes"],
        summary="Get distinct values for this attribute",
        description="Returns a list of unique values that exist for this attribute across all assets of this type",
    )
    @action(detail=True, methods=["get"])
    def values(self, request, assettype_pk=None, pk=None):
        """Get distinct values for this attribute definition"""
        asset_type_attribute = self.get_object()

        # Lookup field based on attribute type
        try:
            lookup_field = self.LOOKUP_MAP[asset_type_attribute.attribute_type]
        except KeyError as e:
            raise RuntimeError(
                f"Unsupported attribute type: {asset_type_attribute.attribute_type}"
            ) from e

        # Get all attribute values for this field definition
        values_qs = (
            asset_type_attribute.values.distinct(lookup_field)
            .only(lookup_field)
            .order_by(lookup_field)
            .values_list(lookup_field, flat=True)
        )

        # Paginate the results
        paginator = AttributeValuesPagination()
        page = paginator.paginate_queryset(values_qs, request)

        if page is not None:
            return paginator.get_paginated_response(page)
        return Response(values_qs)
