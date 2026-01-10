from rest_framework import viewsets, filters
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, extend_schema_view
from ..models import AssetAttributeDefinition
from ..serializers import AssetAttributeDefinitionSerializer


@extend_schema_view(
    list=extend_schema(tags=["Asset Field Definitions"]),
    create=extend_schema(tags=["Asset Field Definitions"]),
    retrieve=extend_schema(tags=["Asset Field Definitions"]),
    update=extend_schema(tags=["Asset Field Definitions"]),
    partial_update=extend_schema(tags=["Asset Field Definitions"]),
    destroy=extend_schema(tags=["Asset Field Definitions"]),
)
class AssetAttributeDefinitionViewSet(viewsets.ModelViewSet):
    """
    ViewSet for AssetAttributeDefinition model.

    Define custom fields for asset types.
    """

    serializer_class = AssetAttributeDefinitionSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["asset_type", "field_type", "is_required"]
    ordering_fields = ["order", "field_name", "created_at"]

    def get_queryset(self):
        """Filter field definitions by parent asset type"""
        return AssetAttributeDefinition.objects.filter(
            asset_type_id=self.kwargs["assettype_pk"]
        )

    def perform_create(self, serializer):
        """Automatically set the asset_type when creating"""
        serializer.save(asset_type_id=self.kwargs["assettype_pk"])
