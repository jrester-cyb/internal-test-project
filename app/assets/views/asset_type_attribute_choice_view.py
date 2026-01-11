from rest_framework import viewsets, filters, status
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, extend_schema_view
from ..models import AssetTypeAttributeChoice, AssetTypeAttribute
from ..serializers import (
    AssetTypeAttributeChoiceSerializer,
    AssetTypeAttributeChoiceWriteSerializer,
)


@extend_schema_view(
    list=extend_schema(tags=["Asset Type Attribute Choices"]),
    create=extend_schema(tags=["Asset Type Attribute Choices"]),
    retrieve=extend_schema(tags=["Asset Type Attribute Choices"]),
    update=extend_schema(tags=["Asset Type Attribute Choices"]),
    partial_update=extend_schema(tags=["Asset Type Attribute Choices"]),
    destroy=extend_schema(tags=["Asset Type Attribute Choices"]),
)
class AssetTypeAttributeChoiceViewSet(viewsets.ModelViewSet):
    """
    ViewSet for AssetTypeAttributeChoice model.

    Manage choices for asset type attributes.
    """

    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    search_fields = ["label"]
    ordering_fields = ["order", "label", "created_at"]

    def get_queryset(self):
        """Filter choices by parent asset type attribute"""
        return AssetTypeAttributeChoice.objects.filter(
            asset_type_attribute_id=self.kwargs["attribute_pk"]
        )

    def get_serializer_class(self):
        """Use write serializer for create/update, read serializer for others"""
        if self.action in ["create", "update", "partial_update"]:
            return AssetTypeAttributeChoiceWriteSerializer
        return AssetTypeAttributeChoiceSerializer

    def perform_create(self, serializer):
        """Automatically set the asset_type_attribute when creating"""
        asset_type_attribute = AssetTypeAttribute.objects.get(
            pk=self.kwargs["attribute_pk"]
        )
        serializer.save(asset_type_attribute=asset_type_attribute)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        # Return with read serializer
        output_serializer = AssetTypeAttributeChoiceSerializer(serializer.instance)
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        # Return with read serializer
        output_serializer = AssetTypeAttributeChoiceSerializer(instance)
        return Response(output_serializer.data)
