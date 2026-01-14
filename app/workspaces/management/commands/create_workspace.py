from django.core.management.base import BaseCommand, CommandError
from django.core.exceptions import ValidationError
from organizations.models import Organization
from workspaces.models import Workspace
from audit_log import log_action


class Command(BaseCommand):
    help = "Create a new workspace within an organization"

    def add_arguments(self, parser):
        parser.add_argument("name", type=str, help="Name of the workspace")
        parser.add_argument(
            "--organization",
            type=str,
            required=True,
            help="Organization ID or name",
        )
        parser.add_argument(
            "--description",
            type=str,
            default="",
            help="Description of the workspace",
        )

    def handle(self, *args, **options):
        name = options["name"]
        org_identifier = options["organization"]
        description = options["description"]

        # Try to find organization by ID first, then by name
        try:
            org = Organization.objects.get(id=org_identifier)
        except (Organization.DoesNotExist, ValueError, ValidationError):
            try:
                org = Organization.objects.get(name=org_identifier)
            except Organization.DoesNotExist:
                raise CommandError(f'Organization "{org_identifier}" not found')

        workspace = Workspace.objects.create(
            organization=org,
            name=name,
            description=description,
        )

        # Log to audit log
        log_action(
            action="create",
            message=f"Created workspace '{workspace.name}' in organization '{org.name}' via management command",
            references=[workspace, org],
            metadata={"command": "create_workspace"},
            source="management_command",
        )

        self.stdout.write(
            self.style.SUCCESS(
                f'Created workspace "{workspace.name}" (ID: {workspace.id}) '
                f'in organization "{org.name}"'
            )
        )
