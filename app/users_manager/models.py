import uuid
from django.contrib.auth.models import (
    AbstractBaseUser,
    BaseUserManager,
    PermissionsMixin,
)
from django.db import models


# =============================================================================
# Permission System
# =============================================================================


class Permission(models.Model):
    """
    Individual permissions that define what actions can be performed on resources.

    Permissions use a codename format of "resource:action", e.g.:
        - asset:read, asset:write, asset:delete
        - attribute:override, attribute:create_local
        - event:create, event:read

    New resource types and actions can be registered dynamically via the
    permission registry in users_manager.permissions.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255, help_text="Human-readable name")
    codename = models.CharField(
        max_length=100,
        unique=True,
        help_text='Machine-readable code, e.g., "asset:read"',
    )
    description = models.TextField(blank=True)
    resource_type = models.CharField(
        max_length=50,
        db_index=True,
        help_text="The type of resource (e.g., asset, file, event)",
    )
    action = models.CharField(
        max_length=50,
        db_index=True,
        help_text="The action (e.g., read, write, delete, override)",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["resource_type", "action"]
        constraints = [
            models.UniqueConstraint(
                fields=["resource_type", "action"], name="unique_resource_action"
            )
        ]

    def __str__(self):
        return f"{self.name} ({self.codename})"

    def save(self, *args, **kwargs):
        # Auto-generate codename if not provided
        if not self.codename:
            self.codename = f"{self.resource_type}:{self.action}"
        super().save(*args, **kwargs)


class Role(models.Model):
    """
    Roles define a set of permissions that can be assigned to users or groups.

    Roles are scoped to Instance, Organization, or Workspace level:
    - Instance roles: Define what a user can do across the entire application instance
    - Organization roles: Define what a user can do across the organization
    - Workspace roles: Define what a user can do within a specific workspace
    """

    class Scope(models.TextChoices):
        INSTANCE = "instance", "Instance"
        ORGANIZATION = "organization", "Organization"
        WORKSPACE = "workspace", "Workspace"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    scope = models.CharField(
        max_length=20, choices=Scope.choices, help_text="Where this role can be applied"
    )
    permissions = models.ManyToManyField(Permission, related_name="roles", blank=True)
    is_system_role = models.BooleanField(
        default=False,
        help_text="System roles cannot be deleted or modified by organization admins.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["scope", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["name", "scope"], name="unique_role_name_per_scope"
            )
        ]

    def __str__(self):
        return f"{self.name} ({self.get_scope_display()})"

    def has_permission(self, codename):
        """Check if this role has a specific permission."""
        return self.permissions.filter(codename=codename).exists()


# =============================================================================
# Group System
# =============================================================================


class Group(models.Model):
    """
    Groups are collections of users for easier permission management.

    System admins create groups and assign users to them.
    Groups can then be assigned to Organizations or Workspaces with specific roles.
    This allows bulk permission management instead of individual user assignment.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255, unique=True)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name

    def get_all_users(self):
        """Get all users in this group."""
        return self.members.all()


# =============================================================================
# User Model
# =============================================================================


class CustomUserManager(BaseUserManager):
    """Custom user manager for the User model."""

    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("The Email field must be set")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_active", True)

        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")

        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    """
    Custom user model for authentication.

    Users exist at the system level and can be members of:
    - Multiple Groups (for bulk permission assignment)
    - Multiple Organizations (via OrganizationMembership)
    - Multiple Workspaces (via WorkspaceMembership)
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    first_name = models.CharField(max_length=150, blank=True)
    last_name = models.CharField(max_length=150, blank=True)

    # Profile fields
    avatar = models.URLField(blank=True, null=True)
    phone_number = models.CharField(max_length=20, blank=True)

    # Status fields
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    is_verified = models.BooleanField(default=False)

    # Security fields
    lock_expiration = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Account is locked until this time due to failed login attempts",
    )

    # Timestamps
    date_joined = models.DateTimeField(auto_now_add=True)
    last_login = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = CustomUserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    class Meta:
        ordering = ["email"]

    def __str__(self):
        return self.email

    def get_full_name(self):
        """Return the first_name plus the last_name, with a space in between."""
        full_name = f"{self.first_name} {self.last_name}".strip()
        return full_name or self.email

    def get_short_name(self):
        """Return the short name for the user."""
        return self.first_name or self.email.split("@")[0]

    def get_groups(self):
        """Get all groups this user belongs to."""
        return Group.objects.filter(members=self)


class GroupMembership(models.Model):
    """
    Defines a user's membership in a group.
    Groups are used for bulk assignment to organizations/workspaces.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    group = models.ForeignKey(
        Group, on_delete=models.CASCADE, related_name="memberships"
    )
    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="group_memberships"
    )
    added_at = models.DateTimeField(auto_now_add=True)
    added_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, related_name="added_group_members"
    )

    class Meta:
        ordering = ["group", "-added_at"]
        constraints = [
            models.UniqueConstraint(fields=["group", "user"], name="unique_group_user")
        ]

    def __str__(self):
        return f"{self.user.email} in {self.group.name}"


