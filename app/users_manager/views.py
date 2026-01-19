from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, IsAdminUser

from .permissions import make_instance_permission_class

from .models import (
    User,
    Group,
    GroupMembership,
    Role,
    Permission,
    InstanceMember,
    InstanceGroupMember,
    OrganizationMember,
    OrganizationGroupMember,
    WorkspaceMember,
    WorkspaceGroupMember,
    get_user_organization_permissions,
    get_user_workspace_permissions,
)
from .serializers import (
    UserSerializer,
    UserCreateSerializer,
    GroupSerializer,
    GroupDetailSerializer,
    GroupMembershipSerializer,
    RoleSerializer,
    PermissionSerializer,
    ChangePasswordSerializer,
    InstanceMemberSerializer,
    InstanceGroupMemberSerializer,
    OrganizationMemberSerializer,
    OrganizationGroupMemberSerializer,
    WorkspaceMemberSerializer,
    WorkspaceGroupMemberSerializer,
)


# Permission classes for role/permission management
CanReadRoles = make_instance_permission_class(
    ["instance:manage", "role:read", "role:write", "role:create", "role:delete"]
)
CanWriteRoles = make_instance_permission_class(
    ["instance:manage", "role:write", "role:create", "role:delete"]
)


class PermissionViewSet(viewsets.ModelViewSet):
    """Manage permissions."""

    queryset = Permission.objects.all()
    serializer_class = PermissionSerializer
    permission_classes = [CanReadRoles]


