from django.contrib import admin
from .models import Workspace, WorkspaceMembership


@admin.register(Workspace)
class WorkspaceAdmin(admin.ModelAdmin):
    list_display = ["name", "organization", "slug", "created_at"]
    list_filter = ["organization"]
    search_fields = ["name", "slug", "organization__name"]
    readonly_fields = ["id", "created_at", "updated_at"]


@admin.register(WorkspaceMembership)
class WorkspaceMembershipAdmin(admin.ModelAdmin):
    list_display = ["user", "workspace", "permission", "granted_at", "granted_by"]
    list_filter = ["permission", "workspace__organization"]
    search_fields = ["user__username", "user__email", "workspace__name"]
    readonly_fields = ["id", "granted_at"]
