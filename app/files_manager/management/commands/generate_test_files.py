import random

from django.core.management.base import BaseCommand

from files_manager.models import Directory, DocumentFile, FileNode
from workspaces.models import Workspace

# Word lists for generating realistic names
ADJECTIVES = [
    "new", "old", "final", "draft", "temp", "backup", "archive", "shared",
    "private", "public", "internal", "external", "main", "test", "dev",
    "prod", "staging", "legacy", "current", "previous", "next", "beta",
    "alpha", "stable", "experimental", "core", "base", "common", "custom",
]

NOUNS = [
    "documents", "images", "photos", "videos", "audio", "data", "files",
    "reports", "assets", "resources", "templates", "configs", "logs",
    "exports", "imports", "downloads", "uploads", "backups", "archives",
    "projects", "clients", "vendors", "products", "services", "users",
    "teams", "departments", "regions", "campaigns", "events", "meetings",
    "contracts", "invoices", "orders", "inventory", "marketing", "sales",
]

YEARS = ["2022", "2023", "2024", "2025", "2026"]
QUARTERS = ["Q1", "Q2", "Q3", "Q4"]


def generate_directory_name():
    """Generate a realistic directory name."""
    patterns = [
        lambda: f"{random.choice(ADJECTIVES)}_{random.choice(NOUNS)}",
        lambda: f"{random.choice(NOUNS)}_{random.choice(YEARS)}",
        lambda: f"{random.choice(YEARS)}_{random.choice(QUARTERS)}",
        lambda: random.choice(NOUNS),
        lambda: f"{random.choice(ADJECTIVES)}-{random.choice(NOUNS)}",
        lambda: f"{random.choice(NOUNS)}-{random.randint(1, 100):03d}",
        lambda: f"v{random.randint(1, 10)}.{random.randint(0, 9)}",
        lambda: f"batch_{random.randint(1, 1000)}",
        lambda: f"project_{random.choice(['alpha', 'beta', 'gamma', 'delta'])}",
    ]
    return random.choice(patterns)()


def generate_file_name():
    """Generate a realistic file name."""
    extensions = [".txt", ".pdf", ".doc", ".xlsx", ".csv", ".json", ".xml"]
    base_names = [
        "report", "summary", "data", "export", "backup", "notes", "draft",
        "final", "review", "analysis", "document", "file", "record", "log",
    ]
    patterns = [
        lambda: f"{random.choice(base_names)}_{random.randint(1, 999):03d}{random.choice(extensions)}",
        lambda: f"{random.choice(ADJECTIVES)}_{random.choice(base_names)}{random.choice(extensions)}",
        lambda: f"{random.choice(YEARS)}_{random.choice(QUARTERS)}_{random.choice(base_names)}{random.choice(extensions)}",
    ]
    return random.choice(patterns)()


class Command(BaseCommand):
    help = "Generate test files and folders for pagination testing"

    def add_arguments(self, parser):
        parser.add_argument(
            "--workspace-id",
            type=str,
            required=True,
            help="Workspace UUID to create test data in",
        )
        parser.add_argument(
            "--directories",
            type=int,
            default=50,
            help="Number of directories to create (default: 50)",
        )
        parser.add_argument(
            "--files",
            type=int,
            default=100,
            help="Number of files to create (default: 100)",
        )
        parser.add_argument(
            "--max-depth",
            type=int,
            default=4,
            help="Maximum directory depth (default: 4)",
        )
        parser.add_argument(
            "--parent-id",
            type=str,
            default=None,
            help="Parent directory UUID (optional, defaults to workspace root)",
        )

    def handle(self, *args, **options):
        workspace_id = options["workspace_id"]
        num_directories = options["directories"]
        num_files = options["files"]
        max_depth = options["max_depth"]
        parent_id = options["parent_id"]

        try:
            workspace = Workspace.objects.get(id=workspace_id)
        except Workspace.DoesNotExist:
            self.stdout.write(
                self.style.ERROR(f"Workspace with ID {workspace_id} not found")
            )
            return

        # Get parent directory
        if parent_id:
            try:
                parent = Directory.objects.get(id=parent_id, workspace=workspace)
            except Directory.DoesNotExist:
                self.stdout.write(
                    self.style.ERROR(f"Parent directory {parent_id} not found")
                )
                return
        else:
            parent = Directory.get_or_create_root(workspace)

        self.stdout.write(f"Generating test data in workspace '{workspace.name}'")
        self.stdout.write(f"  Parent: {parent.name} ({parent.id})")
        self.stdout.write(f"  Directories: {num_directories}")
        self.stdout.write(f"  Files: {num_files}")
        self.stdout.write(f"  Max depth: {max_depth}")
        self.stdout.write("")

        # Create directories
        created_dirs = [parent]
        dir_count = 0

        for i in range(num_directories):
            # Pick a random parent from existing directories
            # Bias toward shallower directories
            potential_parents = [d for d in created_dirs if self._get_depth(d, parent) < max_depth]
            if not potential_parents:
                potential_parents = [parent]

            chosen_parent = random.choice(potential_parents)

            # Generate unique name
            name = generate_directory_name()
            existing_names = set(
                Directory.objects.filter(parent=chosen_parent, workspace=workspace)
                .values_list("name", flat=True)
            )
            attempts = 0
            while name in existing_names and attempts < 20:
                name = generate_directory_name()
                attempts += 1

            if name in existing_names:
                name = f"{name}_{i}"

            try:
                directory = Directory.objects.create(
                    name=name,
                    parent=chosen_parent,
                    workspace=workspace,
                )
                created_dirs.append(directory)
                dir_count += 1

                if dir_count % 10 == 0:
                    self.stdout.write(f"  Created {dir_count}/{num_directories} directories...")
            except Exception as e:
                self.stdout.write(self.style.WARNING(f"  Failed to create directory: {e}"))

        # Create files spread across directories
        file_count = 0

        for i in range(num_files):
            # Pick a random directory
            chosen_dir = random.choice(created_dirs)

            # Generate unique file name
            name = generate_file_name()
            existing_names = set(
                FileNode.objects.filter(parent=chosen_dir, workspace=workspace)
                .values_list("name", flat=True)
            )
            attempts = 0
            while name in existing_names and attempts < 20:
                name = generate_file_name()
                attempts += 1

            if name in existing_names:
                name = f"file_{i}_{name}"

            try:
                # Use DocumentFile as a concrete file type
                DocumentFile.objects.create(
                    name=name,
                    parent=chosen_dir,
                    workspace=workspace,
                    size=random.randint(1024, 10 * 1024 * 1024),
                    mime_type="application/octet-stream",
                )
                file_count += 1

                if file_count % 20 == 0:
                    self.stdout.write(f"  Created {file_count}/{num_files} files...")
            except Exception as e:
                self.stdout.write(self.style.WARNING(f"  Failed to create file: {e}"))

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                f"Done! Created {dir_count} directories and {file_count} files."
            )
        )

        # Show total counts
        total_dirs = Directory.objects.filter(workspace=workspace).count()
        total_files = FileNode.objects.filter(workspace=workspace).exclude(
            id__in=Directory.objects.filter(workspace=workspace).values("id")
        ).count()
        self.stdout.write(f"Total in workspace: {total_dirs} directories, {total_files} files")

    def _get_depth(self, directory, root):
        """Calculate depth of directory from root."""
        depth = 0
        current = directory
        while current and current.id != root.id:
            depth += 1
            current = current.parent
        return depth
