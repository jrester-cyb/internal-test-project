from django.db.models import Case, When, Value, IntegerField, Q
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied
from drf_spectacular.utils import extend_schema, extend_schema_view
from audit_log.mixins import AuditLogMixin
from users_manager.permissions import permission_cache
from organizations.models import Organization
from workspaces.models import Workspace
from .models import OrganizationSettings, WorkspaceSettings, Theme
from .serializers import (
    OrganizationSettingsSerializer,
    WorkspaceSettingsSerializer,
    ThemeResponseSerializer,
    ThemeSerializer,
    ThemeListSerializer,
)


def get_preset_themes_ordered():
    """Get preset themes with 'Default' first, then alphabetically."""
    return Theme.objects.filter(
        theme_type="preset", deleted_at__isnull=True
    ).annotate(
        sort_order=Case(
            When(name="Default", then=Value(0)),
            default=Value(1),
            output_field=IntegerField(),
        )
    ).order_by("sort_order", "name")


@extend_schema_view(
    list=extend_schema(tags=["Settings"]),
    retrieve=extend_schema(tags=["Settings"]),
    update=extend_schema(tags=["Settings"]),
    partial_update=extend_schema(tags=["Settings"]),
)
class OrganizationSettingsViewSet(AuditLogMixin, viewsets.ModelViewSet):
    """
    ViewSet for Organization Settings.
    Only org admins can update settings.
    Operates as a singleton - GET/PATCH on list URL returns/updates the single settings object.
    """

    serializer_class = OrganizationSettingsSerializer
    http_method_names = ["get", "post", "patch", "put"]

    audit_action_messages = {
        "update": "Updated organization settings: {obj}",
        "partial_update": "Updated organization settings: {obj}",
    }

    def get_queryset(self):
        org_id = self.kwargs.get("organization_pk")
        return OrganizationSettings.objects.filter(organization_id=org_id)

    def get_object(self):
        org_id = self.kwargs.get("organization_pk")
        # Get or create settings for the organization
        settings, _ = OrganizationSettings.objects.get_or_create(
            organization_id=org_id
        )
        return settings

    def list(self, request, *args, **kwargs):
        """Treat list as retrieve for singleton pattern."""
        self._check_read_permission()
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    def create(self, request, *args, **kwargs):
        """Treat create (POST on list) as partial update for singleton pattern."""
        self._check_admin_permission()
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(serializer.data)

    def _check_read_permission(self):
        """Check if user has read access to this organization."""
        user = self.request.user
        org_id = self.kwargs.get("organization_pk")

        if not user.is_authenticated:
            raise PermissionDenied("Authentication required.")

        # Instance admins can access any org
        instance_perms = permission_cache.get_instance_permissions(user)
        if "instance:manage" in instance_perms:
            return

        # Check org access
        if not permission_cache.has_organization_access(user, org_id):
            raise PermissionDenied("You do not have access to this organization.")

    def _check_admin_permission(self):
        """Check if user is org admin."""
        user = self.request.user
        org_id = self.kwargs.get("organization_pk")

        if not user.is_authenticated:
            raise PermissionDenied("Authentication required.")

        # Instance admins can modify any org
        instance_perms = permission_cache.get_instance_permissions(user)
        if "instance:manage" in instance_perms:
            return

        # Check org access first
        if not permission_cache.has_organization_access(user, org_id):
            raise PermissionDenied("You do not have access to this organization.")

        # Get org-level permissions
        try:
            org = Organization.objects.get(id=org_id)
            org_perms = permission_cache.get_organization_permissions(user, org)
        except Organization.DoesNotExist:
            raise PermissionDenied("Organization not found.")

        # Check for admin permissions
        admin_perms = {"organization:admin", "organization:settings", "organization:write"}
        if not (admin_perms & org_perms):
            raise PermissionDenied(
                "You must be an organization admin to modify settings."
            )

    def retrieve(self, request, *args, **kwargs):
        self._check_read_permission()
        return super().retrieve(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        self._check_admin_permission()
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        self._check_admin_permission()
        return super().partial_update(request, *args, **kwargs)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)

    @extend_schema(tags=["Settings"], responses={200: ThemeResponseSerializer})
    @action(detail=False, methods=["get"])
    def theme(self, request, organization_pk=None):
        """
        Get just the theme configuration (lightweight endpoint for caching).
        """
        self._check_read_permission()
        settings = self.get_object()
        theme = settings.get_effective_theme()
        theme["source"] = "organization"
        return Response(theme)

    @extend_schema(
        tags=["Settings"],
        responses={200: ThemeListSerializer(many=True)},
    )
    @action(detail=False, methods=["get"])
    def themes(self, request, organization_pk=None):
        """
        Get list of available themes for this organization.
        Returns both preset themes and custom organization themes.
        """
        self._check_read_permission()

        # Get preset themes with Default first
        preset_themes = get_preset_themes_ordered()

        # Get custom themes for this organization
        custom_themes = Theme.objects.filter(
            organization_id=organization_pk,
            theme_type="custom",
            deleted_at__isnull=True,
        ).order_by("name")

        all_themes = list(preset_themes) + list(custom_themes)
        serializer = ThemeListSerializer(all_themes, many=True)
        return Response(serializer.data)


