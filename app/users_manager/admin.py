from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
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


@admin.register(Permission)
class PermissionAdmin(admin.ModelAdmin):
    list_display = ("name", "codename", "resource_type", "action", "created_at")
    list_filter = ("resource_type", "action")
    search_fields = ("name", "codename", "description")
    ordering = ("resource_type", "action")


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ("name", "scope", "is_system_role", "created_at")
    list_filter = ("scope", "is_system_role")
    search_fields = ("name", "description")
    filter_horizontal = ("permissions",)
    ordering = ("scope", "name")


class GroupMembershipInline(admin.TabularInline):
    model = GroupMembership
    extra = 1
    autocomplete_fields = ["user"]


@admin.register(Group)
class GroupAdmin(admin.ModelAdmin):
    list_display = ("name", "member_count", "created_at")
    search_fields = ("name", "description")
    ordering = ("name",)
    inlines = [GroupMembershipInline]

    def member_count(self, obj):
        return obj.memberships.count()

    member_count.short_description = "Members"


@admin.register(GroupMembership)
class GroupMembershipAdmin(admin.ModelAdmin):
    list_display = ("user", "group", "added_at", "added_by")
    list_filter = ("group",)
    search_fields = ("user__email", "group__name")
    autocomplete_fields = ["user", "group", "added_by"]


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = (
        "email",
        "first_name",
        "last_name",
        "is_active",
        "is_staff",
        "date_joined",
    )
    list_filter = ("is_active", "is_staff", "is_superuser", "is_verified")
    search_fields = ("email", "first_name", "last_name")
    ordering = ("email",)
    filter_horizontal = ("user_permissions",)

    fieldsets = (
        (None, {"fields": ("email", "password")}),
        (
            "Personal info",
            {"fields": ("first_name", "last_name", "avatar", "phone_number")},
        ),
        (
            "Permissions",
            {
                "fields": (
                    "is_active",
                    "is_staff",
                    "is_superuser",
                    "is_verified",
                    "user_permissions",
                ),
            },
        ),
        ("Important dates", {"fields": ("last_login",)}),
    )

    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": (
                    "email",
                    "password1",
                    "password2",
                    "first_name",
                    "last_name",
                ),
            },
        ),
    )


@admin.register(OrganizationMember)
class OrganizationMemberAdmin(admin.ModelAdmin):
    list_display = ("user", "organization", "role", "is_owner", "joined_at")
    list_filter = ("role", "is_owner", "organization")
    search_fields = ("user__email", "organization__name")
    autocomplete_fields = ["user", "organization", "role"]


@admin.register(OrganizationGroupMember)
class OrganizationGroupMemberAdmin(admin.ModelAdmin):
    list_display = ("group", "organization", "role", "added_at", "added_by")
    list_filter = ("role", "organization")
    search_fields = ("group__name", "organization__name")
    autocomplete_fields = ["group", "organization", "role", "added_by"]


@admin.register(WorkspaceMember)
class WorkspaceMemberAdmin(admin.ModelAdmin):
    list_display = ("user", "workspace", "role", "granted_at", "granted_by")
    list_filter = ("role", "workspace")
    search_fields = ("user__email", "workspace__name")
    autocomplete_fields = ["user", "workspace", "role", "granted_by"]


@admin.register(WorkspaceGroupMember)
class WorkspaceGroupMemberAdmin(admin.ModelAdmin):
    list_display = ("group", "workspace", "role", "granted_at", "granted_by")
    list_filter = ("role", "workspace")
    search_fields = ("group__name", "workspace__name")
    autocomplete_fields = ["group", "workspace", "role", "granted_by"]
