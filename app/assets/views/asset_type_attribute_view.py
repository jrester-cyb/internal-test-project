from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Count
from drf_spectacular.utils import extend_schema, extend_schema_view
from ..models import (
    AssetTypeAttribute,
)
from ..serializers import AssetTypeAttributeSerializer


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
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_fields = ["asset_type", "attribute_type", "is_required"]
    search_fields = ["^name", "^api_key", "description"]
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
        """Filter attributes by parent asset type (without asset counts for performance)"""
        return AssetTypeAttribute.objects.filter(
            asset_type_id=self.kwargs["assettype_pk"]
        ).select_related("asset_type__workspace__organization")

    def perform_create(self, serializer):
        """Automatically set the asset_type when creating"""
        serializer.save(asset_type_id=self.kwargs["assettype_pk"])

    def perform_update(self, serializer):
        """Ensure asset_type remains set when updating"""
        serializer.save(asset_type_id=self.kwargs["assettype_pk"])

    def perform_destroy(self, instance):
        """Optimize deletion by using raw SQL and polymorphic_ctype to target specific tables"""
        from django.db import connection

        with connection.cursor() as cursor:
            # Find which polymorphic types are actually used and get their table names
            # Join with django_content_type to get the model name directly
            cursor.execute(
                """
                SELECT DISTINCT ct.model, ct.id
                FROM assets_baseattributevalue bav
                JOIN django_content_type ct ON bav.polymorphic_ctype_id = ct.id
                WHERE bav.attribute_type_attribute_id = %s
                """,
                [str(instance.id)],
            )

            # Delete from each child table that has data
            for model_name, ctype_id in cursor.fetchall():
                # Table name follows pattern: assets_{model_name}
                table_name = f"assets_{model_name}"
                cursor.execute(
                    f"""
                    DELETE FROM {table_name} 
                    WHERE baseattributevalue_ptr_id IN (
                        SELECT id FROM assets_baseattributevalue 
                        WHERE attribute_type_attribute_id = %s AND polymorphic_ctype_id = %s
                    )
                    """,
                    [str(instance.id), ctype_id],
                )

            # Now delete from the base table
            cursor.execute(
                "DELETE FROM assets_baseattributevalue WHERE attribute_type_attribute_id = %s",
                [str(instance.id)],
            )

        # Finally, delete the attribute definition itself
        instance.delete()

    @extend_schema(
        tags=["Asset Type Attributes"],
        summary="Get asset count for attribute",
        description="Returns the count of assets that have a value for this attribute",
    )
    @action(detail=True, methods=["get"], url_path="asset-count")
    def asset_count(self, request, pk=None, workspace_pk=None, assettype_pk=None):
        """Get count of assets with values for this attribute"""
        from ..models import BaseAttributeValue

        count = (
            BaseAttributeValue.objects.filter(asset_type_attribute_id=pk)
            .values("asset_id")
            .distinct()
            .count()
        )

        return Response({"count": count})

    @extend_schema(
        tags=["Asset Type Attributes"],
        summary="Bulk update attribute order",
        description="Updates the order field for multiple attributes at once",
        request={
            "application/json": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "string"},
                        "order": {"type": "integer"},
                    },
                    "required": ["id", "order"],
                },
            }
        },
    )
    @action(detail=False, methods=["post"], url_path="reorder")
    def reorder(self, request, workspace_pk=None, assettype_pk=None):
        """Bulk update attribute order"""
        from django.db import connection, transaction

        if not isinstance(request.data, list):
            return Response(
                {"error": "Expected a list of updates"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        updates = request.data
        attribute_ids = [update["id"] for update in updates]

        # Validate all updates belong to this asset type
        attributes = AssetTypeAttribute.objects.filter(
            id__in=attribute_ids, asset_type_id=assettype_pk
        )

        if attributes.count() != len(attribute_ids):
            return Response(
                {
                    "error": "One or more attributes not found or don't belong to this asset type"
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        # Update all orders using bulk_update in two steps to avoid unique constraint violations
        # Step 1: Set all to negative temporary values
        # Step 2: Set to final values
        with transaction.atomic():
            # Step 1: Set to negative temporary values
            objects_to_update = [
                AssetTypeAttribute(id=update["id"], order=-i)
                for i, update in enumerate(updates, 1)
            ]
            AssetTypeAttribute.objects.bulk_update(objects_to_update, ["order"])

            # Step 2: Set to final order values
            objects_to_update = [
                AssetTypeAttribute(id=update["id"], order=update["order"])
                for update in updates
            ]
            AssetTypeAttribute.objects.bulk_update(objects_to_update, ["order"])

        return Response({"success": True}, status=status.HTTP_200_OK)

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