# =============================================================================
# Instance Membership (system-wide roles)
# =============================================================================


class InstanceMember(models.Model):
    """
    Assigns an instance-level role to a user.
    Instance roles grant system-wide permissions (e.g., manage all organizations).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="instance_roles"
    )
    role = models.ForeignKey(
        Role,
        on_delete=models.PROTECT,
        related_name="instance_members",
        limit_choices_to={"scope": Role.Scope.INSTANCE},
    )
    granted_at = models.DateTimeField(auto_now_add=True)
    granted_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="granted_instance_roles",
    )

    class Meta:
        ordering = ["-granted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "role"], name="unique_instance_user_role"
            )
        ]

    def __str__(self):
        return f"{self.user.email} - {self.role.name}"


class InstanceGroupMember(models.Model):
    """
    Assigns an instance-level role to a group.
    All users in the group inherit this role at the instance level.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    group = models.ForeignKey(
        Group, on_delete=models.CASCADE, related_name="instance_roles"
    )
    role = models.ForeignKey(
        Role,
        on_delete=models.PROTECT,
        related_name="instance_group_members",
        limit_choices_to={"scope": Role.Scope.INSTANCE},
    )
    granted_at = models.DateTimeField(auto_now_add=True)
    granted_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="granted_instance_group_roles",
    )

    class Meta:
        ordering = ["-granted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["group", "role"], name="unique_instance_group_role"
            )
        ]

    def __str__(self):
        return f"{self.group.name} - {self.role.name}"


# =============================================================================
# Organization Membership (references organizations.Organization)
# =============================================================================


class OrganizationMember(models.Model):
    """
    Defines a user's direct membership in an organization with a role.
    Users can also be added via OrganizationGroupMember.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="user_members",
    )
    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="organization_members"
    )
    role = models.ForeignKey(
        Role,
        on_delete=models.PROTECT,
        related_name="organization_user_members",
        limit_choices_to={"scope": Role.Scope.ORGANIZATION},
    )
    is_owner = models.BooleanField(
        default=False, help_text="Organization owners have full control"
    )
    joined_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["organization", "-joined_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "user"], name="unique_org_user_member"
            )
        ]

    def __str__(self):
        return f"{self.user.email} ({self.role.name}) in {self.organization.name}"


class OrganizationGroupMember(models.Model):
    """
    Assigns a group to an organization with a specific role.
    All users in the group inherit this role for the organization.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="group_members",
    )
    group = models.ForeignKey(
        Group, on_delete=models.CASCADE, related_name="organization_memberships"
    )
    role = models.ForeignKey(
        Role,
        on_delete=models.PROTECT,
        related_name="organization_group_members",
        limit_choices_to={"scope": Role.Scope.ORGANIZATION},
    )
    added_at = models.DateTimeField(auto_now_add=True)
    added_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name="added_org_group_members",
    )

    class Meta:
        ordering = ["organization", "-added_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "group"], name="unique_org_group_member"
            )
        ]

    def __str__(self):
        return (
            f"Group '{self.group.name}' ({self.role.name}) in {self.organization.name}"
        )


# =============================================================================
# Workspace Membership (references workspaces.Workspace)
# =============================================================================


