"""
Permission Registry - A developer-friendly way to register permissions.

Usage in your app's apps.py or a dedicated permissions.py file:

    from users_manager.permissions import register_resource, register_permissions

    # Option 1: Register a resource with standard CRUD actions
    register_resource('asset', actions=['read', 'write', 'delete'])

    # Option 2: Register individual permissions with custom actions
    register_permissions('attribute', [
        ('read', 'View attributes'),
        ('write', 'Edit attributes'),
        ('override', 'Override attribute values'),
        ('create_local', 'Create local attributes'),
    ])

    # Option 3: Use the decorator on a class
    @register_resource('event', actions=['create', 'read', 'write', 'delete'])
    class EventConfig:
        pass

Permissions are automatically synced to the database when you run:
    python manage.py sync_permissions
"""

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class PermissionDefinition:
    """Definition of a single permission."""

    resource: str
    action: str
    name: Optional[str] = None
    description: str = ""
    scope: str = "both"  # 'organization', 'workspace', or 'both'

    @property
    def codename(self) -> str:
        return f"{self.resource}:{self.action}"

    def __post_init__(self):
        if not self.name:
            # Auto-generate a human-readable name
            action_name = self.action.replace("_", " ").title()
            resource_name = self.resource.replace("_", " ").title()
            self.name = f"{resource_name} {action_name}"


@dataclass
class ResourceDefinition:
    """Definition of a resource type with its permissions."""

    name: str
    display_name: Optional[str] = None
    description: str = ""
    permissions: list = field(default_factory=list)
    scope: str = "both"  # Default scope for all permissions

    def __post_init__(self):
        if not self.display_name:
            self.display_name = self.name.replace("_", " ").title()


class PermissionRegistry:
    """
    Central registry for all permissions in the system.

    Apps register their permissions here, and they get synced to the database.
    """

    # Standard actions that most resources support
    STANDARD_CRUD = ["create", "read", "write", "delete"]
    STANDARD_READ_WRITE = ["read", "write"]
    STANDARD_MANAGE = ["read", "write", "manage"]

    def __init__(self):
        self._resources: dict[str, ResourceDefinition] = {}
        self._permissions: dict[str, PermissionDefinition] = {}

    def register_resource(
        self,
        name: str,
        *,
        display_name: Optional[str] = None,
        description: str = "",
        actions: Optional[list[str]] = None,
        scope: str = "both",
    ) -> ResourceDefinition:
        """
        Register a resource type with standard actions.

        Args:
            name: The resource identifier (e.g., 'asset', 'file')
            display_name: Human-readable name
            description: Description of the resource
            actions: List of actions (defaults to CRUD)
            scope: 'organization', 'workspace', or 'both'

        Returns:
            The ResourceDefinition for chaining

        Example:
            registry.register_resource('asset', actions=['read', 'write', 'delete'])
        """
        if actions is None:
            actions = self.STANDARD_CRUD

        resource = ResourceDefinition(
            name=name,
            display_name=display_name,
            description=description,
            scope=scope,
        )

        # Create permission for each action
        for action in actions:
            perm = PermissionDefinition(
                resource=name,
                action=action,
                scope=scope,
            )
            resource.permissions.append(perm)
            self._permissions[perm.codename] = perm

        self._resources[name] = resource
        return resource

    def register_permission(
        self,
        resource: str,
        action: str,
        *,
        name: Optional[str] = None,
        description: str = "",
        scope: str = "both",
    ) -> PermissionDefinition:
        """
        Register a single permission.

        Example:
            registry.register_permission('attribute', 'override',
                description='Override inherited attribute values')
        """
        perm = PermissionDefinition(
            resource=resource,
            action=action,
            name=name,
            description=description,
            scope=scope,
        )

        self._permissions[perm.codename] = perm

        # Add to resource if it exists
        if resource in self._resources:
            self._resources[resource].permissions.append(perm)

        return perm

    def register_permissions(
        self,
        resource: str,
        permissions: list[tuple[str, str] | tuple[str, str, str]],
        *,
        scope: str = "both",
    ) -> list[PermissionDefinition]:
        """
        Register multiple permissions for a resource.

        Args:
            resource: The resource name
            permissions: List of (action, description) or (action, name, description) tuples
            scope: Default scope for all permissions

        Example:
            registry.register_permissions('attribute', [
                ('read', 'View attribute values'),
                ('write', 'Edit attribute values'),
                ('override', 'Override Attributes', 'Override inherited values'),
            ])
        """
        results = []
        for perm_tuple in permissions:
            if len(perm_tuple) == 2:
                action, description = perm_tuple
                name = None
            else:
                action, name, description = perm_tuple

            perm = self.register_permission(
                resource,
                action,
                name=name,
                description=description,
                scope=scope,
            )
            results.append(perm)

        return results

    def get_permission(self, codename: str) -> Optional[PermissionDefinition]:
        """Get a permission by its codename."""
        return self._permissions.get(codename)

    def get_resource(self, name: str) -> Optional[ResourceDefinition]:
        """Get a resource by its name."""
        return self._resources.get(name)

    def all_permissions(self) -> list[PermissionDefinition]:
        """Get all registered permissions."""
        return list(self._permissions.values())

    def all_resources(self) -> list[ResourceDefinition]:
        """Get all registered resources."""
        return list(self._resources.values())

    def permissions_for_scope(self, scope: str) -> list[PermissionDefinition]:
        """Get all permissions valid for a specific scope."""
        return [
            p
            for p in self._permissions.values()
            if p.scope == "both" or p.scope == scope
        ]

    def sync_to_database(self):
        """
        Sync all registered permissions to the database.
        Creates new permissions and updates existing ones.
        """
        from users_manager.models import Permission

        created_count = 0
        updated_count = 0

        for perm_def in self._permissions.values():
            perm, created = Permission.objects.update_or_create(
                codename=perm_def.codename,
                defaults={
                    "name": perm_def.name,
                    "description": perm_def.description,
                    "resource_type": perm_def.resource,
                    "action": perm_def.action,
                },
            )
            if created:
                created_count += 1
            else:
                updated_count += 1

        return created_count, updated_count


# Global registry instance
permission_registry = PermissionRegistry()


# Convenience functions that operate on the global registry
def register_resource(
    name: str,
    *,
    display_name: Optional[str] = None,
    description: str = "",
    actions: Optional[list[str]] = None,
    scope: str = "both",
) -> ResourceDefinition:
    """Register a resource type with the global registry."""
    return permission_registry.register_resource(
        name,
        display_name=display_name,
        description=description,
        actions=actions,
        scope=scope,
    )


def register_permission(
    resource: str,
    action: str,
    *,
    name: Optional[str] = None,
    description: str = "",
    scope: str = "both",
) -> PermissionDefinition:
    """Register a single permission with the global registry."""
    return permission_registry.register_permission(
        resource,
        action,
        name=name,
        description=description,
        scope=scope,
    )


def register_permissions(
    resource: str,
    permissions: list[tuple[str, str] | tuple[str, str, str]],
    *,
    scope: str = "both",
) -> list[PermissionDefinition]:
    """Register multiple permissions with the global registry."""
    return permission_registry.register_permissions(
        resource,
        permissions,
        scope=scope,
    )
