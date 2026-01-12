from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema, extend_schema_view
from ..models import AssetType, WorkspaceAssetType
from ..serializers import (
    AssetTypeSerializer,
    AssetTypeSummarySerializer,
    WorkspaceAssetTypeSerializer,
    WorkspaceAssetTypeWriteSerializer,
)
from workspaces.models import Workspace


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
    Asset types are owned by organizations but visible to workspaces via WorkspaceAssetType.
    """

    serializer_class = AssetTypeSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name", "description"]
    ordering_fields = ["name", "created_at"]

    def get_queryset(self):
        """Filter by workspace via WorkspaceAssetType join table"""
        workspace_pk = self.kwargs.get("workspace_pk")

        # Get asset types visible to this workspace via join table
        queryset = AssetType.objects.filter(
            workspace_asset_types__workspace_id=workspace_pk,
            workspace_asset_types__deleted_at__isnull=True,
        ).select_related("organization")

        # For detail view, prefetch attributes (both base and workspace extensions)
        if self.action == "retrieve":
            queryset = queryset.prefetch_related("attributes")

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