class RoleViewSet(viewsets.ModelViewSet):
    """Manage roles."""

    queryset = Role.objects.all()
    serializer_class = RoleSerializer
    filterset_fields = ["scope", "is_system_role"]

    def get_permissions(self):
        if self.action in ["list", "retrieve", "instance_roles", "organization_roles", "workspace_roles"]:
            return [CanReadRoles()]
        return [CanWriteRoles()]

    def destroy(self, request, *args, **kwargs):
        role = self.get_object()
        if role.is_system_role:
            return Response(
                {"error": "System roles cannot be deleted."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=["get"])
    def instance_roles(self, request):
        """Get all roles scoped to instance level."""
        roles = self.get_queryset().filter(scope=Role.Scope.INSTANCE)
        serializer = self.get_serializer(roles, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def organization_roles(self, request):
        """Get all roles scoped to organizations."""
        roles = self.get_queryset().filter(scope=Role.Scope.ORGANIZATION)
        serializer = self.get_serializer(roles, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def workspace_roles(self, request):
        """Get all roles scoped to workspaces."""
        roles = self.get_queryset().filter(scope=Role.Scope.WORKSPACE)
        serializer = self.get_serializer(roles, many=True)
        return Response(serializer.data)


class GroupViewSet(viewsets.ModelViewSet):
    """Manage groups (admin only)."""

    queryset = Group.objects.all()
    permission_classes = [IsAuthenticated, IsAdminUser]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return GroupDetailSerializer
        return GroupSerializer

    @action(detail=True, methods=["post"])
    def add_member(self, request, pk=None):
        """Add a user to the group."""
        group = self.get_object()
        user_id = request.data.get("user_id")

        if not user_id:
            return Response(
                {"error": "user_id is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response(
                {"error": "User not found"}, status=status.HTTP_404_NOT_FOUND
            )

        membership, created = GroupMembership.objects.get_or_create(
            group=group, user=user, defaults={"added_by": request.user}
        )

        if not created:
            return Response(
                {"error": "User is already a member of this group"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = GroupMembershipSerializer(membership)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def remove_member(self, request, pk=None):
        """Remove a user from the group."""
        group = self.get_object()
        user_id = request.data.get("user_id")

        if not user_id:
            return Response(
                {"error": "user_id is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        deleted, _ = GroupMembership.objects.filter(
            group=group, user_id=user_id
        ).delete()

        if not deleted:
            return Response(
                {"error": "User is not a member of this group"},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(status=status.HTTP_204_NO_CONTENT)


class GroupMembershipViewSet(viewsets.ModelViewSet):
    """Manage group memberships."""

    queryset = GroupMembership.objects.all()
    serializer_class = GroupMembershipSerializer
    permission_classes = [IsAuthenticated, IsAdminUser]
    filterset_fields = ["group", "user"]

    def perform_create(self, serializer):
        serializer.save(added_by=self.request.user)


class UserViewSet(viewsets.ModelViewSet):
    """Manage users."""

    queryset = User.objects.all()
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action == "create":
            return UserCreateSerializer
        return UserSerializer

    def get_permissions(self):
        if self.action in ["create", "destroy"]:
            return [IsAuthenticated(), IsAdminUser()]
        return super().get_permissions()

    @action(detail=False, methods=["get"])
    def me(self, request):
        """Get the current authenticated user's profile."""
        serializer = UserSerializer(request.user)
        return Response(serializer.data)

    @action(detail=False, methods=["patch"])
    def update_profile(self, request):
        """Update the current authenticated user's profile."""
        serializer = UserSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    @action(detail=False, methods=["post"])
    def change_password(self, request):
        """Change the current authenticated user's password."""
        serializer = ChangePasswordSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)

        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save()

        return Response({"message": "Password changed successfully."})

    @action(detail=True, methods=["get"])
    def organization_permissions(self, request, pk=None):
        """Get all permissions for a user in a specific organization."""
        user = self.get_object()
        organization_id = request.query_params.get("organization_id")

        if not organization_id:
            return Response(
                {"error": "organization_id query parameter is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from organizations.models import Organization

        try:
            organization = Organization.objects.get(pk=organization_id)
        except Organization.DoesNotExist:
            return Response(
                {"error": "Organization not found"}, status=status.HTTP_404_NOT_FOUND
            )

        permissions = get_user_organization_permissions(user, organization)
        return Response({"permissions": list(permissions)})

    @action(detail=True, methods=["get"])
    def workspace_permissions(self, request, pk=None):
        """Get all permissions for a user in a specific workspace."""
        user = self.get_object()
        workspace_id = request.query_params.get("workspace_id")

        if not workspace_id:
            return Response(
                {"error": "workspace_id query parameter is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from workspaces.models import Workspace

        try:
            workspace = Workspace.objects.get(pk=workspace_id)
        except Workspace.DoesNotExist:
            return Response(
                {"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND
            )

        permissions = get_user_workspace_permissions(user, workspace)
        return Response({"permissions": list(permissions)})


# Permission classes for user/group management
CanManageUsers = make_instance_permission_class(
    ["instance:manage", "user:write", "user:create", "user:delete"]
)


class InstanceMemberViewSet(viewsets.ModelViewSet):
    """Manage instance-level role assignments to users."""

    queryset = InstanceMember.objects.all()
    serializer_class = InstanceMemberSerializer
    permission_classes = [CanManageUsers]
    filterset_fields = ["user", "role"]

    def perform_create(self, serializer):
        serializer.save(granted_by=self.request.user)


class InstanceGroupMemberViewSet(viewsets.ModelViewSet):
    """Manage instance-level role assignments to groups."""

    queryset = InstanceGroupMember.objects.all()
    serializer_class = InstanceGroupMemberSerializer
    permission_classes = [CanManageUsers]
    filterset_fields = ["group", "role"]

    def perform_create(self, serializer):
        serializer.save(granted_by=self.request.user)


class OrganizationMemberViewSet(viewsets.ModelViewSet):
    """Manage direct user memberships in organizations."""

    queryset = OrganizationMember.objects.all()
    serializer_class = OrganizationMemberSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["organization", "user", "role", "is_owner"]


class OrganizationGroupMemberViewSet(viewsets.ModelViewSet):
    """Manage group memberships in organizations."""

    queryset = OrganizationGroupMember.objects.all()
    serializer_class = OrganizationGroupMemberSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["organization", "group", "role"]

    def perform_create(self, serializer):
        serializer.save(added_by=self.request.user)


class WorkspaceMemberViewSet(viewsets.ModelViewSet):
    """Manage direct user memberships in workspaces."""

    queryset = WorkspaceMember.objects.all()
    serializer_class = WorkspaceMemberSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["workspace", "user", "role"]

    def perform_create(self, serializer):
        serializer.save(granted_by=self.request.user)


class WorkspaceGroupMemberViewSet(viewsets.ModelViewSet):
    """Manage group memberships in workspaces."""

    queryset = WorkspaceGroupMember.objects.all()
    serializer_class = WorkspaceGroupMemberSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["workspace", "group", "role"]

    def perform_create(self, serializer):
        serializer.save(granted_by=self.request.user)
