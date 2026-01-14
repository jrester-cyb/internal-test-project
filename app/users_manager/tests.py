from django.test import TestCase
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
    get_user_organization_permissions,
    get_user_workspace_permissions,
)


class PermissionModelTest(TestCase):
    def test_create_permission(self):
        permission = Permission.objects.create(
            name="Can View Assets",
            codename="asset:read",
            description="Allows viewing of assets",
            resource_type="asset",
            action="read",
        )
        self.assertEqual(str(permission), "Can View Assets (asset:read)")
        self.assertEqual(permission.resource_type, "asset")
        self.assertEqual(permission.action, "read")

    def test_auto_generate_codename(self):
        permission = Permission.objects.create(
            name="Can Write Assets", resource_type="asset", action="write"
        )
        self.assertEqual(permission.codename, "asset:write")

    def test_custom_resource_and_action(self):
        """Test that any resource/action string can be used."""
        permission = Permission.objects.create(
            name="Custom Permission",
            resource_type="custom_resource",
            action="custom_action",
        )
        self.assertEqual(permission.codename, "custom_resource:custom_action")


class RoleModelTest(TestCase):
    def test_create_organization_role(self):
        role = Role.objects.create(
            name="Admin",
            description="Administrator role",
            scope=Role.Scope.ORGANIZATION,
        )
        self.assertEqual(str(role), "Admin (Organization)")
        self.assertEqual(role.scope, "organization")

    def test_create_workspace_role(self):
        role = Role.objects.create(
            name="Editor",
            description="Can edit workspace content",
            scope=Role.Scope.WORKSPACE,
        )
        self.assertEqual(str(role), "Editor (Workspace)")

    def test_role_with_permissions(self):
        permission = Permission.objects.create(
            name="Can Edit",
            codename="asset:write",
            resource_type=Permission.ResourceType.ASSET,
            action=Permission.Action.WRITE,
        )
        role = Role.objects.create(name="Editor", scope=Role.Scope.WORKSPACE)
        role.permissions.add(permission)

        self.assertTrue(role.has_permission("asset:write"))
        self.assertFalse(role.has_permission("asset:delete"))


class GroupModelTest(TestCase):
    def test_create_group(self):
        group = Group.objects.create(name="Engineering", description="Engineering team")
        self.assertEqual(str(group), "Engineering")

    def test_group_membership(self):
        group = Group.objects.create(name="Engineering")
        user = User.objects.create_user(email="dev@example.com", password="testpass123")

        membership = GroupMembership.objects.create(group=group, user=user)

        self.assertEqual(membership.group, group)
        self.assertEqual(membership.user, user)
        self.assertIn(user, [m.user for m in group.memberships.all()])


class UserModelTest(TestCase):
    def test_create_user(self):
        user = User.objects.create_user(
            email="test@example.com",
            password="testpass123",
            first_name="Test",
            last_name="User",
        )
        self.assertEqual(user.email, "test@example.com")
        self.assertTrue(user.check_password("testpass123"))
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)

    def test_create_superuser(self):
        admin = User.objects.create_superuser(
            email="admin@example.com", password="adminpass123"
        )
        self.assertTrue(admin.is_staff)
        self.assertTrue(admin.is_superuser)

    def test_user_full_name(self):
        user = User.objects.create_user(
            email="test@example.com",
            password="testpass123",
            first_name="John",
            last_name="Doe",
        )
        self.assertEqual(user.get_full_name(), "John Doe")

    def test_user_groups(self):
        user = User.objects.create_user(
            email="test@example.com", password="testpass123"
        )
        group1 = Group.objects.create(name="Group 1")
        group2 = Group.objects.create(name="Group 2")

        GroupMembership.objects.create(group=group1, user=user)
        GroupMembership.objects.create(group=group2, user=user)

        user_groups = user.get_groups()
        self.assertEqual(user_groups.count(), 2)


class PermissionRegistryTest(TestCase):
    def test_register_resource(self):
        from users_manager.permissions import PermissionRegistry

        registry = PermissionRegistry()
        resource = registry.register_resource(
            "test_resource", actions=["read", "write"]
        )

        self.assertEqual(resource.name, "test_resource")
        self.assertEqual(len(resource.permissions), 2)
        self.assertIn("test_resource:read", [p.codename for p in resource.permissions])
        self.assertIn("test_resource:write", [p.codename for p in resource.permissions])

    def test_register_permission(self):
        from users_manager.permissions import PermissionRegistry

        registry = PermissionRegistry()
        perm = registry.register_permission(
            "custom", "special_action", description="A special action"
        )

        self.assertEqual(perm.codename, "custom:special_action")
        self.assertEqual(perm.name, "Custom Special Action")

    def test_register_permissions(self):
        from users_manager.permissions import PermissionRegistry

        registry = PermissionRegistry()
        perms = registry.register_permissions(
            "widget",
            [
                ("view", "View widgets"),
                ("configure", "Configure Widget", "Configure widget settings"),
            ],
        )

        self.assertEqual(len(perms), 2)
        self.assertEqual(perms[0].codename, "widget:view")
        self.assertEqual(perms[1].name, "Configure Widget")

    def test_sync_to_database(self):
        from users_manager.permissions import PermissionRegistry

        registry = PermissionRegistry()
        registry.register_resource("sync_test", actions=["read", "write"])

        created, updated = registry.sync_to_database()

        self.assertEqual(created, 2)
        self.assertTrue(Permission.objects.filter(codename="sync_test:read").exists())
        self.assertTrue(Permission.objects.filter(codename="sync_test:write").exists())
