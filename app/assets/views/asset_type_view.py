from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Prefetch, Count, Q
from django_filters import rest_framework as django_filters
from drf_spectacular.utils import extend_schema, extend_schema_view
from audit_log.mixins import AuditLogMixin
from ..models import AssetType, WorkspaceAssetType, BaseAssetTypeAttribute
from ..serializers import (
    AssetTypeSerializer,
    AssetTypeSummarySerializer,
    WorkspaceAssetTypeSerializer,
    WorkspaceAssetTypeWriteSerializer,
)
from workspaces.models import Workspace


class AssetTypeFilter(django_filters.FilterSet):
    """Filter for AssetType with workspace and asset count range filtering."""

    workspace_count_min = django_filters.NumberFilter(
        method="filter_workspace_count_min", label="Minimum workspace count"
    )
    workspace_count_max = django_filters.NumberFilter(
        method="filter_workspace_count_max", label="Maximum workspace count"
    )
    asset_count_min = django_filters.NumberFilter(
        method="filter_asset_count_min", label="Minimum asset count"
    )
    asset_count_max = django_filters.NumberFilter(
        method="filter_asset_count_max", label="Maximum asset count"
    )

    class Meta:
        model = AssetType
        fields = []

    def filter_workspace_count_min(self, queryset, name, value):
        """Filter asset types with at least this many workspaces."""
        if value is not None:
            return queryset.filter(_workspace_count__gte=value)
        return queryset

    def filter_workspace_count_max(self, queryset, name, value):
        """Filter asset types with at most this many workspaces."""
        if value is not None:
            return queryset.filter(_workspace_count__lte=value)
        return queryset

    def filter_asset_count_min(self, queryset, name, value):
        """Filter asset types with at least this many assets."""
        if value is not None:
            return queryset.filter(_asset_count__gte=value)
        return queryset

    def filter_asset_count_max(self, queryset, name, value):
        """Filter asset types with at most this many assets."""
        if value is not None:
            return queryset.filter(_asset_count__lte=value)
        return queryset


@extend_schema_view(
    list=extend_schema(tags=["Asset Types"]),
    create=extend_schema(tags=["Asset Types"]),
    retrieve=extend_schema(tags=["Asset Types"]),
    update=extend_schema(tags=["Asset Types"]),
    partial_update=extend_schema(tags=["Asset Types"]),
    destroy=extend_schema(tags=["Asset Types"]),
)
class AssetTypeViewSet(AuditLogMixin, viewsets.ModelViewSet):
    """
    ViewSet for AssetType model.

    Asset types define the schema for assets with custom fields.
    Asset types are owned by organizations but visible to workspaces via WorkspaceAssetType.
    """

    serializer_class = AssetTypeSerializer
    filter_backends = [
        django_filters.DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_class = AssetTypeFilter
    search_fields = ["name", "description"]
    ordering_fields = ["name", "created_at"]
    ordering = ["name"]  # Default ordering

    # Audit logging configuration
    audit_action_messages = {
        "create": "Created asset type: {obj}",
        "update": "Updated asset type: {obj}",
        "destroy": "Deleted asset type: {obj}",
    }

    def _needs_count_annotations(self):
        """Check if count annotations are needed for filtering."""
        request = self.request
        if not request:
            return False
        params = request.query_params
        return any(
            params.get(p)
            for p in [
                "workspace_count_min",
                "workspace_count_max",
                "asset_count_min",
                "asset_count_max",
            ]
        )

    def get_queryset(self):
        """Filter by workspace or organization"""
        workspace_pk = self.kwargs.get("workspace_pk")
        organization_pk = self.kwargs.get("organization_pk")

        if workspace_pk:
            # Get asset types visible to this workspace via join table
            queryset = AssetType.objects.filter(
                workspace_asset_types__workspace_id=workspace_pk,
                workspace_asset_types__deleted_at__isnull=True,
            ).select_related("organization")
        elif organization_pk:
            # Get all asset types for this organization
            queryset = AssetType.objects.filter(
                organization_id=organization_pk,
            ).select_related("organization")
        else:
            # Top-level access: return all asset types
            queryset = AssetType.objects.all().select_related("organization")

        # Only annotate counts when filtering requires them (expensive operation)
        if self._needs_count_annotations():
            # Build asset count filter - scope to workspace if in workspace context
            if workspace_pk:
                asset_count_filter = Q(
                    assets__deleted_at__isnull=True,
                    assets__workspace_memberships__workspace_id=workspace_pk,
                )
            else:
                asset_count_filter = Q(assets__deleted_at__isnull=True)

            queryset = queryset.annotate(
                _workspace_count=Count(
                    "workspace_asset_types",
                    filter=Q(workspace_asset_types__deleted_at__isnull=True),
                    distinct=True,
                ),
                _asset_count=Count(
                    "assets",
                    filter=asset_count_filter,
                    distinct=True,
                ),
            )

        # For detail view, prefetch attributes (both base and workspace extensions)
        if self.action == "retrieve":
            # Prefetch all polymorphic attributes with their related hidden_attribute
            from ..models import WorkspaceHiddenAttribute

            queryset = queryset.prefetch_related(
                Prefetch(
                    "attributes",
                    queryset=WorkspaceHiddenAttribute.objects.all().select_related(
                        "hidden_attribute__globalassettypeattribute",
                        "hidden_attribute__workspacelocalassettypeattribute",
                        "hidden_attribute__workspaceoverrideassettypeattribute",
                    ),
                )
            )

        return queryset.distinct()

    def get_serializer_class(self):
        """Use summary serializer for list view"""
        if self.action == "list":
            return AssetTypeSummarySerializer
        return AssetTypeSerializer

    def get_serializer_context(self):
        """Add workspace to serializer context"""
        context = super().get_serializer_context()
        workspace_pk = self.kwargs.get("workspace_pk")
        if workspace_pk:
            try:
                context["workspace"] = Workspace.objects.get(pk=workspace_pk)
            except Workspace.DoesNotExist:
                pass
        return context

    def perform_create(self, serializer):
        """Create asset type owned by workspace's organization and link to workspace"""
        workspace_pk = self.kwargs["workspace_pk"]
        workspace = Workspace.objects.select_related("organization").get(
            pk=workspace_pk
        )

        # Create the asset type owned by the organization
        asset_type = serializer.save(organization=workspace.organization)

        # Create the workspace link with ownership
        WorkspaceAssetType.objects.create(
            workspace=workspace,
            asset_type=asset_type,
            is_owner=True,
        )

    @extend_schema(tags=["Asset Types"])
    @action(detail=True, methods=["get"])
    def attributes_for_workspace(self, request, workspace_pk=None, pk=None):
        """
        Get merged attributes for this asset type in the current workspace.
        Returns base attributes plus any workspace-specific extensions.
        """
        asset_type = self.get_object()
        workspace = Workspace.objects.get(pk=workspace_pk)
        attributes = asset_type.get_attributes_for_workspace(workspace)

        from ..serializers import AssetTypeAttributeSerializer

        serializer = AssetTypeAttributeSerializer(attributes, many=True)
        return Response(serializer.data)