@extend_schema_view(
    list=extend_schema(tags=["Settings"]),
    retrieve=extend_schema(tags=["Settings"]),
    update=extend_schema(tags=["Settings"]),
    partial_update=extend_schema(tags=["Settings"]),
)
class WorkspaceSettingsViewSet(AuditLogMixin, viewsets.ModelViewSet):
    """
    ViewSet for Workspace Settings.
    Only workspace admins can update settings.
    Operates as a singleton - GET/PATCH on list URL returns/updates the single settings object.
    """

    serializer_class = WorkspaceSettingsSerializer
    http_method_names = ["get", "post", "patch", "put"]

    audit_action_messages = {
        "update": "Updated workspace settings: {obj}",
        "partial_update": "Updated workspace settings: {obj}",
    }

    def get_queryset(self):
        ws_id = self.kwargs.get("workspace_pk")
        return WorkspaceSettings.objects.filter(workspace_id=ws_id)

    def get_object(self):
        ws_id = self.kwargs.get("workspace_pk")
        # Get or create settings for the workspace
        settings, _ = WorkspaceSettings.objects.get_or_create(workspace_id=ws_id)
        return settings

    def list(self, request, *args, **kwargs):
        """Treat list as retrieve for singleton pattern."""
        self._check_read_permission()
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    def create(self, request, *args, **kwargs):
        """Treat create (POST on list) as partial update for singleton pattern."""
        self._check_admin_permission()
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(serializer.data)

    def _check_read_permission(self):
        """Check if user has read access to this workspace."""
        user = self.request.user
        ws_id = self.kwargs.get("workspace_pk")

        if not user.is_authenticated:
            raise PermissionDenied("Authentication required.")

        # Instance admins can access any workspace
        instance_perms = permission_cache.get_instance_permissions(user)
        if "instance:manage" in instance_perms:
            return

        # Check workspace access
        if not permission_cache.has_workspace_access(user, ws_id):
            raise PermissionDenied("You do not have access to this workspace.")

    def _check_admin_permission(self):
        """Check if user is workspace admin."""
        user = self.request.user
        ws_id = self.kwargs.get("workspace_pk")

        if not user.is_authenticated:
            raise PermissionDenied("Authentication required.")

        # Instance admins can modify any workspace
        instance_perms = permission_cache.get_instance_permissions(user)
        if "instance:manage" in instance_perms:
            return

        # Check workspace access first
        if not permission_cache.has_workspace_access(user, ws_id):
            raise PermissionDenied("You do not have access to this workspace.")

        # Get workspace-level permissions
        try:
            ws = Workspace.objects.get(id=ws_id)
            ws_perms = permission_cache.get_workspace_permissions(user, ws)
        except Workspace.DoesNotExist:
            raise PermissionDenied("Workspace not found.")

        # Check for admin permissions
        admin_perms = {"workspace:admin", "workspace:settings", "workspace:write"}
        if not (admin_perms & ws_perms):
            raise PermissionDenied(
                "You must be a workspace admin to modify settings."
            )

    def retrieve(self, request, *args, **kwargs):
        self._check_read_permission()
        return super().retrieve(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        self._check_admin_permission()
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        self._check_admin_permission()
        return super().partial_update(request, *args, **kwargs)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)

    @extend_schema(tags=["Settings"], responses={200: ThemeResponseSerializer})
    @action(detail=False, methods=["get"])
    def theme(self, request, organization_pk=None, workspace_pk=None):
        """
        Get the effective theme for this workspace (including inheritance).
        Lightweight endpoint for caching.
        """
        self._check_read_permission()
        settings = self.get_object()
        theme = settings.get_effective_theme()
        theme["source"] = "organization" if settings.inherit_theme else "workspace"
        return Response(theme)

    @extend_schema(
        tags=["Settings"],
        responses={200: ThemeListSerializer(many=True)},
    )
    @action(detail=False, methods=["get"])
    def themes(self, request, organization_pk=None, workspace_pk=None):
        """
        Get list of available themes for this workspace.
        Returns both preset themes and custom organization themes.
        """
        self._check_read_permission()

        # Get preset themes with Default first
        preset_themes = get_preset_themes_ordered()

        # Get custom themes for the parent organization
        custom_themes = Theme.objects.filter(
            organization_id=organization_pk,
            theme_type="custom",
            deleted_at__isnull=True,
        ).order_by("name")

        all_themes = list(preset_themes) + list(custom_themes)
        serializer = ThemeListSerializer(all_themes, many=True)
        return Response(serializer.data)


