"""
Permission caching for efficient lookups.

Caches user permissions per organization/workspace to avoid repeated DB queries.
Cache is invalidated when memberships or roles change.

Cache keys:
    - user:{user_id}:org:{org_id}:perms - Permissions for user in org
    - user:{user_id}:ws:{ws_id}:perms - Permissions for user in workspace
    - user:{user_id}:orgs - List of organization IDs user has access to
    - user:{user_id}:workspaces - List of workspace IDs user has access to
"""

import hashlib
from functools import wraps
from typing import Optional, TYPE_CHECKING

from django.core.cache import cache
from django.conf import settings

if TYPE_CHECKING:
    from users_manager.models import User


# Cache timeout in seconds (default 5 minutes)
PERMISSION_CACHE_TIMEOUT = getattr(settings, "PERMISSION_CACHE_TIMEOUT", 300)


def _cache_key(*parts) -> str:
    """Generate a cache key from parts."""
    return ":".join(str(p) for p in parts)


def _user_org_perms_key(user_id, org_id) -> str:
    return _cache_key("perms", "user", user_id, "org", org_id)


def _user_workspace_perms_key(user_id, workspace_id) -> str:
    return _cache_key("perms", "user", user_id, "ws", workspace_id)


def _user_orgs_key(user_id) -> str:
    return _cache_key("perms", "user", user_id, "orgs")


def _user_workspaces_key(user_id) -> str:
    return _cache_key("perms", "user", user_id, "workspaces")


def _user_instance_perms_key(user_id) -> str:
    return _cache_key("perms", "user", user_id, "instance")


def _user_all_perms_pattern(user_id) -> str:
    """Pattern to match all permission keys for a user."""
    return _cache_key("perms", "user", user_id, "*")


