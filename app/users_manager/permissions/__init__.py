from .registry import (
    permission_registry,
    register_resource,
    register_permission,
    register_permissions,
    PermissionDefinition,
)
from .decorators import (
    requires_permission,
    requires_any_permission,
    requires_all_permissions,
)
from .checking import (
    has_permission,
    has_any_permission,
    has_all_permissions,
    has_organization_access,
    has_workspace_access,
    get_user_permissions,
    PermissionChecker,
)
from .caching import (
    permission_cache,
    get_request_permissions,
    get_request_accessible_orgs,
    get_request_accessible_workspaces,
)
from .drf_permissions import (
    IsAuthenticatedWithAccess,
    IsOrganizationMember,
    IsWorkspaceMember,
    HasPermission,
    make_permission_class,
)

__all__ = [
    # Registry
    "permission_registry",
    "register_resource",
    "register_permission",
    "register_permissions",
    "PermissionDefinition",
    # Decorators
    "requires_permission",
    "requires_any_permission",
    "requires_all_permissions",
    # Checking
    "has_permission",
    "has_any_permission",
    "has_all_permissions",
    "has_organization_access",
    "has_workspace_access",
    "get_user_permissions",
    "PermissionChecker",
    # Caching
    "permission_cache",
    "get_request_permissions",
    "get_request_accessible_orgs",
    "get_request_accessible_workspaces",
    # DRF Permission classes
    "IsAuthenticatedWithAccess",
    "IsOrganizationMember",
    "IsWorkspaceMember",
    "HasPermission",
    "make_permission_class",
]