@extend_schema_view(
    list=extend_schema(tags=["Settings"]),
    create=extend_schema(tags=["Settings"]),
    retrieve=extend_schema(tags=["Settings"]),
    update=extend_schema(tags=["Settings"]),
    partial_update=extend_schema(tags=["Settings"]),
    destroy=extend_schema(tags=["Settings"]),
)
class ThemeViewSet(AuditLogMixin, viewsets.ModelViewSet):
    """
    ViewSet for managing custom themes.
    Themes are scoped to an organization.
    """

    serializer_class = ThemeSerializer
    http_method_names = ["get", "post", "patch", "put", "delete"]

    audit_action_messages = {
        "create": "Created theme: {obj}",
        "update": "Updated theme: {obj}",
        "partial_update": "Updated theme: {obj}",
        "destroy": "Deleted theme: {obj}",
    }

    def get_queryset(self):
        org_id = self.kwargs.get("organization_pk")
        # Include both preset themes (organization=null) and custom themes for this org
        return Theme.objects.filter(
            Q(organization_id=org_id) | Q(theme_type="preset", organization__isnull=True),
            deleted_at__isnull=True,
        )

    def _check_read_permission(self):
        """Check if user has read access to this organization."""
        user = self.request.user
        org_id = self.kwargs.get("organization_pk")

        if not user.is_authenticated:
            raise PermissionDenied("Authentication required.")

        # Instance admins can access any org
        instance_perms = permission_cache.get_instance_permissions(user)
        if "instance:manage" in instance_perms:
            return

        # Check org access
        if not permission_cache.has_organization_access(user, org_id):
            raise PermissionDenied("You do not have access to this organization.")

    def _check_admin_permission(self):
        """Check if user is org admin."""
        user = self.request.user
        org_id = self.kwargs.get("organization_pk")

        if not user.is_authenticated:
            raise PermissionDenied("Authentication required.")

        # Instance admins can modify any org
        instance_perms = permission_cache.get_instance_permissions(user)
        if "instance:manage" in instance_perms:
            return

        # Check org access first
        if not permission_cache.has_organization_access(user, org_id):
            raise PermissionDenied("You do not have access to this organization.")

        # Get org-level permissions
        try:
            org = Organization.objects.get(id=org_id)
            org_perms = permission_cache.get_organization_permissions(user, org)
        except Organization.DoesNotExist:
            raise PermissionDenied("Organization not found.")

        # Check for admin permissions
        admin_perms = {"organization:admin", "organization:settings", "organization:write"}
        if not (admin_perms & org_perms):
            raise PermissionDenied(
                "You must be an organization admin to manage themes."
            )

    def list(self, request, *args, **kwargs):
        self._check_read_permission()
        return super().list(request, *args, **kwargs)

    def retrieve(self, request, *args, **kwargs):
        self._check_read_permission()
        return super().retrieve(request, *args, **kwargs)

    def create(self, request, *args, **kwargs):
        self._check_admin_permission()
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        self._check_admin_permission()
        instance = self.get_object()
        if instance.theme_type == "preset":
            raise PermissionDenied("Cannot modify preset themes.")
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        self._check_admin_permission()
        instance = self.get_object()
        if instance.theme_type == "preset":
            raise PermissionDenied("Cannot modify preset themes.")
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        self._check_admin_permission()
        instance = self.get_object()
        if instance.theme_type == "preset":
            raise PermissionDenied("Cannot delete preset themes.")
        # Soft delete
        instance.delete()  # This will use SoftDeleteMixin
        return Response(status=status.HTTP_204_NO_CONTENT)

    def perform_create(self, serializer):
        org_id = self.kwargs.get("organization_pk")
        serializer.save(
            organization_id=org_id,
            theme_type="custom",  # User-created themes are always custom
            created_by=self.request.user
        )
