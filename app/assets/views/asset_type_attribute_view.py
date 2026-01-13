from django.shortcuts import get_object_or_404
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError, PermissionDenied
from django_filters.rest_framework import DjangoFilterBackend
import django_filters
from django.db.models import (
    Q,
    Max,
    Subquery,
    OuterRef,
    F,
    Value,
    Case,
    When,
    IntegerField,
)
from django.db.models.functions import Coalesce
from django.db import transaction
from drf_spectacular.utils import extend_schema, extend_schema_view
from ..models import (
    GlobalAssetTypeAttribute,
    WorkspaceAttributeOverride,
    WorkspaceHiddenAttribute,
    WorkspaceExtensionAttribute,
    BaseAssetTypeAttribute,
    BaseAttributeValue,
    WorkspaceAsset,
)
from ..serializers import (
    AssetTypeAttributeSerializer,
    GlobalAssetTypeAttributeSerializer,
    WorkspaceExtensionAttributeSerializer,
    MergedAttributeSerializer,
)
from app.pagination import CustomPageNumberPagination


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
    ViewSet for managing asset type attributes.

    Handles the polymorphic attribute models:
    - GlobalAssetTypeAttribute: Base attributes visible to all workspaces
    - WorkspaceAttributeOverride: Workspace-specific overrides of global attributes
    - WorkspaceHiddenAttribute: Records of hidden global attributes per workspace
    - WorkspaceExtensionAttribute: Workspace-only extension attributes
    """

    serializer_class = AssetTypeAttributeSerializer
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
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
        """Return attributes for the list view."""
        queryset = BaseAssetTypeAttribute.objects.none()
        if self.kwargs.get("workspace_pk"):
            workspace_pk = self.kwargs["workspace_pk"]
            assettype_pk = self.kwargs["assettype_pk"]

            # Subquery to get IDs of global attributes that have overrides for this workspace
            overridden_globals = WorkspaceAttributeOverride.objects.filter(
                workspace_id=workspace_pk,
                asset_type_id=assettype_pk,
                base_attribute_id=OuterRef("id"),
            ).values("base_attribute_id")

            # Get global attributes (excluding those with overrides), overrides, and extensions
            queryset = BaseAssetTypeAttribute.objects.filter(
                Q(
                    asset_type_id=assettype_pk,
                    polymorphic_ctype__model="globalassettypeattribute",
                )
                | Q(
                    asset_type_id=assettype_pk,
                    workspaceattributeoverride__workspace_id=workspace_pk,
                )
                | Q(
                    asset_type_id=assettype_pk,
                    workspaceextensionattribute__workspace_id=workspace_pk,
                )
            ).exclude(
                polymorphic_ctype__model="globalassettypeattribute",
                id__in=Subquery(overridden_globals),
            )

            # Check if we should include hidden attributes (default: false)
            include_hidden = (
                self.request.query_params.get("include_hidden", "false").lower()
                == "true"
            )
            if not include_hidden:
                queryset = queryset.not_instance_of(WorkspaceHiddenAttribute)

            # Apply default ordering by order field from child models
            queryset = queryset.annotate(
                effective_order=Case(
                    When(
                        polymorphic_ctype__model="globalassettypeattribute",
                        then=F("globalassettypeattribute__order"),
                    ),
                    When(
                        polymorphic_ctype__model="workspaceattributeoverride",
                        then=Coalesce(
                            F("workspaceattributeoverride__order"),
                            F("workspaceattributeoverride__base_attribute__order"),
                        ),
                    ),
                    When(
                        polymorphic_ctype__model="workspaceextensionattribute",
                        then=F("workspaceextensionattribute__order"),
                    ),
                    default=Value(0),
                    output_field=IntegerField(),
                )
            ).order_by("effective_order", "created_at")

        return queryset

    def retrieve(self, request, *args, **kwargs):
        """Retrieve a single attribute by ID."""
        pk = self.kwargs["pk"]
        assettype_pk = self.kwargs["assettype_pk"]
        workspace_pk = self.kwargs.get("workspace_pk")

        # filter objects
        filter_args = {
            "id": pk,
            "asset_type_id": assettype_pk,
            "workspace_id": workspace_pk,
        }

        asset_type_attribute = get_object_or_404(
            BaseAssetTypeAttribute,
            **filter_args,
        )

        return Response(AssetTypeAttributeSerializer(asset_type_attribute).data)

    def create(self, request, *args, **kwargs):
        """
        Create a new attribute.

        - Via workspace endpoint: creates a WorkspaceExtensionAttribute
        - Via non-workspace endpoint: creates a GlobalAssetTypeAttribute
        """
        assettype_pk = self.kwargs["assettype_pk"]
        workspace_pk = self.kwargs.get("workspace_pk")

        if workspace_pk:
            # Create workspace extension
            serializer = WorkspaceExtensionAttributeSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            instance = serializer.save(
                asset_type_id=assettype_pk,
                workspace_id=workspace_pk,
            )
            return Response(
                AssetTypeAttributeSerializer(instance).data,
                status=status.HTTP_201_CREATED,
            )
        else:
            # Create global attribute
            serializer = GlobalAssetTypeAttributeSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            instance = serializer.save(asset_type_id=assettype_pk)
            return Response(
                AssetTypeAttributeSerializer(instance).data,
                status=status.HTTP_201_CREATED,
            )

    def update(self, request, *args, **kwargs):
        """
        Update an attribute.

        - Global attribute via workspace endpoint: creates/updates WorkspaceAttributeOverride
        - Global attribute via non-workspace endpoint: updates the global attribute directly
        - Override: updates the override
        - Extension: updates the extension
        """
        pk = self.kwargs["pk"]
        assettype_pk = self.kwargs["assettype_pk"]
        workspace_pk = self.kwargs.get("workspace_pk")
        partial = kwargs.pop("partial", False)

        # Find the attribute
        global_attr = GlobalAssetTypeAttribute.objects.filter(
            id=pk, asset_type_id=assettype_pk
        ).first()

        if global_attr:
            if workspace_pk:
                # Create or update workspace override
                override, created = WorkspaceAttributeOverride.objects.get_or_create(
                    base_attribute=global_attr,
                    workspace_id=workspace_pk,
                    asset_type_id=assettype_pk,
                    defaults={"deleted_at": None},
                )
                # Restore if soft-deleted
                if override.deleted_at is not None:
                    override.deleted_at = None

                # Update override fields
                for field in [
                    "name",
                    "is_required",
                    "default_value",
                    "description",
                    "tags",
                    "order",
                ]:
                    if field in request.data:
                        setattr(override, field, request.data[field])
                override.save()

                data = {
                    "id": override.id,
                    "asset_type_id": global_attr.asset_type_id,
                    "workspace_id": workspace_pk,
                    "workspace_name": override.workspace.name,
                    "attribute_kind": "override",
                    "is_override": True,
                    "is_extension": False,
                    "is_hidden": WorkspaceHiddenAttribute.objects.filter(
                        hidden_attribute=global_attr,
                        workspace_id=workspace_pk,
                    ).exists(),
                    "base_attribute_id": global_attr.id,
                    "name": override.name or global_attr.name,
                    "api_key": global_attr.api_key,
                    "attribute_type": global_attr.attribute_type,
                    "is_required": (
                        override.is_required
                        if override.is_required is not None
                        else global_attr.is_required
                    ),
                    "default_value": (
                        override.default_value
                        if override.default_value is not None
                        else global_attr.default_value
                    ),
                    "description": (
                        override.description
                        if override.description is not None
                        else global_attr.description
                    ),
                    "tags": (
                        override.tags if override.tags is not None else global_attr.tags
                    ),
                    "order": (
                        override.order
                        if override.order is not None
                        else global_attr.order
                    ),
                    "created_at": global_attr.created_at,
                    "updated_at": override.updated_at,
                }
                return Response(MergedAttributeSerializer(data).data)
            else:
                # Update global attribute directly
                serializer = GlobalAssetTypeAttributeSerializer(
                    global_attr, data=request.data, partial=partial
                )
                serializer.is_valid(raise_exception=True)
                serializer.save()
                global_attr.refresh_from_db()

                data = {
                    "id": global_attr.id,
                    "asset_type_id": global_attr.asset_type_id,
                    "workspace_id": None,
                    "workspace_name": None,
                    "attribute_kind": "global",
                    "is_override": False,
                    "is_extension": False,
                    "is_hidden": False,
                    "base_attribute_id": None,
                    "name": global_attr.name,
                    "api_key": global_attr.api_key,
                    "attribute_type": global_attr.attribute_type,
                    "is_required": global_attr.is_required,
                    "default_value": global_attr.default_value,
                    "description": global_attr.description,
                    "tags": global_attr.tags or [],
                    "order": global_attr.order,
                    "created_at": global_attr.created_at,
                    "updated_at": global_attr.updated_at,
                }
                return Response(MergedAttributeSerializer(data).data)

        # Check if it's an override
        override = (
            WorkspaceAttributeOverride.objects.filter(id=pk, asset_type_id=assettype_pk)
            .select_related("base_attribute", "workspace")
            .first()
        )

        if override:
            for field in [
                "name",
                "is_required",
                "default_value",
                "description",
                "tags",
                "order",
            ]:
                if field in request.data:
                    setattr(override, field, request.data[field])
            override.save()

            base = override.base_attribute
            data = {
                "id": override.id,
                "asset_type_id": override.asset_type_id,
                "workspace_id": override.workspace_id,
                "workspace_name": override.workspace.name,
                "attribute_kind": "override",
                "is_override": True,
                "is_extension": False,
                "is_hidden": False,
                "base_attribute_id": base.id,
                "name": override.name or base.name,
                "api_key": base.api_key,
                "attribute_type": base.attribute_type,
                "is_required": (
                    override.is_required
                    if override.is_required is not None
                    else base.is_required
                ),
                "default_value": (
                    override.default_value
                    if override.default_value is not None
                    else base.default_value
                ),
                "description": (
                    override.description
                    if override.description is not None
                    else base.description
                ),
                "tags": override.tags if override.tags is not None else base.tags,
                "order": override.order if override.order is not None else base.order,
                "created_at": base.created_at,
                "updated_at": override.updated_at,
            }
            return Response(MergedAttributeSerializer(data).data)

        # Check if it's an extension
        extension = (
            WorkspaceExtensionAttribute.objects.filter(
                id=pk, asset_type_id=assettype_pk
            )
            .select_related("workspace")
            .first()
        )

        if extension:
            serializer = WorkspaceExtensionAttributeSerializer(
                extension, data=request.data, partial=partial
            )
            serializer.is_valid(raise_exception=True)
            serializer.save()
            extension.refresh_from_db()

            is_hidden = WorkspaceHiddenAttribute.objects.filter(
                hidden_attribute_id=pk,
                workspace_id=workspace_pk,
            ).exists()

            data = {
                "id": extension.id,
                "asset_type_id": extension.asset_type_id,
                "workspace_id": extension.workspace_id,
                "workspace_name": extension.workspace.name,
                "attribute_kind": "extension",
                "is_override": False,
                "is_extension": True,
                "is_hidden": is_hidden,
                "base_attribute_id": None,
                "name": extension.name,
                "api_key": extension.api_key,
                "attribute_type": extension.attribute_type,
                "is_required": extension.is_required,
                "default_value": extension.default_value,
                "description": extension.description,
                "tags": extension.tags or [],
                "order": extension.order,
                "created_at": extension.created_at,
                "updated_at": extension.updated_at,
            }
            return Response(MergedAttributeSerializer(data).data)

        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    def partial_update(self, request, *args, **kwargs):
        """Handle PATCH requests."""
        kwargs["partial"] = True
        return self.update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        """
        Delete an attribute.

        - Global attribute via workspace endpoint: not allowed (use hide instead)
        - Global attribute via non-workspace endpoint: deletes the global attribute
        - Override: deletes the override (reverts to global)
        - Extension: deletes the extension
        """
        pk = self.kwargs["pk"]
        assettype_pk = self.kwargs["assettype_pk"]
        workspace_pk = self.kwargs.get("workspace_pk")

        # Check if it's a global attribute
        global_attr = GlobalAssetTypeAttribute.objects.filter(
            id=pk, asset_type_id=assettype_pk
        ).first()

        if global_attr:
            if workspace_pk:
                raise PermissionDenied(
                    "Cannot delete a global attribute from a workspace. "
                    "Use the hide action instead."
                )
            global_attr.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        # Check if it's an override
        override = WorkspaceAttributeOverride.objects.filter(
            id=pk, asset_type_id=assettype_pk
        ).first()

        if override:
            override.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        # Check if it's an extension
        extension = WorkspaceExtensionAttribute.objects.filter(
            id=pk, asset_type_id=assettype_pk
        ).first()

        if extension:
            extension.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    @extend_schema(
        tags=["Asset Type Attributes"],
        summary="Hide attribute for this workspace",
    )
    @action(detail=True, methods=["post"], url_path="hide")
    def hide(self, request, pk=None, workspace_pk=None, assettype_pk=None):
        """Hide an attribute for this workspace."""
        if not workspace_pk:
            return Response(
                {"error": "Hide action is only available via workspace endpoint"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Get the base attribute (works for all polymorphic types)
        base_attr = BaseAssetTypeAttribute.objects.filter(
            id=pk, asset_type_id=assettype_pk
        ).first()

        if not base_attr:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        # Get the real polymorphic instance
        real_instance = base_attr.get_real_instance()

        # Determine which attribute to hide
        if isinstance(real_instance, WorkspaceAttributeOverride):
            # For overrides, hide the underlying global attribute
            attr_to_hide = real_instance.base_attribute
        else:
            # For global and extension attributes, hide themselves
            attr_to_hide = real_instance

        # Create hidden record
        WorkspaceHiddenAttribute.objects.get_or_create(
            hidden_attribute=attr_to_hide,
            workspace_id=workspace_pk,
            asset_type_id=assettype_pk,
            defaults={"deleted_at": None},
        )

        return Response(
            data=AssetTypeAttributeSerializer(attr_to_hide).data,
            status=status.HTTP_200_OK,
        )

    @extend_schema(
        tags=["Asset Type Attributes"],
        summary="Unhide attribute for this workspace",
    )
    @action(detail=True, methods=["post"], url_path="unhide")
    def unhide(self, request, pk=None, workspace_pk=None, assettype_pk=None):
        """Unhide an attribute for this workspace."""
        if not workspace_pk:
            return Response(
                {"error": "Unhide action is only available via workspace endpoint"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        base_attr = get_object_or_404(
            BaseAssetTypeAttribute,
            id=pk,
            asset_type_id=assettype_pk,
        )

        # Get the real polymorphic instance
        real_instance = base_attr.get_real_instance()

        # Determine which attribute to unhide
        if isinstance(real_instance, WorkspaceAttributeOverride):
            # For overrides, unhide the underlying global attribute
            attr_to_unhide = real_instance.base_attribute
        else:
            # For global and extension attributes, unhide themselves
            attr_to_unhide = real_instance

        # Remove hidden record
        WorkspaceHiddenAttribute.objects.filter(
            hidden_attribute=attr_to_unhide,
            workspace_id=workspace_pk,
        ).force_delete()

        return Response(
            data=AssetTypeAttributeSerializer(attr_to_unhide).data,
            status=status.HTTP_200_OK,
        )

    @extend_schema(
        tags=["Asset Type Attributes"],
        summary="Get all unique tags",
    )
    @action(detail=False, methods=["get"], url_path="tags")
    def tags(self, request, workspace_pk=None, assettype_pk=None):
        """Get all unique tags used in attributes."""
        all_tags = set()

        # Tags from global attributes
        for attr in GlobalAssetTypeAttribute.objects.filter(asset_type_id=assettype_pk):
            if attr.tags:
                all_tags.update(attr.tags)

        # Tags from workspace overrides
        if workspace_pk:
            for override in WorkspaceAttributeOverride.objects.filter(
                asset_type_id=assettype_pk,
                workspace_id=workspace_pk,
            ):
                if override.tags:
                    all_tags.update(override.tags)

            # Tags from extensions
            for ext in WorkspaceExtensionAttribute.objects.filter(
                asset_type_id=assettype_pk,
                workspace_id=workspace_pk,
            ):
                if ext.tags:
                    all_tags.update(ext.tags)

        return Response(sorted(all_tags))

    @extend_schema(
        tags=["Asset Type Attributes"],
        summary="Get asset count for attribute",
    )
    @action(detail=True, methods=["get"], url_path="asset-count")
    def asset_count(self, request, pk=None, workspace_pk=None, assettype_pk=None):
        """Get count of assets with values for this attribute."""
        # For global attributes, we need to find by pk
        # For overrides, we need to use the base_attribute_id
        attribute_id = pk

        # Check if this is an override - if so, use base_attribute_id for the count
        override = WorkspaceAttributeOverride.objects.filter(id=pk).first()
        if override:
            attribute_id = override.base_attribute_id

        if workspace_pk:
            workspace_asset_ids = WorkspaceAsset.objects.filter(
                workspace_id=workspace_pk
            ).values_list("asset_id", flat=True)

            count = (
                BaseAttributeValue.objects.filter(
                    asset_type_attribute_id=attribute_id,
                    asset_id__in=workspace_asset_ids,
                )
                .values("asset_id")
                .distinct()
                .count()
            )
        else:
            count = (
                BaseAttributeValue.objects.filter(asset_type_attribute_id=attribute_id)
                .values("asset_id")
                .distinct()
                .count()
            )

        return Response({"count": count})

    @extend_schema(
        tags=["Asset Type Attributes"],
        summary="Bulk update attribute order",
    )
    @action(detail=False, methods=["post"], url_path="reorder")
    def reorder(self, request, workspace_pk=None, assettype_pk=None):
        """Bulk update attribute order."""
        if not isinstance(request.data, list):
            return Response(
                {"error": "Expected a list of updates"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            for update in request.data:
                attr_id = update.get("id")
                new_order = update.get("order")

                if attr_id is None or new_order is None:
                    continue

                # Try global attribute
                global_attr = GlobalAssetTypeAttribute.objects.filter(
                    id=attr_id, asset_type_id=assettype_pk
                ).first()

                if global_attr:
                    if workspace_pk:
                        # Create/update override with new order
                        override, _ = WorkspaceAttributeOverride.objects.get_or_create(
                            base_attribute=global_attr,
                            workspace_id=workspace_pk,
                            asset_type_id=assettype_pk,
                            defaults={"deleted_at": None},
                        )
                        override.order = new_order
                        override.save()
                    else:
                        global_attr.order = new_order
                        global_attr.save()
                    continue

                # Try override
                override = WorkspaceAttributeOverride.objects.filter(
                    id=attr_id, asset_type_id=assettype_pk
                ).first()
                if override:
                    override.order = new_order
                    override.save()
                    continue

                # Try extension
                extension = WorkspaceExtensionAttribute.objects.filter(
                    id=attr_id, asset_type_id=assettype_pk
                ).first()
                if extension:
                    extension.order = new_order
                    extension.save()

        return Response({"success": True})

    @extend_schema(
        tags=["Asset Type Attributes"],
        summary="Get distinct values for this attribute",
    )
    @action(detail=True, methods=["get"])
    def values(self, request, assettype_pk=None, pk=None, workspace_pk=None):
        """Get distinct values for this attribute."""
        # Find the attribute to get its type
        global_attr = GlobalAssetTypeAttribute.objects.filter(
            id=pk, asset_type_id=assettype_pk
        ).first()

        attribute_type = None
        attribute_id = pk

        if global_attr:
            attribute_type = global_attr.attribute_type
        else:
            # Check override
            override = (
                WorkspaceAttributeOverride.objects.filter(id=pk)
                .select_related("base_attribute")
                .first()
            )
            if override:
                attribute_type = override.base_attribute.attribute_type
                attribute_id = override.base_attribute_id
            else:
                # Check extension
                extension = WorkspaceExtensionAttribute.objects.filter(id=pk).first()
                if extension:
                    attribute_type = extension.attribute_type

        if not attribute_type:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        lookup_field = self.LOOKUP_MAP.get(attribute_type)
        if not lookup_field:
            return Response(
                {"error": f"Unsupported attribute type: {attribute_type}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        values_qs = (
            BaseAttributeValue.objects.filter(asset_type_attribute_id=attribute_id)
            .distinct(lookup_field)
            .only(lookup_field)
            .order_by(lookup_field)
            .values_list(lookup_field, flat=True)
        )

        paginator = CustomPageNumberPagination()
        page = paginator.paginate_queryset(values_qs, request)

        if page is not None:
            return paginator.get_paginated_response(page)
        return Response(list(values_qs))
