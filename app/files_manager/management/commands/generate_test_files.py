from django.core.management.base import BaseCommand
from workspaces.models import Workspace
from files_manager.models import Directory, File


class Command(BaseCommand):
    help = "Generate test files and folders for pagination testing"

    def add_arguments(self, parser):
        parser.add_argument(
            "--workspace-id",
            type=int,
            required=True,
            help="Workspace ID to create test data in",
        )
        parser.add_argument(
            "--count",
            type=int,
            default=150,
            help="Number of test files to create (default: 150)",
        )

    def handle(self, *args, **options):
        workspace_id = options["workspace_id"]
        count = options["count"]

        try:
            workspace = Workspace.objects.get(id=workspace_id)
        except Workspace.DoesNotExist:
            self.stdout.write(
                self.style.ERROR(f"Workspace with ID {workspace_id} not found")
            )
            return

        # Get or create root directory
        root_dir = Directory.get_or_create_root(workspace)

        # Create a test folder with lots of files
        test_dir, created = Directory.objects.get_or_create(
            name="Test Large Folder",
            parent=root_dir,
            workspace=workspace,
        )

        if created:
            self.stdout.write(
                self.style.SUCCESS(f"Created test directory: {test_dir.name}")
            )
        else:
            self.stdout.write(f"Using existing test directory: {test_dir.name}")

        # Create test files
        created_count = 0
        for i in range(1, count + 1):
            file_name = f"test_file_{i:03d}.txt"

            # Check if file already exists
            if not File.objects.filter(name=file_name, parent=test_dir).exists():
                File.objects.create(
                    name=file_name,
                    parent=test_dir,
                    workspace=workspace,
                    file_size=1024 * i,  # Varying file sizes
                    mime_type="text/plain",
                )
                created_count += 1

        # Create some test subdirectories
        for i in range(1, 11):
            subdir_name = f"Subfolder {i:02d}"
            subdir, created = Directory.objects.get_or_create(
                name=subdir_name,
                parent=test_dir,
                workspace=workspace,
            )
            if created:
                created_count += 1

                # Add a few files to each subdirectory
                for j in range(1, 6):
                    File.objects.create(
                        name=f"subfile_{j}.txt",
                        parent=subdir,
                        workspace=workspace,
                        file_size=512 * j,
                        mime_type="text/plain",
                    )

        self.stdout.write(
            self.style.SUCCESS(
                f"Test data generation complete! Created {created_count} new items in '{test_dir.name}'"
            )
        )

        total_items = (
            File.objects.filter(parent=test_dir).count()
            + Directory.objects.filter(parent=test_dir).count()
        )
        self.stdout.write(f"Total items in test folder: {total_items}")
