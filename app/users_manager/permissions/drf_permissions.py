"""
DRF Permission classes for scope-based access control.

These permission classes replace IsAuthenticated and add organization/workspace
access validation using the cached permission system.

Usage:
    from users_manager.permissions import IsAuthenticatedWithAccess

    class OrganizationViewSet(viewsets.ModelViewSet):
        permission_classes = [IsAuthenticatedWithAccess]

    # Or for specific scope:
    class WorkspaceViewSet(viewsets.ModelViewSet):
        permission_classes = [IsWorkspaceMember]
"""

from rest_framework.permissions import BasePermission

from .caching import permission_cache


class IsAuthenticatedWithAccess(BasePermission):
    """
    Permission class that validates:
    1. User is authenticated
    2. User has access to the organization or workspace in the request

    Automatically detects scope from URL kwargs:
    - organization_pk, organization_id -> checks organization access
    - workspace_pk, workspace_id -> checks workspace access

    If no scope is detected, behaves like IsAuthenticated.
    """

    message = "You do not have access to this resource."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        # Get kwargs from view
        kwargs = getattr(view, "kwargs", {})

        # Check for workspace scope
        workspace_id = kwargs.get("workspace_pk") or kwargs.get("workspace_id")
        if workspace_id:
            return permission_cache.has_workspace_access(request.user, workspace_id)

        # Check for organization scope
        org_id = kwargs.get("organization_pk") or kwargs.get("organization_id")
        if org_id:
            return permission_cache.has_organization_access(request.user, org_id)

        # No scope detected - just require authentication
        return True


class IsOrganizationMember(BasePermission):
    """
    Permission class that requires user to be a member of the organization.

    Looks for organization_pk or organization_id in view kwargs.
    """

    message = "You are not a member of this organization."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        kwargs = getattr(view, "kwargs", {})
        org_id = kwargs.get("organization_pk") or kwargs.get("organization_id")

        if not org_id:
            # No organization in URL - deny access
            return False

        return permission_cache.has_organization_access(request.user, org_id)


class IsWorkspaceMember(BasePermission):
    """
    Permission class that requires user to be a member of the workspace.

    Looks for workspace_pk or workspace_id in view kwargs.
    """

    message = "You are not a member of this workspace."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        kwargs = getattr(view, "kwargs", {})
        workspace_id = kwargs.get("workspace_pk") or kwargs.get("workspace_id")

        if not workspace_id:
            # No workspace in URL - deny access
            return False

        return permission_cache.has_workspace_access(request.user, workspace_id)


class HasPermission(BasePermission):
    """
    Base class for creating permission classes that check specific permissions.

    Subclass and set `required_permission` and `permission_scope`:

        class CanReadAssets(HasPermission):
            required_permission = 'asset:read'
            permission_scope = 'workspace'

    Or use the factory function `make_permission_class()`.
    """

    required_permission: str = None
    permission_scope: str = None  # 'organization' or 'workspace'
    message = "You do not have permission to perform this action."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        if not self.required_permission:
            return True

        kwargs = getattr(view, "kwargs", {})
        scope_obj = self._get_scope_object(kwargs)

        if scope_obj is None and self.permission_scope:
            # Scope required but not found
            return False

        from .caching import get_request_permissions

        perms = get_request_permissions(
            request,
            organization=scope_obj if self.permission_scope == "organization" else None,
            workspace=scope_obj if self.permission_scope == "workspace" else None,
        )

        return self.required_permission in perms

    def _get_scope_object(self, kwargs):
        """Get the organization or workspace object from kwargs."""
        if self.permission_scope == "workspace":
            workspace_id = kwargs.get("workspace_pk") or kwargs.get("workspace_id")
            if workspace_id:
                from workspaces.models import Workspace

                try:
                    return Workspace.objects.get(pk=workspace_id)
                except Workspace.DoesNotExist:
                    return None

        elif self.permission_scope == "organization":
            org_id = kwargs.get("organization_pk") or kwargs.get("organization_id")
            if org_id:
                from organizations.models import Organization

                try:
                    return Organization.objects.get(pk=org_id)
                except Organization.DoesNotExist:
                    return None

        return None


def make_permission_class(
    permission: str,
    scope: str,
    message: str = None,
) -> type[BasePermission]:
    """
    Factory function to create a permission class for a specific permission.

    Args:
        permission: The permission codename (e.g., 'asset:write')
        scope: 'organization' or 'workspace'
        message: Custom error message

    Returns:
        A permission class that can be used in permission_classes

    Example:
        CanWriteAssets = make_permission_class('asset:write', 'workspace')

        class AssetViewSet(viewsets.ModelViewSet):
            permission_classes = [CanWriteAssets]
    """

    class DynamicPermission(HasPermission):
        required_permission = permission
        permission_scope = scope

    if message:
        DynamicPermission.message = message

    DynamicPermission.__name__ = f"Has{permission.replace(':', '_').title()}Permission"
    return DynamicPermission
