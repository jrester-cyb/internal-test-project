"""
Permission decorators for views and viewsets.

Usage:
    from users_manager.permissions import requires_permission

    class AssetViewSet(viewsets.ModelViewSet):

        @requires_permission('asset:read')
        def list(self, request, *args, **kwargs):
            ...

        @requires_permission('asset:write', scope='workspace')
        def create(self, request, *args, **kwargs):
            ...

        @requires_any_permission(['asset:write', 'asset:manage'])
        def update(self, request, *args, **kwargs):
            ...
"""

from functools import wraps
from typing import Callable, Optional, Union
from rest_framework import status
from rest_framework.response import Response


def _get_scope_object(request, scope: str, **kwargs):
    """
    Extract the organization or workspace from the request.
    Override this in your project if needed.
    """
    if scope == "organization":
        # Try to get organization from various sources
        org_id = (
            kwargs.get("organization_id")
            or kwargs.get("organization_pk")
            or request.query_params.get("organization_id")
            or getattr(request, "organization_id", None)
        )
        if org_id:
            from organizations.models import Organization

            try:
                return Organization.objects.get(pk=org_id)
            except Organization.DoesNotExist:
                return None

    elif scope == "workspace":
        # Try to get workspace from various sources
        ws_id = (
            kwargs.get("workspace_id")
            or kwargs.get("workspace_pk")
            or request.query_params.get("workspace_id")
            or getattr(request, "workspace_id", None)
        )
        if ws_id:
            from workspaces.models import Workspace

            try:
                return Workspace.objects.get(pk=ws_id)
            except Workspace.DoesNotExist:
                return None

    return None


