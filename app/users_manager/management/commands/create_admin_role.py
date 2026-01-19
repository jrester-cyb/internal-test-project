from django.core.management.base import BaseCommand
from users_manager.models import Permission, Role
from users_manager.permissions import permission_registry
from users_manager.permissions.defaults import register_default_permissions


class Command(BaseCommand):
    help = "Create an admin role with all permissions"

    def add_arguments(self, parser):
        parser.add_argument(
            "--scope",
            type=str,
            choices=["organization", "workspace"],
            default="organization",
            help="Scope for the admin role (default: organization)",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be created without making changes",
        )

    def handle(self, *args, **options):
        dry_run = options.get("dry_run", False)
        scope = options.get("scope", "organization")

        # Ensure permissions are synced to database
        register_default_permissions()
        permission_registry.sync_to_database()

        # Get the scope enum value
        scope_value = (
            Role.Scope.ORGANIZATION
            if scope == "organization"
            else Role.Scope.WORKSPACE
        )

        # Get all permissions
        all_permissions = Permission.objects.all()
        perm_count = all_permissions.count()

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN - No changes will be made\n"))
            self.stdout.write(f"Would create 'Admin' role with {perm_count} permissions:")
            for perm in all_permissions:
                self.stdout.write(f"  - {perm.codename}")
            return

        # Create or update the admin role
        role, created = Role.objects.update_or_create(
            name="Admin",
            scope=scope_value,
            defaults={
                "description": "Full administrative access to all resources and actions",
                "is_system_role": True,
            },
        )

        # Assign all permissions
        role.permissions.set(all_permissions)

        status = "Created" if created else "Updated"
        self.stdout.write(
            self.style.SUCCESS(
                f"{status} 'Admin' role ({scope}) with {perm_count} permissions"
            )
        )
