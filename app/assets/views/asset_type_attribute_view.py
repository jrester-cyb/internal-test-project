from django.shortcuts import get_object_or_404
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import (
    Q,
    Subquery,
    OuterRef,
    F,
    Value,
    Case,
    When,
    IntegerField,
)
from django.db import transaction
from drf_spectacular.utils import extend_schema, extend_schema_view
from ..models import (
    GlobalAssetTypeAttribute,
    WorkspaceOverrideAssetTypeAttribute,
    WorkspaceHiddenAttribute,
    WorkspaceLocalAssetTypeAttribute,
    WorkspaceAssetTypeConfig,
    BaseAssetTypeAttribute,
    BaseAttributeValue,
    WorkspaceAsset,
)
from ..serializers import (
    AssetTypeAttributeSerializer,
    GlobalAssetTypeAttributeSerializer,
    WorkspaceLocalAssetTypeAttributeSerializer,
    WorkspaceAssetTypeConfigSerializer,
)
from ..filters import PolymorphicSearchFilter, ScopeFilter, TagsFilter
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
    - WorkspaceOverrideAssetTypeAttribute: Workspace-specific overrides of global attributes
    - WorkspaceHiddenAttribute: Records of hidden global attributes per workspace
    - WorkspaceLocalAssetTypeAttribute: Workspace-only extension attributes
    """

    serializer_class = AssetTypeAttributeSerializer
    filter_backends = [
        DjangoFilterBackend,
        PolymorphicSearchFilter,
        ScopeFilter,
        TagsFilter,
        filters.OrderingFilter,
    ]
    # Search fields for polymorphic child models
    polymorphic_search_fields = {
        "GlobalAssetTypeAttribute": ["^name", "^api_key", "description"],
        "WorkspaceOverrideAssetTypeAttribute": ["^name", "^api_key", "description"],
        "WorkspaceLocalAssetTypeAttribute": ["^name", "^api_key", "description"],
    }
    ordering_fields = [
        "effective_order",
        "created_at",
    ]

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
            overridden_globals = WorkspaceOverrideAssetTypeAttribute.objects.filter(
                workspace_id=workspace_pk,
                asset_type_id=assettype_pk,
                base_attribute_id=OuterRef("id"),
            ).values("base_attribute_id")

            # Get global attributes (excluding those with overrides), overrides, and extensions
            # Django-polymorphic automatically fetches child model data via JOINs
            queryset = BaseAssetTypeAttribute.objects.filter(
                Q(
                    asset_type_id=assettype_pk,
                    polymorphic_ctype__model="globalassettypeattribute",
                )
                | Q(
                    asset_type_id=assettype_pk,
                    workspaceoverrideassettypeattribute__workspace_id=workspace_pk,
                )
                | Q(
                    asset_type_id=assettype_pk,
                    workspacelocalassettypeattribute__workspace_id=workspace_pk,
                )
            ).exclude(
                polymorphic_ctype__model="globalassettypeattribute",
                id__in=Subquery(overridden_globals),
            )

            # Hidden attributes are always included - the UI handles visibility
            # The is_hidden field in the serializer indicates hidden status

            # Build ordering annotation
            # Try workspace-specific order first, fall back to global order
            try:
                config = WorkspaceAssetTypeConfig.objects.get(
                    workspace_id=workspace_pk,
                    asset_type_id=assettype_pk,
                )
                if config.attribute_order:
                    # Build Case/When for workspace ordering
                    # For each UUID in the config, we match by:
                    # - Direct ID match (for globals, extensions, and overrides stored by their own ID)
                    # - OR base_attribute_id match (for overrides when config has the global ID)
                    order_cases = []
                    for idx, item in enumerate(config.attribute_order):
                        # Handle various formats:
                        # - dict: {"id": "uuid", "order": 0} (legacy format)
                        # - string that looks like dict: "{'id': 'uuid', 'order': 0}" (corrupted data)
                        # - plain UUID string: "uuid"
                        if isinstance(item, dict):
                            attr_id = item.get("id", "")
                        elif isinstance(item, str) and item.startswith("{"):
                            # Parse string that looks like a dict
                            import ast

                            try:
                                parsed = ast.literal_eval(item)
                                attr_id = (
                                    parsed.get("id", "")
                                    if isinstance(parsed, dict)
                                    else str(item)
                                )
                            except (ValueError, SyntaxError):
                                attr_id = str(item)
                        else:
                            attr_id = str(item)
                        # Match either the object's own ID or the base_attribute_id for overrides
                        order_cases.append(
                            When(
                                Q(id=attr_id)
                                | Q(
                                    workspaceoverrideassettypeattribute__base_attribute_id=attr_id
                                ),
                                then=Value(idx),
                            )
                        )

                    queryset = queryset.annotate(
                        effective_order=Case(
                            *order_cases,
                            default=Value(999999),
                            output_field=IntegerField(),
                        )
                    ).order_by("effective_order", "created_at")
                else:
                    # Config exists but no order - fall back to global
                    queryset = self._annotate_global_order(queryset)
            except WorkspaceAssetTypeConfig.DoesNotExist:
                # No workspace config - fall back to global ordering
                queryset = self._annotate_global_order(queryset)

            # Prefetch related objects to avoid N+1 queries
            from django.db.models import Prefetch

            # Prefetch hidden attribute records for this workspace
            hidden_qs = WorkspaceHiddenAttribute.objects.filter(
                workspace_id=workspace_pk,
                deleted_at__isnull=True,
            )

            # For polymorphic querysets, we can only prefetch relations that exist on all models
            # or on the base model. hidden_in_workspaces exists on GlobalAssetTypeAttribute,
            # workspace exists on Override and Local, base_attribute only on Override.
            # We'll use select_related on polymorphic_ctype and handle the rest in serializers
            # by caching lookups in context.
            queryset = queryset.select_related(
                "polymorphic_ctype",
            )

        return queryset

    def get_serializer_context(self):
        """Add cached data to serializer context for performance."""
        context = super().get_serializer_context()

        # Get workspace_pk from URL kwargs
        workspace_pk = self.kwargs.get("workspace_pk")
        if workspace_pk:
            # Cache hidden global attribute IDs (1 query)
            context["hidden_global_ids"] = set(
                WorkspaceHiddenAttribute.objects.filter(
                    workspace_id=workspace_pk,
                    deleted_at__isnull=True,
                ).values_list("hidden_attribute_id", flat=True)
            )

            # Cache the workspace name (1 query)
            from workspaces.models import Workspace

            try:
                workspace = Workspace.objects.get(pk=workspace_pk)
                context["workspace_name"] = workspace.name
            except Workspace.DoesNotExist:
                context["workspace_name"] = None

            # Cache all global attributes for this asset type (for override base_attribute lookups)
            assettype_pk = self.kwargs.get("assettype_pk")
            if assettype_pk:
                global_attrs = GlobalAssetTypeAttribute.objects.filter(
                    asset_type_id=assettype_pk
                )
                context["global_attributes_by_id"] = {
                    str(attr.id): attr for attr in global_attrs
                }

        return context

    def _annotate_global_order(self, queryset):
        """Annotate queryset with global ordering (from GlobalAssetTypeAttribute.order)."""
        return queryset.annotate(
            effective_order=Case(
                When(
                    polymorphic_ctype__model="globalassettypeattribute",
                    then=F("globalassettypeattribute__order"),
                ),
                When(
                    polymorphic_ctype__model="workspaceoverrideassettypeattribute",
                    then=F(
                        "workspaceoverrideassettypeattribute__base_attribute__order"
                    ),
                ),
                When(
                    polymorphic_ctype__model="workspacelocalassettypeattribute",
                    then=Value(999999),  # Extensions at end when no custom order
                ),
                default=Value(0),
                output_field=IntegerField(),
            )
        ).order_by("effective_order", "created_at")

    def _update_config_for_override(self, workspace_pk, assettype_pk, old_id, new_id):
        """Update WorkspaceAssetTypeConfig to replace old attribute ID with new override ID."""
        try:
            config = WorkspaceAssetTypeConfig.objects.get(
                workspace_id=workspace_pk,
                asset_type_id=assettype_pk,
            )
            if config.attribute_order:
                # Replace old_id with new_id in the order list
                new_order = []
                for item in config.attribute_order:
                    if isinstance(item, dict):
                        # Old format: {"id": "uuid", "order": 0}
                        if str(item.get("id", "")) == old_id:
                            new_order.append(
                                {"id": new_id, "order": item.get("order", 0)}
                            )
                        else:
                            new_order.append(item)
                    else:
                        # New format: just UUID string
                        if str(item) == old_id:
                            new_order.append(new_id)
                        else:
                            new_order.append(item)
                config.attribute_order = new_order
                config.save()
        except WorkspaceAssetTypeConfig.DoesNotExist:
            pass

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

        - Via workspace endpoint: creates a WorkspaceLocalAssetTypeAttribute
        - Via non-workspace endpoint: creates a GlobalAssetTypeAttribute
        """
        assettype_pk = self.kwargs["assettype_pk"]
        workspace_pk = self.kwargs.get("workspace_pk")

        if workspace_pk:
            # Create workspace extension
            serializer = WorkspaceLocalAssetTypeAttributeSerializer(data=request.data)
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

        - Global attribute via workspace endpoint: creates/updates WorkspaceOverrideAssetTypeAttribute
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
                # Check for existing override (including soft-deleted)
                try:
                    override = WorkspaceOverrideAssetTypeAttribute.all_objects.get(
                        base_attribute=global_attr,
                        workspace_id=workspace_pk,
                    )
                    # Restore if soft-deleted
                    if override.deleted_at is not None:
                        override.deleted_at = None
                        override.save()
                except WorkspaceOverrideAssetTypeAttribute.DoesNotExist:
                    # Create new override
                    override = WorkspaceOverrideAssetTypeAttribute.objects.create(
                        base_attribute=global_attr,
                        workspace_id=workspace_pk,
                        asset_type_id=assettype_pk,
                    )
                    # Update WorkspaceAssetTypeConfig to replace global attr ID with override ID
                    self._update_config_for_override(
                        workspace_pk,
                        assettype_pk,
                        str(global_attr.id),
                        str(override.id),
                    )

                # Update override fields
                for field in [
                    "name",
                    "is_required",
                    "default_value",
                    "description",
                    "tags",
                ]:
                    if field in request.data:
                        setattr(override, field, request.data[field])
                override.save()

                return Response(
                    AssetTypeAttributeSerializer(
                        override, context={"request": request}
                    ).data
                )
            else:
                # Update global attribute directly
                serializer = GlobalAssetTypeAttributeSerializer(
                    global_attr, data=request.data, partial=partial
                )
                serializer.is_valid(raise_exception=True)
                serializer.save()
                global_attr.refresh_from_db()

                return Response(
                    AssetTypeAttributeSerializer(
                        global_attr, context={"request": request}
                    ).data
                )

        # Check if it's an override
        override = (
            WorkspaceOverrideAssetTypeAttribute.objects.filter(
                id=pk, asset_type_id=assettype_pk
            )
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
            ]:
                if field in request.data:
                    setattr(override, field, request.data[field])
            override.save()

            return Response(
                AssetTypeAttributeSerializer(
                    override, context={"request": request}
                ).data
            )

        # Check if it's an extension
        extension = (
            WorkspaceLocalAssetTypeAttribute.objects.filter(
                id=pk, asset_type_id=assettype_pk
            )
            .select_related("workspace")
            .first()
        )

        if extension:
            serializer = WorkspaceLocalAssetTypeAttributeSerializer(
                extension, data=request.data, partial=partial
            )
            serializer.is_valid(raise_exception=True)
            serializer.save()
            extension.refresh_from_db()

            return Response(
                AssetTypeAttributeSerializer(
                    extension, context={"request": request}
                ).data
            )

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
        override = WorkspaceOverrideAssetTypeAttribute.objects.filter(
            id=pk, asset_type_id=assettype_pk
        ).first()

        if override:
            # Update the config to replace override UUID with global UUID
            if workspace_pk:
                global_attr_id = str(override.global_attribute_id)
                override_id = str(override.id)
                self._update_config_for_override(
                    workspace_pk, assettype_pk, override_id, global_attr_id
                )
            override.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        # Check if it's an extension
        extension = WorkspaceLocalAssetTypeAttribute.objects.filter(
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
        if isinstance(real_instance, WorkspaceOverrideAssetTypeAttribute):
            # For overrides, hide the underlying global attribute
            attr_to_hide = real_instance.base_attribute
        else:
            # For global and extension attributes, hide themselves
            attr_to_hide = real_instance

        # Create or restore hidden record (check for soft-deleted records)
        try:
            hidden_record = WorkspaceHiddenAttribute.all_objects.get(
                hidden_attribute=attr_to_hide,
                workspace_id=workspace_pk,
            )
            # Restore if soft-deleted
            if hidden_record.deleted_at is not None:
                hidden_record.deleted_at = None
                hidden_record.save()
        except WorkspaceHiddenAttribute.DoesNotExist:
            WorkspaceHiddenAttribute.objects.create(
                hidden_attribute=attr_to_hide,
                workspace_id=workspace_pk,
                asset_type_id=assettype_pk,
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
        if isinstance(real_instance, WorkspaceOverrideAssetTypeAttribute):
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

        # Return the actual instance that was unhidden (override, not base attribute)
        return Response(
            data=AssetTypeAttributeSerializer(real_instance).data,
            status=status.HTTP_200_OK,
        )

    @extend_schema(
        tags=["Asset Type Attributes"],
        summary="Get global definition for an override",
    )
    @action(detail=True, methods=["get"], url_path="global-definition")
    def global_definition(self, request, pk=None, workspace_pk=None, assettype_pk=None):
        """Get the global (base) definition for an override attribute."""
        override = WorkspaceOverrideAssetTypeAttribute.objects.filter(id=pk).first()
        if not override:
            return Response(
                {"detail": "Not an override attribute"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            GlobalAssetTypeAttributeSerializer(override.base_attribute).data,
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
            for override in WorkspaceOverrideAssetTypeAttribute.objects.filter(
                asset_type_id=assettype_pk,
                workspace_id=workspace_pk,
            ):
                if override.tags:
                    all_tags.update(override.tags)

            # Tags from extensions
            for ext in WorkspaceLocalAssetTypeAttribute.objects.filter(
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
        override = WorkspaceOverrideAssetTypeAttribute.objects.filter(id=pk).first()
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
        summary="Update attribute ordering",
    )
    @action(detail=False, methods=["post", "get"], url_path="reorder")
    def reorder(self, request, workspace_pk=None, assettype_pk=None):
        """
        Get or update attribute ordering.

        For workspace endpoints:
        - GET: Returns the current attribute order (from WorkspaceAssetTypeConfig or default)
        - POST: Updates the workspace-specific attribute order in WorkspaceAssetTypeConfig

        For non-workspace endpoints:
        - GET: Returns global attribute order
        - POST: Updates GlobalAssetTypeAttribute.order for each attribute

        POST body should be a list of attribute UUIDs in the desired order:
        ["uuid1", "uuid2", "uuid3", ...]
        """
        if request.method == "GET":
            if workspace_pk:
                # Return workspace-specific order or default
                try:
                    config = WorkspaceAssetTypeConfig.objects.get(
                        workspace_id=workspace_pk,
                        asset_type_id=assettype_pk,
                    )
                    return Response(
                        {
                            "attribute_order": config.attribute_order,
                            "is_custom": True,
                        }
                    )
                except WorkspaceAssetTypeConfig.DoesNotExist:
                    # Return default order based on global attributes
                    global_attrs = (
                        GlobalAssetTypeAttribute.objects.filter(
                            asset_type_id=assettype_pk
                        )
                        .order_by("order")
                        .values_list("id", flat=True)
                    )
                    return Response(
                        {
                            "attribute_order": [str(id) for id in global_attrs],
                            "is_custom": False,
                        }
                    )
            else:
                # Return global attribute order
                global_attrs = (
                    GlobalAssetTypeAttribute.objects.filter(asset_type_id=assettype_pk)
                    .order_by("order")
                    .values_list("id", "order")
                )
                return Response(
                    {
                        "attribute_order": [
                            {"id": str(id), "order": order}
                            for id, order in global_attrs
                        ]
                    }
                )

        # POST - update ordering
        if not isinstance(request.data, list):
            return Response(
                {"error": "Expected a list of attribute UUIDs in desired order"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        attribute_order = [str(item) for item in request.data]

        with transaction.atomic():
            if workspace_pk:
                # Simply save the order as provided - UI sends all attributes including hidden
                config, _ = WorkspaceAssetTypeConfig.objects.update_or_create(
                    workspace_id=workspace_pk,
                    asset_type_id=assettype_pk,
                    defaults={"attribute_order": attribute_order},
                )
                return Response(
                    WorkspaceAssetTypeConfigSerializer(config).data,
                    status=status.HTTP_200_OK,
                )
            else:
                # Update GlobalAssetTypeAttribute.order for each attribute
                for index, attr_id in enumerate(attribute_order):
                    GlobalAssetTypeAttribute.objects.filter(
                        id=attr_id,
                        asset_type_id=assettype_pk,
                    ).update(order=index)

                return Response({"success": True})

    @extend_schema(
        tags=["Asset Type Attributes"],
        summary="Reset workspace ordering to global default",
    )
    @action(detail=False, methods=["post"], url_path="reset-order")
    def reset_order(self, request, workspace_pk=None, assettype_pk=None):
        """Reset workspace attribute ordering to use global defaults."""
        if not workspace_pk:
            return Response(
                {"error": "Reset order is only available via workspace endpoint"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        deleted_count, _ = WorkspaceAssetTypeConfig.objects.filter(
            workspace_id=workspace_pk,
            asset_type_id=assettype_pk,
        ).delete()

        return Response(
            {
                "success": True,
                "deleted": deleted_count > 0,
            }
        )

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
                WorkspaceOverrideAssetTypeAttribute.objects.filter(id=pk)
                .select_related("base_attribute")
                .first()
            )
            if override:
                attribute_type = override.base_attribute.attribute_type
                attribute_id = override.base_attribute_id
            else:
                # Check extension
                extension = WorkspaceLocalAssetTypeAttribute.objects.filter(
                    id=pk
                ).first()
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
