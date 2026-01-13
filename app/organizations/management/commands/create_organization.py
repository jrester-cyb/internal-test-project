from django.core.management.base import BaseCommand
from organizations.models import Organization


class Command(BaseCommand):
    help = "Create a new organization"

    def add_arguments(self, parser):
        parser.add_argument("name", type=str, help="Name of the organization")
        parser.add_argument(
            "--description",
            type=str,
            default="",
            help="Description of the organization",
        )

    def handle(self, *args, **options):
        name = options["name"]
        description = options["description"]

        org = Organization.objects.create(
            name=name,
            description=description,
        )

        self.stdout.write(
            self.style.SUCCESS(f'Created organization "{org.name}" (ID: {org.id})')
        )
