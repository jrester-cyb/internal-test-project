from rest_framework import viewsets, filters
from drf_spectacular.utils import extend_schema, extend_schema_view
from ..models import AssetType
from ..serializers import AssetTypeSerializer, AssetTypeSummarySerializer


@extend_schema_view(
    list=extend_schema(tags=["Asset Types"]),
    create=extend_schema(tags=["Asset Types"]),
    retrieve=extend_schema(tags=["Asset Types"]),
    update=extend_schema(tags=["Asset Types"]),
    partial_update=extend_schema(tags=["Asset Types"]),
    destroy=extend_schema(tags=["Asset Types"]),
)
class AssetTypeViewSet(viewsets.ModelViewSet):
    """
    ViewSet for AssetType model.

    Asset types define the schema for assets with custom fields.
    """

    serializer_class = AssetTypeSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name", "description"]
    ordering_fields = ["name", "created_at"]

    def get_queryset(self):
        """Optimize queryset based on action"""
        queryset = AssetType.objects.all()
        
        # For detail view, prefetch attributes
        if self.action == 'retrieve':
            queryset = queryset.prefetch_related('attributes')
        
        return queryset

    def get_serializer_class(self):
        """Use summary serializer for list view"""
        if self.action == "list":
            return AssetTypeSummarySerializer
        return AssetTypeSerializer
