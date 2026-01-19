"""
Default permissions for the system.

This file registers all core permissions using the registry.
Apps can add their own permissions in their apps.py ready() method.
"""

from .registry import register_resource, register_permissions


def register_default_permissions():
    """Register all default system permissions."""

    # ==========================================================================
    # Instance-scoped resources (system-wide administration)
    # ==========================================================================

    register_resource(
        "instance",
        actions=["manage"],
        scope="instance",
        description="Instance-wide system settings",
    )

    register_resource(
        "organization",
        actions=["create", "read", "write", "delete"],
        scope="instance",
        description="Organization management at instance level",
    )

    register_resource(
        "user",
        actions=["create", "read", "write", "delete"],
        scope="instance",
        description="User management at instance level",
    )

    register_resource(
        "role",
        actions=["create", "read", "write", "delete"],
        scope="instance",
        description="Role management at instance level",
    )

    # ==========================================================================
    # Organization-scoped resources
    # ==========================================================================

    register_resource(
        "organization",
        actions=["read", "manage"],
        scope="organization",
        description="Organization settings and configuration",
    )

    register_resource(
        "user",
        actions=["read", "write", "manage"],
        scope="organization",
        description="User management within an organization",
    )

    register_resource(
        "group",
        actions=["read", "write", "manage"],
        scope="organization",
        description="Group management",
    )

    register_resource(
        "role",
        actions=["read", "write", "manage"],
        scope="organization",
        description="Role and permission management",
    )

    # ==========================================================================
    # Shared resources (both scopes)
    # ==========================================================================

    register_resource(
        "asset_type",
        actions=["read", "write", "delete"],
        scope="both",
        description="Asset type definitions",
    )

    register_resource(
        "asset",
        actions=["read", "write", "delete"],
        scope="both",
        description="Individual assets",
    )

    register_resource(
        "file",
        actions=["read", "write", "delete"],
        scope="both",
        description="File attachments",
    )

    # ==========================================================================
    # Workspace-scoped resources
    # ==========================================================================

    register_resource(
        "workspace",
        actions=["read", "manage"],
        scope="workspace",
        description="Workspace settings and configuration",
    )

    # Attributes have special actions
    register_permissions(
        "attribute",
        [
            ("read", "View attribute values"),
            ("write", "Edit attribute values"),
            ("override", "Override inherited attribute values"),
            ("create_local", "Create workspace-local attributes"),
        ],
        scope="workspace",
    )

    # Events (forms, notes, tasks, etc.)
    register_resource(
        "event",
        actions=["create", "read", "write", "delete"],
        scope="workspace",
        description="Events like form submissions, notes, tasks",
    )
