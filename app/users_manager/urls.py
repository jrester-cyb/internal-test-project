from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    UserViewSet,
    GroupViewSet,
    GroupMembershipViewSet,
    RoleViewSet,
    PermissionViewSet,
    InstanceMemberViewSet,
    InstanceGroupMemberViewSet,
    OrganizationMemberViewSet,
    OrganizationGroupMemberViewSet,
    WorkspaceMemberViewSet,
    WorkspaceGroupMemberViewSet,
)

router = DefaultRouter()
router.register(r"users", UserViewSet, basename="user")
router.register(r"groups", GroupViewSet, basename="group")
router.register(
    r"group-memberships", GroupMembershipViewSet, basename="group-membership"
)
router.register(r"roles", RoleViewSet, basename="role")
router.register(r"permissions", PermissionViewSet, basename="permission")
router.register(
    r"instance-members", InstanceMemberViewSet, basename="instance-member"
)
router.register(
    r"instance-group-members",
    InstanceGroupMemberViewSet,
    basename="instance-group-member",
)
router.register(
    r"organization-members", OrganizationMemberViewSet, basename="organization-member"
)
router.register(
    r"organization-group-members",
    OrganizationGroupMemberViewSet,
    basename="organization-group-member",
)
router.register(
    r"workspace-members", WorkspaceMemberViewSet, basename="workspace-member"
)
router.register(
    r"workspace-group-members",
    WorkspaceGroupMemberViewSet,
    basename="workspace-group-member",
)

urlpatterns = [
    path("", include(router.urls)),
]
