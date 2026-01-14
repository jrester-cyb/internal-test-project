import uuid
from django.conf import settings
from django.db import models
from core.models import SoftDeleteMixin


class Organization(SoftDeleteMixin):
    """
    Top-level organization that contains multiple workspaces.
    Users must be members of an organization to access any of its workspaces.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta(SoftDeleteMixin.Meta):
        ordering = ["name"]

    def __str__(self):
        return self.name


class OrganizationMembership(SoftDeleteMixin):
    """
    Defines a user's membership in an organization with role-based permissions.
    """

    ROLE_CHOICES = [
        ("owner", "Owner"),
        ("admin", "Admin"),
        ("member", "Member"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="memberships"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="organization_memberships",
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default="member")
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta(SoftDeleteMixin.Meta):
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "user"],
                name="unique_organization_user",
                condition=models.Q(deleted_at__isnull=True),
            ),
        ]
        ordering = ["organization", "-joined_at"]

    def __str__(self):
        return f"{self.user.username} ({self.role}) in {self.organization.name}"
