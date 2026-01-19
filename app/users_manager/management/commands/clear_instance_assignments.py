"""
Management command to clear all instance-level role assignments from users and groups.

This removes all InstanceMember and InstanceGroupMember records, effectively
revoking all instance-level permissions from all users and groups.

Usage:
    python manage.py clear_instance_assignments
    python manage.py clear_instance_assignments --users-only
    python manage.py clear_instance_assignments --groups-only
"""

from django.core.management.base import BaseCommand

from users_manager.models import InstanceMember, InstanceGroupMember


class Command(BaseCommand):
    help = "Clear all instance-level role assignments from users and groups"

    def add_arguments(self, parser):
        parser.add_argument(
            "--users-only",
            action="store_true",
            help="Only clear direct user assignments (InstanceMember)",
        )
        parser.add_argument(
            "--groups-only",
            action="store_true",
            help="Only clear group assignments (InstanceGroupMember)",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be deleted without actually deleting",
        )

    def handle(self, *args, **options):
        users_only = options["users_only"]
        groups_only = options["groups_only"]
        dry_run = options["dry_run"]

        if users_only and groups_only:
            self.stderr.write(
                self.style.ERROR("Cannot specify both --users-only and --groups-only")
            )
            return

        # Clear user assignments
        if not groups_only:
            user_count = InstanceMember.objects.count()
            if user_count > 0:
                if dry_run:
                    self.stdout.write(
                        f"Would delete {user_count} direct user instance role assignments"
                    )
                    for member in InstanceMember.objects.select_related("user", "role"):
                        self.stdout.write(f"  - {member.user.email}: {member.role.name}")
                else:
                    InstanceMember.objects.all().delete()
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"Deleted {user_count} direct user instance role assignments"
                        )
                    )
            else:
                self.stdout.write("No direct user instance role assignments to delete")

        # Clear group assignments
        if not users_only:
            group_count = InstanceGroupMember.objects.count()
            if group_count > 0:
                if dry_run:
                    self.stdout.write(
                        f"Would delete {group_count} group instance role assignments"
                    )
                    for member in InstanceGroupMember.objects.select_related("group", "role"):
                        self.stdout.write(f"  - {member.group.name}: {member.role.name}")
                else:
                    InstanceGroupMember.objects.all().delete()
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"Deleted {group_count} group instance role assignments"
                        )
                    )
            else:
                self.stdout.write("No group instance role assignments to delete")

        if dry_run:
            self.stdout.write(
                self.style.WARNING("\nThis was a dry run. No changes were made.")
            )
