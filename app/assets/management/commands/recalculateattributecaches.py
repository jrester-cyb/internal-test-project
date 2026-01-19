from django.core.management.base import BaseCommand, CommandError
from django.db import connection
from organizations.models import Organization
from workspaces.models import Workspace
from assets.models import WorkspaceAsset
import uuid


class Command(BaseCommand):
    help = "Recalculate attribute caches for all assets in an organization or workspace"

    def add_arguments(self, parser):
        parser.add_argument(
            "--organization",
            type=str,
            help="Organization ID (UUID) or name",
        )
        parser.add_argument(
            "--workspace",
            type=str,
            help="Workspace ID (UUID) or name (requires --organization)",
        )
        parser.add_argument(
            "--include-workspaces",
            action="store_true",
            help="Include workspace-specific assets when recalculating for organization",
        )

    def handle(self, *args, **options):
        if options["organization"]:
            org_identifier = options["organization"]
            try:
                uuid.UUID(org_identifier)
                org = Organization.objects.get(id=org_identifier)
            except (ValueError, Organization.DoesNotExist):
                try:
                    org = Organization.objects.get(name=org_identifier)
                except Organization.DoesNotExist:
                    raise CommandError(
                        f'Organization with ID or name "{org_identifier}" does not exist'
                    )

            self.stdout.write(
                f"Recalculating attribute caches for organization: {org.name}"
            )

            # Get assets in the organization
            from assets.models import Asset

            scope_desc = "all assets"
            if options["include_workspaces"]:
                assets = Asset.objects.filter(organization=org)
            else:
                # Only global assets (not associated with any workspace)
                assets = Asset.objects.filter(organization=org)

            asset_ids = list(assets.values_list("id", flat=True))

            if not asset_ids:
                self.stdout.write(f"No {scope_desc} found in this organization")
                return

            self.stdout.write(f"Found {len(asset_ids)} {scope_desc}")

            # Call rebuild_asset_cached_attributes for each asset
            with connection.cursor() as cursor:
                for asset_id in asset_ids:
                    cursor.execute(
                        "SELECT rebuild_asset_cached_attributes(%s)", [asset_id]
                    )

        elif options["workspace"]:
            if not options["organization"]:
                raise CommandError(
                    "--organization is required when --workspace is provided"
                )

            # Get organization first
            org_identifier = options["organization"]
            try:
                uuid.UUID(org_identifier)
                org = Organization.objects.get(id=org_identifier)
            except (ValueError, Organization.DoesNotExist):
                try:
                    org = Organization.objects.get(name=org_identifier)
                except Organization.DoesNotExist:
                    raise CommandError(
                        f'Organization with ID or name "{org_identifier}" does not exist'
                    )

            # Get workspace
            workspace_identifier = options["workspace"]
            try:
                uuid.UUID(workspace_identifier)
                workspace = Workspace.objects.get(
                    id=workspace_identifier, organization=org
                )
            except (ValueError, Workspace.DoesNotExist):
                try:
                    workspace = Workspace.objects.get(
                        name=workspace_identifier, organization=org
                    )
                except Workspace.DoesNotExist:
                    raise CommandError(
                        f'Workspace with ID or name "{workspace_identifier}" does not exist in organization {org.name}'
                    )

            self.stdout.write(
                f"Recalculating attribute caches for workspace: {workspace.name} in organization: {org.name}"
            )

            # Get all assets in the workspace
            workspace_assets = WorkspaceAsset.objects.filter(
                workspace=workspace
            ).select_related("asset")
            asset_ids = [wa.asset_id for wa in workspace_assets]

            if not asset_ids:
                self.stdout.write("No assets found in this workspace")
                return

            self.stdout.write(f"Found {len(asset_ids)} assets")

            # Call rebuild functions for each asset
            with connection.cursor() as cursor:
                for asset_id in asset_ids:
                    # Rebuild base cached attributes
                    cursor.execute(
                        "SELECT rebuild_asset_cached_attributes(%s)", [asset_id]
                    )
                    # Rebuild workspace overrides
                    cursor.execute(
                        "SELECT rebuild_workspace_asset_cached_attribute_overrides(%s, %s)",
                        [workspace.id, asset_id],
                    )
                    self.stdout.write(
                        f"Rebuilt cache for asset {asset_id} in workspace {workspace.id}"
                    )

        else:
            raise CommandError(
                "Either --organization or --workspace (with --organization) must be provided"
            )

        self.stdout.write(
            self.style.SUCCESS("Successfully recalculated attribute caches")
        )
