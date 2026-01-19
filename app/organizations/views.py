from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import serializers
from audit_log.mixins import AuditLogMixin
from users_manager.permissions import permission_cache
from users_manager.permissions.drf_permissions import make_instance_permission_class
from .models import Organization, OrganizationMembership
from workspaces.models import Workspace


# Permission class for managing organizations
CanManageOrganizations = make_instance_permission_class(
    ["instance:manage", "organization:create", "organization:write", "organization:delete"],
    message="You do not have permission to manage organizations.",
)


class OrganizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = [
            "id",
            "name",
            "description",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class OrganizationMembershipSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)
    email = serializers.CharField(source="user.email", read_only=True)

    class Meta:
        model = OrganizationMembership
        fields = [
            "id",
            "organization",
            "user",
            "username",
            "email",
            "role",
            "joined_at",
        ]
        read_only_fields = ["id", "organization", "joined_at"]


class OrganizationWorkspaceSerializer(serializers.ModelSerializer):
    """Lightweight workspace serializer for listing under organization"""

    class Meta:
        model = Workspace
        fields = [
            "id",
            "name",
            "description",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


@extend_schema_view(
    list=extend_schema(tags=["Organizations"]),
    create=extend_schema(tags=["Organizations"]),
    retrieve=extend_schema(tags=["Organizations"]),
    update=extend_schema(tags=["Organizations"]),
    partial_update=extend_schema(tags=["Organizations"]),
    destroy=extend_schema(tags=["Organizations"]),
)
class OrganizationViewSet(AuditLogMixin, viewsets.ModelViewSet):
    """
    ViewSet for Organization model.
    """

    queryset = Organization.objects.all()
    serializer_class = OrganizationSerializer
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    search_fields = ["name", "description"]
    ordering_fields = ["name", "created_at"]

    # Audit logging configuration
    audit_action_messages = {
        "create": "Created organization: {obj}",
        "update": "Updated organization: {obj}",
        "destroy": "Deleted organization: {obj}",
    }

    def get_queryset(self):
        """Filter organizations to only those the user has access to."""
        user = self.request.user
        if not user.is_authenticated:
            return Organization.objects.none()

        # Instance admins can see all organizations
        user_perms = permission_cache.get_instance_permissions(user)
        if "instance:manage" in user_perms or "organization:read" in user_perms:
            return Organization.objects.all()

        # Get cached organization IDs the user has access to
        accessible_org_ids = permission_cache.get_user_organization_ids(user)
        return Organization.objects.filter(id__in=accessible_org_ids)

    def _check_manage_permission(self, permission_codename: str):
        """Check if user has permission to manage organizations."""
        user = self.request.user
        user_perms = permission_cache.get_instance_permissions(user)

        # instance:manage grants all permissions
        if "instance:manage" in user_perms:
            return

        if permission_codename not in user_perms:
            raise PermissionDenied(f"You do not have permission to {permission_codename.split(':')[1]} organizations.")

    def create(self, request, *args, **kwargs):
        self._check_manage_permission("organization:create")
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        self._check_manage_permission("organization:write")
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        self._check_manage_permission("organization:write")
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        self._check_manage_permission("organization:delete")
        return super().destroy(request, *args, **kwargs)

    @extend_schema(tags=["Organizations"])
    @action(detail=True, methods=["get"])
    def workspaces(self, request, pk=None):
        """List all workspaces in this organization"""
        org = self.get_object()
        workspaces = Workspace.objects.filter(organization=org)
        serializer = OrganizationWorkspaceSerializer(workspaces, many=True)
        return Response(serializer.data)

    @extend_schema(tags=["Organizations"])
    @action(detail=True, methods=["get", "post"])
    def members(self, request, pk=None):
        """List or add members to this organization"""
        org = self.get_object()

        if request.method == "GET":
            memberships = OrganizationMembership.objects.filter(
                organization=org
            ).select_related("user")
            serializer = OrganizationMembershipSerializer(memberships, many=True)
            return Response(serializer.data)

        elif request.method == "POST":
            serializer = OrganizationMembershipSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            serializer.save(organization=org)
            return Response(serializer.data, status=status.HTTP_201_CREATED)


@extend_schema_view(
    list=extend_schema(tags=["Organization Members"]),
    create=extend_schema(tags=["Organization Members"]),
    retrieve=extend_schema(tags=["Organization Members"]),
    update=extend_schema(tags=["Organization Members"]),
    partial_update=extend_schema(tags=["Organization Members"]),
    destroy=extend_schema(tags=["Organization Members"]),
)
class OrganizationMembershipViewSet(AuditLogMixin, viewsets.ModelViewSet):
    """
    ViewSet for OrganizationMembership model.
    """

    serializer_class = OrganizationMembershipSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["role"]
    ordering_fields = ["joined_at", "role"]

    # Audit logging configuration
    audit_action_messages = {
        "create": "Added member to organization: {obj}",
        "update": "Updated organization member: {obj}",
        "destroy": "Removed member from organization: {obj}",
    }

    def get_queryset(self):
        user = self.request.user
        org_id = self.kwargs["organization_pk"]

        # Verify user has access to this organization
        if not user.is_authenticated:
            return OrganizationMembership.objects.none()

        if not permission_cache.has_organization_access(user, org_id):
            return OrganizationMembership.objects.none()

        return OrganizationMembership.objects.filter(
            organization_id=org_id
        ).select_related("user")

    def perform_create(self, serializer):
        serializer.save(organization_id=self.kwargs["organization_pk"])