class PermissionCache:
    """
    Centralized permission caching.

    Usage:
        from users_manager.permissions.caching import permission_cache

        # Get cached permissions (fetches from DB if not cached)
        perms = permission_cache.get_organization_permissions(user, org)

        # Check if user has access
        has_access = permission_cache.has_organization_access(user, org_id)

        # Invalidate when permissions change
        permission_cache.invalidate_user(user_id)
    """

    def __init__(self, timeout: int = PERMISSION_CACHE_TIMEOUT):
        self.timeout = timeout

    # =========================================================================
    # Organization Permissions
    # =========================================================================

    def get_organization_permissions(self, user: "User", organization) -> set[str]:
        """
        Get cached permissions for a user in an organization.
        Fetches from DB and caches if not present.
        """
        if user.is_superuser:
            return self._get_all_permissions()

        cache_key = _user_org_perms_key(user.id, organization.id)

        # Try cache first
        cached = cache.get(cache_key)
        if cached is not None:
            return set(cached)

        # Fetch from DB
        from users_manager.models import get_user_organization_permissions

        permissions = get_user_organization_permissions(user, organization)

        # Cache as list (sets aren't JSON serializable)
        cache.set(cache_key, list(permissions), self.timeout)

        return permissions

    def get_workspace_permissions(self, user: "User", workspace) -> set[str]:
        """
        Get cached permissions for a user in a workspace.
        Also includes org-level permissions for the workspace's organization.
        """
        if user.is_superuser:
            return self._get_all_permissions()

        cache_key = _user_workspace_perms_key(user.id, workspace.id)

        cached = cache.get(cache_key)
        if cached is not None:
            return set(cached)

        # Fetch from DB
        from users_manager.models import get_user_workspace_permissions

        permissions = get_user_workspace_permissions(user, workspace)

        # Also include org-level permissions
        if hasattr(workspace, "organization"):
            org_perms = self.get_organization_permissions(user, workspace.organization)
            permissions = permissions | org_perms

        cache.set(cache_key, list(permissions), self.timeout)

        return permissions

    # =========================================================================
    # Access Lists (which orgs/workspaces can user access)
    # =========================================================================

    def get_user_organization_ids(self, user: "User") -> set[str]:
        """Get all organization IDs the user has access to."""
        cache_key = _user_orgs_key(user.id)

        cached = cache.get(cache_key)
        if cached is not None:
            return set(cached)

        # Fetch from DB - direct memberships
        from users_manager.models import (
            OrganizationMember,
            OrganizationGroupMember,
            Group,
        )

        org_ids = set()

        # Direct memberships
        direct = OrganizationMember.objects.filter(user=user).values_list(
            "organization_id", flat=True
        )
        org_ids.update(str(oid) for oid in direct)

        # Group memberships
        user_groups = Group.objects.filter(memberships__user=user)
        group_orgs = OrganizationGroupMember.objects.filter(
            group__in=user_groups
        ).values_list("organization_id", flat=True)
        org_ids.update(str(oid) for oid in group_orgs)

        cache.set(cache_key, list(org_ids), self.timeout)

        return org_ids

    def get_user_workspace_ids(self, user: "User") -> set[str]:
        """Get all workspace IDs the user has access to."""
        cache_key = _user_workspaces_key(user.id)

        cached = cache.get(cache_key)
        if cached is not None:
            return set(cached)

        # Fetch from DB
        from users_manager.models import WorkspaceMember, WorkspaceGroupMember, Group

        ws_ids = set()

        # Direct memberships
        direct = WorkspaceMember.objects.filter(user=user).values_list(
            "workspace_id", flat=True
        )
        ws_ids.update(str(wid) for wid in direct)

        # Group memberships
        user_groups = Group.objects.filter(memberships__user=user)
        group_ws = WorkspaceGroupMember.objects.filter(
            group__in=user_groups
        ).values_list("workspace_id", flat=True)
        ws_ids.update(str(wid) for wid in group_ws)

        cache.set(cache_key, list(ws_ids), self.timeout)

        return ws_ids

    def has_organization_access(self, user: "User", organization_id) -> bool:
        """Check if user has any access to an organization."""
        return str(organization_id) in self.get_user_organization_ids(user)

    def has_workspace_access(self, user: "User", workspace_id) -> bool:
        """Check if user has any access to a workspace."""
        return str(workspace_id) in self.get_user_workspace_ids(user)

    def get_instance_permissions(self, user: "User") -> set[str]:
        """
        Get instance-level permissions for a user.

        Instance permissions are granted via:
        - Superuser status (grants all permissions)
        - InstanceMember model (direct instance role assignments)
        - InstanceGroupMember model (group-based instance role assignments)
        """
        if user.is_superuser:
            return self._get_all_permissions()

        cache_key = _user_instance_perms_key(user.id)

        # Try cache first
        cached = cache.get(cache_key)
        if cached is not None:
            return set(cached)

        # Fetch from DB using the model function
        from users_manager.models import get_user_instance_permissions
        permissions = get_user_instance_permissions(user)

        # Cache as list (sets aren't JSON serializable)
        cache.set(cache_key, list(permissions), self.timeout)

        return permissions

    # =========================================================================
    # Cache Invalidation
    # =========================================================================

    def invalidate_user(self, user_id):
        """Invalidate all cached permissions for a user."""
        # Get all orgs and workspaces to clear their specific keys
        org_ids = cache.get(_user_orgs_key(user_id)) or []
        ws_ids = cache.get(_user_workspaces_key(user_id)) or []

        keys_to_delete = [
            _user_orgs_key(user_id),
            _user_workspaces_key(user_id),
            _user_instance_perms_key(user_id),
        ]

        # Add org permission keys
        for org_id in org_ids:
            keys_to_delete.append(_user_org_perms_key(user_id, org_id))

        # Add workspace permission keys
        for ws_id in ws_ids:
            keys_to_delete.append(_user_workspace_perms_key(user_id, ws_id))

        cache.delete_many(keys_to_delete)

    def invalidate_organization(self, organization_id):
        """
        Invalidate cached permissions for all users in an organization.
        Called when org roles or group memberships change.
        """
        from users_manager.models import OrganizationMember, OrganizationGroupMember

        # Get all users who have access to this org
        user_ids = set()

        # Direct members
        direct = OrganizationMember.objects.filter(
            organization_id=organization_id
        ).values_list("user_id", flat=True)
        user_ids.update(direct)

        # Group members
        group_members = OrganizationGroupMember.objects.filter(
            organization_id=organization_id
        ).select_related("group")

        for gm in group_members:
            from users_manager.models import GroupMembership

            group_user_ids = GroupMembership.objects.filter(group=gm.group).values_list(
                "user_id", flat=True
            )
            user_ids.update(group_user_ids)

        # Invalidate each user's org permissions
        keys_to_delete = []
        for user_id in user_ids:
            keys_to_delete.append(_user_org_perms_key(user_id, organization_id))
            keys_to_delete.append(_user_orgs_key(user_id))

        if keys_to_delete:
            cache.delete_many(keys_to_delete)

    def invalidate_workspace(self, workspace_id):
        """
        Invalidate cached permissions for all users in a workspace.
        Called when workspace roles or group memberships change.
        """
        from users_manager.models import WorkspaceMember, WorkspaceGroupMember

        user_ids = set()

        # Direct members
        direct = WorkspaceMember.objects.filter(workspace_id=workspace_id).values_list(
            "user_id", flat=True
        )
        user_ids.update(direct)

        # Group members
        group_members = WorkspaceGroupMember.objects.filter(
            workspace_id=workspace_id
        ).select_related("group")

        for gm in group_members:
            from users_manager.models import GroupMembership

            group_user_ids = GroupMembership.objects.filter(group=gm.group).values_list(
                "user_id", flat=True
            )
            user_ids.update(group_user_ids)

        # Invalidate each user's workspace permissions
        keys_to_delete = []
        for user_id in user_ids:
            keys_to_delete.append(_user_workspace_perms_key(user_id, workspace_id))
            keys_to_delete.append(_user_workspaces_key(user_id))

        if keys_to_delete:
            cache.delete_many(keys_to_delete)

    def invalidate_group(self, group_id):
        """
        Invalidate cached permissions for all users in a group.
        Called when group membership changes.
        """
        from users_manager.models import GroupMembership

        user_ids = GroupMembership.objects.filter(group_id=group_id).values_list(
            "user_id", flat=True
        )

        for user_id in user_ids:
            self.invalidate_user(user_id)

    def invalidate_role(self, role_id):
        """
        Invalidate cached permissions for all users with a role.
        Called when role permissions change.
        """
        from users_manager.models import (
            OrganizationMember,
            OrganizationGroupMember,
            WorkspaceMember,
            WorkspaceGroupMember,
            InstanceMember,
            InstanceGroupMember,
            GroupMembership,
        )

        user_ids = set()

        # Find all instance members with this role
        instance_members = InstanceMember.objects.filter(role_id=role_id).values_list(
            "user_id", flat=True
        )
        user_ids.update(instance_members)

        # Find all org members with this role
        org_members = OrganizationMember.objects.filter(role_id=role_id).values_list(
            "user_id", flat=True
        )
        user_ids.update(org_members)

        # Find all workspace members with this role
        ws_members = WorkspaceMember.objects.filter(role_id=role_id).values_list(
            "user_id", flat=True
        )
        user_ids.update(ws_members)

        # Find all group members where group has this role (at any level)
        instance_groups = InstanceGroupMember.objects.filter(
            role_id=role_id
        ).values_list("group_id", flat=True)
        org_groups = OrganizationGroupMember.objects.filter(
            role_id=role_id
        ).values_list("group_id", flat=True)
        ws_groups = WorkspaceGroupMember.objects.filter(role_id=role_id).values_list(
            "group_id", flat=True
        )

        all_groups = set(instance_groups) | set(org_groups) | set(ws_groups)
        group_users = GroupMembership.objects.filter(
            group_id__in=all_groups
        ).values_list("user_id", flat=True)
        user_ids.update(group_users)

        for user_id in user_ids:
            self.invalidate_user(user_id)

    def invalidate_all(self):
        """Clear all permission caches. Use sparingly."""
        # This is a nuclear option - clear all keys with our prefix
        # Note: This only works with cache backends that support pattern deletion
        try:
            cache.delete_pattern("perms:*")
        except AttributeError:
            # Fallback for backends without delete_pattern
            pass

    # =========================================================================
    # Helpers
    # =========================================================================

    def _get_all_permissions(self) -> set[str]:
        """Get all permission codenames (for superusers)."""
        cached = cache.get("perms:all")
        if cached is not None:
            return set(cached)

        from users_manager.models import Permission

        perms = set(Permission.objects.values_list("codename", flat=True))
        cache.set("perms:all", list(perms), self.timeout * 2)
        return perms


