from rest_framework import viewsets, filters
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import serializers
from audit_log.mixins import AuditLogMixin
from users_manager.permissions import permission_cache
from .models import Workspace


class WorkspaceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Workspace
        fields = [
            "id",
            "organization",
            "name",
            "description",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


@extend_schema_view(
    list=extend_schema(tags=["Workspaces"]),
    create=extend_schema(tags=["Workspaces"]),
    retrieve=extend_schema(tags=["Workspaces"]),
    update=extend_schema(tags=["Workspaces"]),
    partial_update=extend_schema(tags=["Workspaces"]),
    destroy=extend_schema(tags=["Workspaces"]),
)
class WorkspaceViewSet(AuditLogMixin, viewsets.ModelViewSet):
    """
    ViewSet for Workspace model.
    """

    queryset = Workspace.objects.all()
    serializer_class = WorkspaceSerializer
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_fields = ["organization"]
    search_fields = ["name", "description"]
    ordering_fields = ["name", "created_at"]

    # Audit logging configuration
    audit_action_messages = {
        "create": "Created workspace: {obj}",
        "update": "Updated workspace: {obj}",
        "destroy": "Deleted workspace: {obj}",
    }

    def get_queryset(self):
        """Filter workspaces to only those the user has access to."""
        user = self.request.user
        if not user.is_authenticated:
            return Workspace.objects.none()

        # Get cached workspace IDs the user has access to
        accessible_ws_ids = permission_cache.get_user_workspace_ids(user)
        queryset = Workspace.objects.filter(id__in=accessible_ws_ids)

        # Filter by organization from URL if present
        organization_pk = self.kwargs.get("organization_pk")
        if organization_pk:
            queryset = queryset.filter(organization_id=organization_pk)

        return queryset

    def perform_create(self, serializer):
        # Set organization from URL if present
        organization_pk = self.kwargs.get("organization_pk")
        if organization_pk:
            serializer.save(organization_id=organization_pk)
        else:
            serializer.save()
