from django.core.management.base import BaseCommand
from audit_log.logging import audit_group
from organizations.models import Organization
from workspaces.models import Workspace
from audit_log import log_action

DEFAULT_WORKSPACE_NAME = "Default Workspace"
DEFAULT_WORKSPACE_DESCRIPTION = ""


class Command(BaseCommand):
    help = "Interactive wizard to create a new organization and optional workspace"

    def add_arguments(self, parser):
        parser.add_argument(
            "--no-input",
            "--noinput",
            action="store_false",
            dest="interactive",
            help="Run non-interactively using provided arguments",
        )

        # Organization arguments (for non-interactive mode)
        org_group = parser.add_argument_group("organization", "Organization options")
        org_group.add_argument("--org-name", type=str, help="Name of the organization")
        org_group.add_argument(
            "--org-description",
            type=str,
            default="",
            help="Description of the organization",
        )

        # Workspace arguments (for non-interactive mode)
        ws_group = parser.add_argument_group("workspace", "Workspace options")
        ws_group.add_argument(
            "--create-workspace", action="store_true", help="Create a default workspace"
        )
        ws_group.add_argument(
            "--workspace-name",
            type=str,
            default=DEFAULT_WORKSPACE_NAME,
            help="Name of the workspace",
        )
        ws_group.add_argument(
            "--workspace-description",
            type=str,
            default=DEFAULT_WORKSPACE_DESCRIPTION,
            help="Description of the workspace",
        )

    def prompt(self, message, default=None, required=True):
        """Prompt user for input with optional default value."""
        if default:
            prompt_text = f"{message} [{default}]: "
        else:
            prompt_text = f"{message}: "

        while True:
            value = input(prompt_text).strip()
            if not value and default:
                return default
            if value:
                return value
            if not required:
                return ""
            self.stderr.write(self.style.ERROR("  This field is required."))

    def confirm(self, message, default=False):
        """Prompt for yes/no confirmation."""
        suffix = " [y/N]: " if not default else " [Y/n]: "
        response = input(message + suffix).strip().lower()
        if not response:
            return default
        return response in ("y", "yes")

    def print_header(self, text):
        """Print a styled section header."""
        self.stdout.write("")
        self.stdout.write(self.style.MIGRATE_HEADING(f"═══ {text} ═══"))
        self.stdout.write("")

    def print_summary(self, title, items):
        """Print a summary box."""
        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS(f"┌─ {title} ─"))
        for key, value in items:
            self.stdout.write(f"│  {key}: {self.style.WARNING(value)}")
        self.stdout.write(self.style.SUCCESS("└" + "─" * 40))
        self.stdout.write("")

    def handle(self, *args, **options):
        interactive = options["interactive"]

        if interactive:
            self.run_interactive_wizard()
        else:
            self.run_non_interactive(options)

    def run_interactive_wizard(self):
        """Run the interactive wizard flow."""

        with audit_group(
            "Organization setup wizard",
            source_type="management_command",
            source_name="startorganization",
        ):
            self.stdout.write("")
            self.stdout.write(
                self.style.SUCCESS("╔════════════════════════════════════════╗")
            )
            self.stdout.write(
                self.style.SUCCESS("║   Organization Setup Wizard            ║")
            )
            self.stdout.write(
                self.style.SUCCESS("╚════════════════════════════════════════╝")
            )

            # Step 1: Organization
            self.print_header("Step 1: Create Organization")
            self.stdout.write("Let's set up your new organization.\n")

            org_name = self.prompt("Organization name")
            org_description = self.prompt("Description (optional)", required=False)

            # Confirm organization creation
            self.print_summary(
                "Organization Details",
                [
                    ("Name", org_name),
                    ("Description", org_description or "(none)"),
                ],
            )

            if not self.confirm("Create this organization?", default=True):
                self.stdout.write(self.style.WARNING("Cancelled."))
                return

            # Create organization
            org = Organization.objects.create(
                name=org_name,
                description=org_description,
            )

            log_action(
                action="create",
                message=f"Created organization '{org.name}' via setup wizard",
                references=[org],
                metadata={"command": "startorganization"},
                source="management_command",
            )

            self.stdout.write(
                self.style.SUCCESS(f"✓ Created organization: {org.name} (ID: {org.id})")
            )

            # Step 2: Workspace (optional)
            self.print_header("Step 2: Create Workspace (Optional)")

            if self.confirm("Would you like to create a workspace?", default=True):
                ws_name = self.prompt("Workspace name", default=DEFAULT_WORKSPACE_NAME)
                ws_description = self.prompt(
                    "Workspace description (optional)", required=False
                )

                self.print_summary(
                    "Workspace Details",
                    [
                        ("Name", ws_name),
                        ("Description", ws_description or "(none)"),
                        ("Organization", org.name),
                    ],
                )

                if self.confirm("Create this workspace?", default=True):
                    workspace = Workspace.objects.create(
                        organization=org,
                        name=ws_name,
                        description=ws_description,
                    )

                    log_action(
                        action="create",
                        message=f"Created workspace '{workspace.name}' via setup wizard",
                        references=[workspace, org],
                        metadata={"command": "startorganization"},
                        source="management_command",
                    )

                    self.stdout.write(
                        self.style.SUCCESS(
                            f"✓ Created workspace: {workspace.name} (ID: {workspace.id})"
                        )
                    )

            # Done
            self.stdout.write("")
            self.stdout.write(self.style.SUCCESS("═══ Setup Complete! ═══"))
            self.stdout.write("")

    def run_non_interactive(self, options):
        """Run non-interactively using provided arguments."""
        org_name = options.get("org_name")
        if not org_name:
            self.stderr.write(
                self.style.ERROR("--org-name is required in non-interactive mode")
            )
            return

        with audit_group(
            f"Create organization: {org_name}",
            source_type="management_command",
            source_name="startorganization",
        ):
            org = Organization.objects.create(
                name=org_name,
                description=options.get("org_description", ""),
            )

            log_action(
                action="create",
                message=f"Created organization '{org.name}' via management command",
                references=[org],
                metadata={"command": "startorganization"},
                source="management_command",
            )

            self.stdout.write(
                self.style.SUCCESS(f'Created organization "{org.name}" (ID: {org.id})')
            )

            if options.get("create_workspace"):
                workspace = Workspace.objects.create(
                    organization=org,
                    name=options.get("workspace_name", DEFAULT_WORKSPACE_NAME),
                    description=options.get(
                        "workspace_description", DEFAULT_WORKSPACE_DESCRIPTION
                    ),
                )

                log_action(
                    action="create",
                    message=f"Created workspace '{workspace.name}' via management command",
                    references=[workspace, org],
                    metadata={"command": "startorganization"},
                    source="management_command",
                )

                self.stdout.write(
                    self.style.SUCCESS(
                        f'Created workspace "{workspace.name}" (ID: {workspace.id})'
                    )
                )