def requires_permission(
    permission: str,
    *,
    scope: Optional[str] = None,
    message: str = "You don't have permission to perform this action.",
):
    """
    Decorator to require a specific permission.

    Args:
        permission: Permission codename (e.g., 'asset:read')
        scope: 'organization', 'workspace', or None (auto-detect)
        message: Error message if permission denied

    Example:
        @requires_permission('asset:write', scope='workspace')
        def create(self, request, *args, **kwargs):
            ...
    """

    def decorator(func: Callable):
        @wraps(func)
        def wrapper(self, request, *args, **kwargs):
            from .caching import get_request_permissions

            # Determine scope
            check_scope = scope
            if check_scope is None:
                # Auto-detect based on available kwargs
                if "workspace_id" in kwargs or "workspace_pk" in kwargs:
                    check_scope = "workspace"
                elif "organization_id" in kwargs or "organization_pk" in kwargs:
                    check_scope = "organization"

            # Get the scope object
            scope_obj = (
                _get_scope_object(request, check_scope, **kwargs)
                if check_scope
                else None
            )

            # Check permission using request-level cache
            if request.user.is_superuser:
                return func(self, request, *args, **kwargs)
            
            perms = get_request_permissions(
                request,
                organization=scope_obj if check_scope == "organization" else None,
                workspace=scope_obj if check_scope == "workspace" else None,
            )
            
            if permission in perms:
                return func(self, request, *args, **kwargs)

            return Response(
                {"error": message, "required_permission": permission},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Store permission info for introspection
        wrapper._required_permission = permission
        wrapper._permission_scope = scope
        return wrapper

    return decorator


def requires_any_permission(
    permissions: list[str],
    *,
    scope: Optional[str] = None,
    message: str = "You don't have permission to perform this action.",
):
    """
    Decorator to require any one of the specified permissions.

    Example:
        @requires_any_permission(['asset:write', 'asset:manage'])
        def update(self, request, *args, **kwargs):
            ...
    """

    def decorator(func: Callable):
        @wraps(func)
        def wrapper(self, request, *args, **kwargs):
            from .caching import get_request_permissions

            if request.user.is_superuser:
                return func(self, request, *args, **kwargs)

            check_scope = scope
            if check_scope is None:
                if "workspace_id" in kwargs or "workspace_pk" in kwargs:
                    check_scope = "workspace"
                elif "organization_id" in kwargs or "organization_pk" in kwargs:
                    check_scope = "organization"

            scope_obj = (
                _get_scope_object(request, check_scope, **kwargs)
                if check_scope
                else None
            )

            perms = get_request_permissions(
                request,
                organization=scope_obj if check_scope == "organization" else None,
                workspace=scope_obj if check_scope == "workspace" else None,
            )

            if perms & set(permissions):
                return func(self, request, *args, **kwargs)

            return Response(
                {"error": message, "required_permissions": permissions},
                status=status.HTTP_403_FORBIDDEN,
            )

        wrapper._required_permissions = permissions
        wrapper._permission_scope = scope
        wrapper._permission_mode = "any"
        return wrapper

    return decorator


def requires_all_permissions(
    permissions: list[str],
    *,
    scope: Optional[str] = None,
    message: str = "You don't have permission to perform this action.",
):
    """
    Decorator to require all of the specified permissions.

    Example:
        @requires_all_permissions(['asset:read', 'asset:write'])
        def bulk_update(self, request, *args, **kwargs):
            ...
    """

    def decorator(func: Callable):
        @wraps(func)
        def wrapper(self, request, *args, **kwargs):
            from .caching import get_request_permissions

            if request.user.is_superuser:
                return func(self, request, *args, **kwargs)

            check_scope = scope
            if check_scope is None:
                if "workspace_id" in kwargs or "workspace_pk" in kwargs:
                    check_scope = "workspace"
                elif "organization_id" in kwargs or "organization_pk" in kwargs:
                    check_scope = "organization"

            scope_obj = (
                _get_scope_object(request, check_scope, **kwargs)
                if check_scope
                else None
            )

            perms = get_request_permissions(
                request,
                organization=scope_obj if check_scope == "organization" else None,
                workspace=scope_obj if check_scope == "workspace" else None,
            )

            if set(permissions).issubset(perms):
                return func(self, request, *args, **kwargs)

            return Response(
                {"error": message, "required_permissions": permissions},
                status=status.HTTP_403_FORBIDDEN,
            )

        wrapper._required_permissions = permissions
        wrapper._permission_scope = scope
        wrapper._permission_mode = "all"
        return wrapper

    return decorator


class PermissionRequiredMixin:
    """
    Mixin for ViewSets that provides permission checking.

    Usage:
        class AssetViewSet(PermissionRequiredMixin, viewsets.ModelViewSet):
            permission_map = {
                'list': 'asset:read',
                'retrieve': 'asset:read',
                'create': 'asset:write',
                'update': 'asset:write',
                'destroy': 'asset:delete',
            }
            permission_scope = 'workspace'  # or 'organization'
    """

    permission_map: dict[str, Union[str, list[str]]] = {}
    permission_scope: Optional[str] = None

    def get_permission_for_action(self, action: str) -> Optional[Union[str, list[str]]]:
        """Get the required permission(s) for an action."""
        return self.permission_map.get(action)

    def check_permissions(self, request):
        """Override to add custom permission checking."""
        super().check_permissions(request)

        required = self.get_permission_for_action(self.action)
        if not required:
            return

        # Superusers bypass permission checks
        if request.user.is_superuser:
            return

        from .caching import get_request_permissions

        # Get scope object
        scope_obj = None
        if self.permission_scope:
            scope_obj = _get_scope_object(request, self.permission_scope, **self.kwargs)

        # Get cached permissions for this request
        perms = get_request_permissions(
            request,
            organization=scope_obj if self.permission_scope == "organization" else None,
            workspace=scope_obj if self.permission_scope == "workspace" else None,
        )

        # Check permissions
        if isinstance(required, list):
            has_perm = bool(perms & set(required))
        else:
            has_perm = required in perms

        if not has_perm:
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied(detail=f"Permission denied. Required: {required}")
