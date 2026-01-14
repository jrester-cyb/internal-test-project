"""
Permission checking utilities.

Usage:
    from users_manager.permissions import has_permission, get_user_permissions

    # Check a single permission (uses caching automatically)
    if has_permission(user, 'asset:write', workspace):
        # User can write assets in this workspace
        ...

    # Get all permissions for a user in a context
    perms = get_user_permissions(user, organization=org)
    perms = get_user_permissions(user, workspace=ws)

    # For request-scoped caching (best for views)
    from users_manager.permissions.caching import get_request_permissions
    perms = get_request_permissions(request, workspace=ws)
"""

from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from users_manager.models import User


def get_user_permissions(
    user: "User",
    *,
    organization=None,
    workspace=None,
    use_cache: bool = True,
) -> set[str]:
    """
    Get all permission codenames for a user in a specific context.

    Args:
        user: The user to check
        organization: Organization context (optional)
        workspace: Workspace context (optional)
        use_cache: Whether to use cached permissions (default True)

    Returns:
        Set of permission codenames the user has
    """
    if not user or not user.is_authenticated:
        return set()

    # Superusers have all permissions
    if user.is_superuser:
        from users_manager.models import Permission

        return set(Permission.objects.values_list("codename", flat=True))

    if use_cache:
        from users_manager.permissions.caching import permission_cache

        if workspace:
            return permission_cache.get_workspace_permissions(user, workspace)
        elif organization:
            return permission_cache.get_organization_permissions(user, organization)
        return set()

    # Non-cached path (for testing or special cases)
    from users_manager.models import (
        get_user_organization_permissions,
        get_user_workspace_permissions,
    )

    permissions = set()

    if organization:
        permissions.update(get_user_organization_permissions(user, organization))

    if workspace:
        permissions.update(get_user_workspace_permissions(user, workspace))
        if hasattr(workspace, "organization"):
            permissions.update(
                get_user_organization_permissions(user, workspace.organization)
            )

    return permissions


def has_permission(
    user: "User",
    permission: str,
    scope_obj=None,
    *,
    use_cache: bool = True,
) -> bool:
    """
    Check if a user has a specific permission.

    Args:
        user: The user to check
        permission: Permission codename (e.g., 'asset:read')
        scope_obj: Organization or Workspace object for context
        use_cache: Whether to use cached permissions (default True)

    Returns:
        True if user has the permission
    """
    if not user or not user.is_authenticated:
        return False

    if user.is_superuser:
        return True

    # Determine scope type
    organization = None
    workspace = None

    if scope_obj:
        from organizations.models import Organization
        from workspaces.models import Workspace

        if isinstance(scope_obj, Organization):
            organization = scope_obj
        elif isinstance(scope_obj, Workspace):
            workspace = scope_obj

    permissions = get_user_permissions(
        user,
        organization=organization,
        workspace=workspace,
        use_cache=use_cache,
    )

    return permission in permissions


def has_any_permission(
    user: "User",
    permissions: list[str],
    scope_obj=None,
    *,
    use_cache: bool = True,
) -> bool:
    """
    Check if a user has any of the specified permissions.

    Args:
        user: The user to check
        permissions: List of permission codenames
        scope_obj: Organization or Workspace object for context
        use_cache: Whether to use cached permissions (default True)

    Returns:
        True if user has at least one of the permissions
    """
    if not user or not user.is_authenticated:
        return False

    if user.is_superuser:
        return True

    organization = None
    workspace = None

    if scope_obj:
        from organizations.models import Organization
        from workspaces.models import Workspace

        if isinstance(scope_obj, Organization):
            organization = scope_obj
        elif isinstance(scope_obj, Workspace):
            workspace = scope_obj

    user_permissions = get_user_permissions(
        user,
        organization=organization,
        workspace=workspace,
        use_cache=use_cache,
    )

    return bool(user_permissions & set(permissions))


