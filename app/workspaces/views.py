from rest_framework import viewsets, filters
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import serializers
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
class WorkspaceViewSet(viewsets.ModelViewSet):
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
