from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, extend_schema_view
from django.db import transaction
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
        ).order_by("order")

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

    @extend_schema(tags=["Asset Type Attribute Choices"])
    @action(detail=False, methods=["post"])
    def reorder(self, request, *args, **kwargs):
        """
        Reorder choices by updating their order field.
        Expects a list of objects with 'id' and 'order' fields.
        """
        updates = request.data
        if not isinstance(updates, list):
            return Response(
                {"error": "Expected a list of {id, order} objects"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        attribute_pk = self.kwargs["attribute_pk"]

        with transaction.atomic():
            # First, set all orders to negative temporary values to avoid unique constraint violations
            for i, update in enumerate(updates):
                choice_id = update.get("id")
                if choice_id is not None:
                    AssetTypeAttributeChoice.objects.filter(
                        pk=choice_id,
                        asset_type_attribute_id=attribute_pk,
                    ).update(order=-(i + 1))

            # Then set the final order values
            for update in updates:
                choice_id = update.get("id")
                new_order = update.get("order")
                if choice_id is not None and new_order is not None:
                    AssetTypeAttributeChoice.objects.filter(
                        pk=choice_id,
                        asset_type_attribute_id=attribute_pk,
                    ).update(order=new_order)

        return Response({"status": "ok"})