def has_all_permissions(
    user: "User",
    permissions: list[str],
    scope_obj=None,
    *,
    use_cache: bool = True,
) -> bool:
    """
    Check if a user has all of the specified permissions.

    Args:
        user: The user to check
        permissions: List of permission codenames
        scope_obj: Organization or Workspace object for context
        use_cache: Whether to use cached permissions (default True)

    Returns:
        True if user has all of the permissions
    """
    if not user or not user.is_authenticated:
        return False

    if user.is_superuser:
        return True

    organization = None
    workspace = None

    if scope_obj:
        from organizations.models import Organization
        from workspaces.models import Workspace

        if isinstance(scope_obj, Organization):
            organization = scope_obj
        elif isinstance(scope_obj, Workspace):
            workspace = scope_obj

    user_permissions = get_user_permissions(
        user,
        organization=organization,
        workspace=workspace,
        use_cache=use_cache,
    )

    return set(permissions).issubset(user_permissions)


def has_organization_access(
    user: "User", organization_id, *, use_cache: bool = True
) -> bool:
    """Check if a user has any access to an organization."""
    if not user or not user.is_authenticated:
        return False

    if user.is_superuser:
        return True

    if use_cache:
        from users_manager.permissions.caching import permission_cache

        return permission_cache.has_organization_access(user, organization_id)

    # Non-cached check
    from users_manager.models import OrganizationMember, OrganizationGroupMember, Group

    # Direct membership
    if OrganizationMember.objects.filter(
        organization_id=organization_id, user=user
    ).exists():
        return True

    # Group membership
    user_groups = Group.objects.filter(memberships__user=user)
    return OrganizationGroupMember.objects.filter(
        organization_id=organization_id, group__in=user_groups
    ).exists()


def has_workspace_access(user: "User", workspace_id, *, use_cache: bool = True) -> bool:
    """Check if a user has any access to a workspace."""
    if not user or not user.is_authenticated:
        return False

    if user.is_superuser:
        return True

    if use_cache:
        from users_manager.permissions.caching import permission_cache

        return permission_cache.has_workspace_access(user, workspace_id)

    # Non-cached check
    from users_manager.models import WorkspaceMember, WorkspaceGroupMember, Group

    # Direct membership
    if WorkspaceMember.objects.filter(workspace_id=workspace_id, user=user).exists():
        return True

    # Group membership
    user_groups = Group.objects.filter(memberships__user=user)
    return WorkspaceGroupMember.objects.filter(
        workspace_id=workspace_id, group__in=user_groups
    ).exists()


class PermissionChecker:
    """
    Helper class for checking permissions in templates or complex logic.

    Uses caching for efficient repeated checks.

    Usage:
        checker = PermissionChecker(user, workspace=workspace)

        if checker.can('asset:read'):
            ...

        if checker.can_any(['asset:write', 'asset:manage']):
            ...
    """

    def __init__(
        self,
        user: "User",
        *,
        organization=None,
        workspace=None,
        use_cache: bool = True,
    ):
        self.user = user
        self.organization = organization
        self.workspace = workspace
        self.use_cache = use_cache
        self._permissions: Optional[set[str]] = None

    @property
    def permissions(self) -> set[str]:
        """Lazy-load permissions."""
        if self._permissions is None:
            self._permissions = get_user_permissions(
                self.user,
                organization=self.organization,
                workspace=self.workspace,
                use_cache=self.use_cache,
            )
        return self._permissions

    def can(self, permission: str) -> bool:
        """Check if user has a permission."""
        if self.user.is_superuser:
            return True
        return permission in self.permissions

    def can_any(self, permissions: list[str]) -> bool:
        """Check if user has any of the permissions."""
        if self.user.is_superuser:
            return True
        return bool(self.permissions & set(permissions))

    def can_all(self, permissions: list[str]) -> bool:
        """Check if user has all of the permissions."""
        if self.user.is_superuser:
            return True
        return set(permissions).issubset(self.permissions)

    def __contains__(self, permission: str) -> bool:
        """Allow 'permission in checker' syntax."""
        return self.can(permission)
