from django.core.management.base import BaseCommand
from users_manager.models import Role
from users_manager.permissions import permission_registry
from users_manager.permissions.defaults import register_default_permissions


class Command(BaseCommand):
    help = "Sync permissions from registry to database and create default roles"

    def add_arguments(self, parser):
        parser.add_argument(
            "--roles",
            action="store_true",
            help="Also create/update default roles",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be created without making changes",
        )

    def handle(self, *args, **options):
        dry_run = options.get("dry_run", False)
        create_roles = options.get("roles", False)

        # Register default permissions
        register_default_permissions()

        self.stdout.write("Syncing permissions from registry...\n")

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN - No changes will be made\n"))
            for perm in permission_registry.all_permissions():
                self.stdout.write(f"  Would create: {perm.codename} ({perm.name})")
        else:
            created, updated = permission_registry.sync_to_database()
            self.stdout.write(
                self.style.SUCCESS(f"  Created: {created}, Updated: {updated}")
            )

        if create_roles:
            self.stdout.write("\nCreating default roles...\n")
            if not dry_run:
                self._create_default_roles()

        self.stdout.write(self.style.SUCCESS("\nDone!"))

    def _create_default_roles(self):
        """Create default system roles."""
        from users_manager.models import Permission

        # Helper to get permissions by codename prefix
        def get_perms(*codenames):
            return list(Permission.objects.filter(codename__in=codenames))

        def get_perms_starting_with(*prefixes):
            from django.db.models import Q

            query = Q()
            for prefix in prefixes:
                query |= Q(codename__startswith=prefix)
            return list(Permission.objects.filter(query))

        # Instance Roles (system-wide administration)
        instance_roles = [
            {
                "name": "Instance Admin",
                "description": "Full administrative access to the entire application instance",
                "scope": Role.Scope.INSTANCE,
                "is_system_role": True,
                "permissions": lambda: get_perms(
                    "instance:manage",
                    "organization:create",
                    "organization:read",
                    "organization:write",
                    "organization:delete",
                    "user:create",
                    "user:read",
                    "user:write",
                    "user:delete",
                    "role:create",
                    "role:read",
                    "role:write",
                    "role:delete",
                ),
            },
            {
                "name": "Organization Manager",
                "description": "Manage organizations and their members",
                "scope": Role.Scope.INSTANCE,
                "is_system_role": True,
                "permissions": lambda: get_perms(
                    "organization:create",
                    "organization:read",
                    "organization:write",
                    "organization:delete",
                    "user:read",
                ),
            },
            {
                "name": "User Manager",
                "description": "Manage user accounts across the instance",
                "scope": Role.Scope.INSTANCE,
                "is_system_role": True,
                "permissions": lambda: get_perms(
                    "user:create",
                    "user:read",
                    "user:write",
                    "user:delete",
                    "role:read",
                ),
            },
        ]

        # Organization Roles
        org_roles = [
            {
                "name": "Organization Owner",
                "description": "Full access to organization and all resources",
                "scope": Role.Scope.ORGANIZATION,
                "is_system_role": True,
                "permissions": lambda: get_perms_starting_with(
                    "organization:",
                    "asset_type:",
                    "asset:",
                    "file:",
                    "user:",
                    "group:",
                    "role:",
                ),
            },
            {
                "name": "Organization Admin",
                "description": "Manage organization settings and users",
                "scope": Role.Scope.ORGANIZATION,
                "is_system_role": True,
                "permissions": lambda: get_perms(
                    "organization:read",
                    "organization:manage",
                    "asset_type:read",
                    "asset_type:write",
                    "asset:read",
                    "asset:write",
                    "file:read",
                    "file:write",
                    "user:read",
                    "user:write",
                    "group:read",
                    "group:write",
                    "role:read",
                ),
            },
            {
                "name": "Organization Member",
                "description": "Basic read access to organization",
                "scope": Role.Scope.ORGANIZATION,
                "is_system_role": True,
                "permissions": lambda: get_perms(
                    "organization:read",
                    "asset_type:read",
                    "asset:read",
                    "file:read",
                    "user:read",
                    "group:read",
                ),
            },
        ]

        # Workspace Roles
        workspace_roles = [
            {
                "name": "Workspace Admin",
                "description": "Full access to workspace resources",
                "scope": Role.Scope.WORKSPACE,
                "is_system_role": True,
                "permissions": lambda: get_perms_starting_with(
                    "workspace:",
                    "asset_type:",
                    "asset:",
                    "file:",
                    "attribute:",
                    "event:",
                ),
            },
            {
                "name": "Workspace Editor",
                "description": "Create and edit workspace content",
                "scope": Role.Scope.WORKSPACE,
                "is_system_role": True,
                "permissions": lambda: get_perms(
                    "workspace:read",
                    "asset_type:read",
                    "asset:read",
                    "asset:write",
                    "file:read",
                    "file:write",
                    "attribute:read",
                    "attribute:write",
                    "attribute:override",
                    "event:create",
                    "event:read",
                    "event:write",
                ),
            },
            {
                "name": "Workspace Contributor",
                "description": "Add and edit own content",
                "scope": Role.Scope.WORKSPACE,
                "is_system_role": True,
                "permissions": lambda: get_perms(
                    "workspace:read",
                    "asset_type:read",
                    "asset:read",
                    "asset:write",
                    "file:read",
                    "file:write",
                    "attribute:read",
                    "attribute:override",
                    "event:create",
                    "event:read",
                ),
            },
            {
                "name": "Workspace Viewer",
                "description": "Read-only access to workspace",
                "scope": Role.Scope.WORKSPACE,
                "is_system_role": True,
                "permissions": lambda: get_perms(
                    "workspace:read",
                    "asset_type:read",
                    "asset:read",
                    "file:read",
                    "attribute:read",
                    "event:read",
                ),
            },
        ]

        for role_def in instance_roles + org_roles + workspace_roles:
            role, created = Role.objects.get_or_create(
                name=role_def["name"],
                scope=role_def["scope"],
                defaults={
                    "description": role_def["description"],
                    "is_system_role": role_def["is_system_role"],
                },
            )

            # Set permissions (callable to defer DB queries)
            perms = role_def["permissions"]()
            role.permissions.set(perms)

            status = "Created" if created else "Updated"
            self.stdout.write(f"  {status}: {role.name} ({len(perms)} permissions)")