class WorkspaceMember(models.Model):
    """
    Defines a user's direct membership in a workspace with a role.
    Users can also be added via WorkspaceGroupMember.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        "workspaces.Workspace", on_delete=models.CASCADE, related_name="user_members"
    )
    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="workspace_members"
    )
    role = models.ForeignKey(
        Role,
        on_delete=models.PROTECT,
        related_name="workspace_user_members",
        limit_choices_to={"scope": Role.Scope.WORKSPACE},
    )
    granted_at = models.DateTimeField(auto_now_add=True)
    granted_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name="granted_workspace_members",
    )

    class Meta:
        ordering = ["workspace", "-granted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "user"], name="unique_workspace_user_member"
            )
        ]

    def __str__(self):
        return f"{self.user.email} ({self.role.name}) in {self.workspace.name}"


class WorkspaceGroupMember(models.Model):
    """
    Assigns a group to a workspace with a specific role.
    All users in the group inherit this role for the workspace.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        "workspaces.Workspace", on_delete=models.CASCADE, related_name="group_members"
    )
    group = models.ForeignKey(
        Group, on_delete=models.CASCADE, related_name="workspace_memberships"
    )
    role = models.ForeignKey(
        Role,
        on_delete=models.PROTECT,
        related_name="workspace_group_members",
        limit_choices_to={"scope": Role.Scope.WORKSPACE},
    )
    granted_at = models.DateTimeField(auto_now_add=True)
    granted_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name="granted_workspace_group_members",
    )

    class Meta:
        ordering = ["workspace", "-granted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "group"], name="unique_workspace_group_member"
            )
        ]

    def __str__(self):
        return f"Group '{self.group.name}' ({self.role.name}) in {self.workspace.name}"


# =============================================================================
# Permission Helper Functions (can be added to User model or as utilities)
# =============================================================================


def get_user_organization_permissions(user, organization):
    """
    Get all permissions a user has for an organization.
    Combines direct membership role + group membership roles.
    """
    permissions = set()

    # Direct membership
    try:
        direct = OrganizationMember.objects.get(organization=organization, user=user)
        for perm in direct.role.permissions.all():
            permissions.add(perm.codename)
        if direct.is_owner:
            # Owners have all org-level permissions
            for perm in Permission.objects.filter(
                resource_type__in=[
                    Permission.ResourceType.ORGANIZATION,
                    Permission.ResourceType.ASSET_TYPE,
                    Permission.ResourceType.ASSET,
                    Permission.ResourceType.FILE,
                ]
            ):
                permissions.add(perm.codename)
    except OrganizationMember.DoesNotExist:
        pass

    # Group memberships
    user_groups = Group.objects.filter(memberships__user=user)
    group_memberships = (
        OrganizationGroupMember.objects.filter(
            organization=organization, group__in=user_groups
        )
        .select_related("role")
        .prefetch_related("role__permissions")
    )

    for gm in group_memberships:
        for perm in gm.role.permissions.all():
            permissions.add(perm.codename)

    return permissions


def get_user_workspace_permissions(user, workspace):
    """
    Get all permissions a user has for a workspace.
    Combines direct membership role + group membership roles.
    """
    permissions = set()

    # Direct membership
    try:
        direct = WorkspaceMember.objects.get(workspace=workspace, user=user)
        for perm in direct.role.permissions.all():
            permissions.add(perm.codename)
    except WorkspaceMember.DoesNotExist:
        pass

    # Group memberships
    user_groups = Group.objects.filter(memberships__user=user)
    group_memberships = (
        WorkspaceGroupMember.objects.filter(workspace=workspace, group__in=user_groups)
        .select_related("role")
        .prefetch_related("role__permissions")
    )

    for gm in group_memberships:
        for perm in gm.role.permissions.all():
            permissions.add(perm.codename)

    return permissions


def user_has_organization_permission(user, organization, permission_codename):
    """Check if a user has a specific permission for an organization."""
    return permission_codename in get_user_organization_permissions(user, organization)


def user_has_workspace_permission(user, workspace, permission_codename):
    """Check if a user has a specific permission for a workspace."""
    return permission_codename in get_user_workspace_permissions(user, workspace)


def get_user_instance_permissions(user):
    """
    Get all instance-level permissions a user has.
    Combines direct instance roles + group instance roles.
    """
    permissions = set()

    # Direct instance roles
    direct_roles = InstanceMember.objects.filter(user=user).select_related("role").prefetch_related("role__permissions")
    for im in direct_roles:
        for perm in im.role.permissions.all():
            permissions.add(perm.codename)

    # Group instance roles
    user_groups = Group.objects.filter(memberships__user=user)
    group_roles = (
        InstanceGroupMember.objects.filter(group__in=user_groups)
        .select_related("role")
        .prefetch_related("role__permissions")
    )

    for gm in group_roles:
        for perm in gm.role.permissions.all():
            permissions.add(perm.codename)

    return permissions


def user_has_instance_permission(user, permission_codename):
    """Check if a user has a specific instance-level permission."""
    return permission_codename in get_user_instance_permissions(user)