# Global instance
permission_cache = PermissionCache()


def warmup_user_permissions(user: "User") -> None:
    """
    Pre-calculate and cache all permissions for a user at login time.

    This eagerly fetches and caches:
    - Instance-level permissions
    - List of accessible organization IDs
    - List of accessible workspace IDs
    - Permissions for each organization
    - Permissions for each workspace

    Call this during login finalization to ensure permissions are cached
    before the user makes their first API request.
    """
    if not user or not user.is_authenticated:
        return

    # Superusers don't need permission caching (they have all permissions)
    if user.is_superuser:
        # Just ensure the "all permissions" cache is warmed
        permission_cache._get_all_permissions()
        return

    # Get and cache instance-level permissions
    permission_cache.get_instance_permissions(user)

    # Get and cache organization IDs (this also caches the list)
    org_ids = permission_cache.get_user_organization_ids(user)

    # Get and cache workspace IDs (this also caches the list)
    ws_ids = permission_cache.get_user_workspace_ids(user)

    # Pre-fetch and cache permissions for each organization
    from organizations.models import Organization

    for org_id in org_ids:
        try:
            org = Organization.objects.get(id=org_id)
            permission_cache.get_organization_permissions(user, org)
        except Organization.DoesNotExist:
            continue

    # Pre-fetch and cache permissions for each workspace
    from workspaces.models import Workspace

    for ws_id in ws_ids:
        try:
            ws = Workspace.objects.get(id=ws_id)
            permission_cache.get_workspace_permissions(user, ws)
        except Workspace.DoesNotExist:
            continue


