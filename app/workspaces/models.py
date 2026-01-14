import uuid
from django.conf import settings
from django.db import models
from core.models import SoftDeleteMixin


class Workspace(SoftDeleteMixin):
    """
    Project workspace within an organization.
    Contains asset types, assets, tasks, files, etc.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="workspaces",
    )
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta(SoftDeleteMixin.Meta):
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "name"],
                name="unique_organization_workspace_name",
                condition=models.Q(deleted_at__isnull=True),
            ),
        ]
        ordering = ["organization", "name"]

    def __str__(self):
        return f"{self.name} ({self.organization.name})"


class WorkspaceMembership(SoftDeleteMixin):
    """
    Defines a user's access to a specific workspace.
    User must be an organization member to be granted workspace access.
    """

    PERMISSION_CHOICES = [
        ("read", "Read Only"),
        ("write", "Read & Write"),
        ("admin", "Admin"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="memberships"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="workspace_memberships",
    )
    permission = models.CharField(
        max_length=20, choices=PERMISSION_CHOICES, default="read"
    )
    granted_at = models.DateTimeField(auto_now_add=True)
    granted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="granted_workspace_accesses",
    )

    class Meta(SoftDeleteMixin.Meta):
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "user"],
                name="unique_workspace_user",
                condition=models.Q(deleted_at__isnull=True),
            ),
        ]
        ordering = ["workspace", "-granted_at"]

    def __str__(self):
        return f"{self.user.username} ({self.permission}) in {self.workspace.name}"

    def clean(self):
        """Ensure user is a member of the workspace's organization."""
        from django.core.exceptions import ValidationError
        from organizations.models import OrganizationMembership

        if not OrganizationMembership.objects.filter(
            organization=self.workspace.organization, user=self.user
        ).exists():
            raise ValidationError(
                f"User {self.user.username} must be a member of organization "
                f"{self.workspace.organization.name} before being granted workspace access."
            )

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)
