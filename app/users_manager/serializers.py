from rest_framework import serializers
from .models import (
    User,
    Group,
    GroupMembership,
    Role,
    Permission,
    OrganizationMember,
    OrganizationGroupMember,
    WorkspaceMember,
    WorkspaceGroupMember,
)


# =============================================================================
# Permission & Role Serializers
# =============================================================================


class PermissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Permission
        fields = [
            "id",
            "name",
            "codename",
            "description",
            "resource_type",
            "action",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class RoleSerializer(serializers.ModelSerializer):
    permissions = PermissionSerializer(many=True, read_only=True)
    permission_ids = serializers.PrimaryKeyRelatedField(
        queryset=Permission.objects.all(),
        many=True,
        write_only=True,
        source="permissions",
        required=False,
    )

    class Meta:
        model = Role
        fields = [
            "id",
            "name",
            "description",
            "scope",
            "permissions",
            "permission_ids",
            "is_system_role",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class RoleMinimalSerializer(serializers.ModelSerializer):
    """Minimal role serializer for nested representations."""

    class Meta:
        model = Role
        fields = ["id", "name", "scope"]


# =============================================================================
# Group Serializers
# =============================================================================


class GroupMembershipSerializer(serializers.ModelSerializer):
    user_email = serializers.CharField(source="user.email", read_only=True)
    user_name = serializers.CharField(source="user.get_full_name", read_only=True)

    class Meta:
        model = GroupMembership
        fields = [
            "id",
            "group",
            "user",
            "user_email",
            "user_name",
            "added_at",
            "added_by",
        ]
        read_only_fields = ["id", "added_at", "added_by"]


class GroupSerializer(serializers.ModelSerializer):
    member_count = serializers.SerializerMethodField()

    class Meta:
        model = Group
        fields = [
            "id",
            "name",
            "description",
            "member_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_member_count(self, obj):
        return obj.memberships.count()


class GroupDetailSerializer(GroupSerializer):
    """Group serializer with member details."""

    members = GroupMembershipSerializer(source="memberships", many=True, read_only=True)

    class Meta(GroupSerializer.Meta):
        fields = GroupSerializer.Meta.fields + ["members"]


# =============================================================================
# User Serializers
# =============================================================================


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source="get_full_name", read_only=True)
    groups = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "first_name",
            "last_name",
            "full_name",
            "avatar",
            "phone_number",
            "is_active",
            "is_staff",
            "is_verified",
            "groups",
            "date_joined",
            "last_login",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "date_joined",
            "last_login",
            "updated_at",
            "full_name",
        ]

    def get_groups(self, obj):
        memberships = obj.group_memberships.select_related("group")
        return [{"id": m.group.id, "name": m.group.name} for m in memberships]


class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    group_ids = serializers.PrimaryKeyRelatedField(
        queryset=Group.objects.all(), many=True, write_only=True, required=False
    )

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "password",
            "first_name",
            "last_name",
            "avatar",
            "phone_number",
            "group_ids",
        ]
        read_only_fields = ["id"]

    def create(self, validated_data):
        group_ids = validated_data.pop("group_ids", [])
        password = validated_data.pop("password")

        user = User.objects.create_user(password=password, **validated_data)

        # Add user to groups
        for group in group_ids:
            GroupMembership.objects.create(
                group=group,
                user=user,
                added_by=(
                    self.context["request"].user
                    if self.context.get("request")
                    else None
                ),
            )

        return user


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(required=True)
    new_password = serializers.CharField(required=True, min_length=8)

    def validate_old_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Old password is incorrect.")
        return value


# =============================================================================
# Organization Membership Serializers
# =============================================================================


class OrganizationMemberSerializer(serializers.ModelSerializer):
    user_email = serializers.CharField(source="user.email", read_only=True)
    user_name = serializers.CharField(source="user.get_full_name", read_only=True)
    role_name = serializers.CharField(source="role.name", read_only=True)
    organization_name = serializers.CharField(
        source="organization.name", read_only=True
    )

    class Meta:
        model = OrganizationMember
        fields = [
            "id",
            "organization",
            "organization_name",
            "user",
            "user_email",
            "user_name",
            "role",
            "role_name",
            "is_owner",
            "joined_at",
            "updated_at",
        ]
        read_only_fields = ["id", "joined_at", "updated_at"]


class OrganizationGroupMemberSerializer(serializers.ModelSerializer):
    group_name = serializers.CharField(source="group.name", read_only=True)
    role_name = serializers.CharField(source="role.name", read_only=True)
    organization_name = serializers.CharField(
        source="organization.name", read_only=True
    )

    class Meta:
        model = OrganizationGroupMember
        fields = [
            "id",
            "organization",
            "organization_name",
            "group",
            "group_name",
            "role",
            "role_name",
            "added_at",
            "added_by",
        ]
        read_only_fields = ["id", "added_at", "added_by"]


# =============================================================================
# Workspace Membership Serializers
# =============================================================================


class WorkspaceMemberSerializer(serializers.ModelSerializer):
    user_email = serializers.CharField(source="user.email", read_only=True)
    user_name = serializers.CharField(source="user.get_full_name", read_only=True)
    role_name = serializers.CharField(source="role.name", read_only=True)
    workspace_name = serializers.CharField(source="workspace.name", read_only=True)

    class Meta:
        model = WorkspaceMember
        fields = [
            "id",
            "workspace",
            "workspace_name",
            "user",
            "user_email",
            "user_name",
            "role",
            "role_name",
            "granted_at",
            "granted_by",
        ]
        read_only_fields = ["id", "granted_at", "granted_by"]


class WorkspaceGroupMemberSerializer(serializers.ModelSerializer):
    group_name = serializers.CharField(source="group.name", read_only=True)
    role_name = serializers.CharField(source="role.name", read_only=True)
    workspace_name = serializers.CharField(source="workspace.name", read_only=True)

    class Meta:
        model = WorkspaceGroupMember
        fields = [
            "id",
            "workspace",
            "workspace_name",
            "group",
            "group_name",
            "role",
            "role_name",
            "granted_at",
            "granted_by",
        ]
        read_only_fields = ["id", "granted_at", "granted_by"]