# =============================================================================
# Request-level caching (for multiple checks within same request)
# =============================================================================


class RequestPermissionCache:
    """
    Per-request permission cache stored on the request object.
    Avoids hitting Redis/DB multiple times within the same request.

    Usage (in middleware or view):
        from users_manager.permissions.caching import get_request_permissions

        perms = get_request_permissions(request, workspace=workspace)
        if 'asset:read' in perms:
            ...
    """

    ATTR_NAME = "_permission_cache"

    @classmethod
    def get_or_create(cls, request) -> "RequestPermissionCache":
        """Get or create the request-level cache."""
        if not hasattr(request, cls.ATTR_NAME):
            setattr(request, cls.ATTR_NAME, cls())
        return getattr(request, cls.ATTR_NAME)

    def __init__(self):
        self.org_permissions: dict[str, set[str]] = {}
        self.workspace_permissions: dict[str, set[str]] = {}
        self.org_ids: Optional[set[str]] = None
        self.workspace_ids: Optional[set[str]] = None

    def get_organization_permissions(self, user, organization) -> set[str]:
        org_id = str(organization.id)
        if org_id not in self.org_permissions:
            self.org_permissions[org_id] = (
                permission_cache.get_organization_permissions(user, organization)
            )
        return self.org_permissions[org_id]

    def get_workspace_permissions(self, user, workspace) -> set[str]:
        ws_id = str(workspace.id)
        if ws_id not in self.workspace_permissions:
            self.workspace_permissions[ws_id] = (
                permission_cache.get_workspace_permissions(user, workspace)
            )
        return self.workspace_permissions[ws_id]

    def get_user_organization_ids(self, user) -> set[str]:
        if self.org_ids is None:
            self.org_ids = permission_cache.get_user_organization_ids(user)
        return self.org_ids

    def get_user_workspace_ids(self, user) -> set[str]:
        if self.workspace_ids is None:
            self.workspace_ids = permission_cache.get_user_workspace_ids(user)
        return self.workspace_ids


def get_request_permissions(
    request,
    *,
    organization=None,
    workspace=None,
) -> set[str]:
    """
    Get permissions for the current request, using request-level caching.

    This is the recommended way to check permissions in views.
    """
    if not request.user or not request.user.is_authenticated:
        return set()

    cache = RequestPermissionCache.get_or_create(request)

    if workspace:
        return cache.get_workspace_permissions(request.user, workspace)
    elif organization:
        return cache.get_organization_permissions(request.user, organization)

    return set()


def get_request_accessible_orgs(request) -> set[str]:
    """Get organization IDs accessible to the current user."""
    if not request.user or not request.user.is_authenticated:
        return set()

    cache = RequestPermissionCache.get_or_create(request)
    return cache.get_user_organization_ids(request.user)


def get_request_accessible_workspaces(request) -> set[str]:
    """Get workspace IDs accessible to the current user."""
    if not request.user or not request.user.is_authenticated:
        return set()

    cache = RequestPermissionCache.get_or_create(request)
    return cache.get_user_workspace_ids(request.user)
