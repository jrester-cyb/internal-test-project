"""
Django admin configuration for audit logs.
"""

from django.contrib import admin
from django.utils.html import format_html
from .models import (
    AuditLogEntry,
    AuditLogReference,
    AuditLogPendingBatch,
)


class AuditLogReferenceInline(admin.TabularInline):
    model = AuditLogReference
    extra = 0
    readonly_fields = ["content_type", "object_id", "object_repr", "role"]
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(AuditLogEntry)
class AuditLogEntryAdmin(admin.ModelAdmin):
    list_display = [
        "created_at",
        "batch_id_short",
        "user_email",
        "request_method",
        "request_path_short",
        "action",
        "message_short",
        "target_repr",
        "organization_id",
        "workspace_id",
    ]
    list_filter = [
        "action",
        "request_method",
        "created_at",
    ]
    search_fields = [
        "user_email",
        "request_path",
        "request_id",
        "batch_id",
        "message",
        "target_repr",
    ]
    readonly_fields = [
        "id",
        "batch_id",
        "user",
        "user_email",
        "request_id",
        "request_method",
        "request_path",
        "request_query_params",
        "ip_address",
        "user_agent",
        "organization_id",
        "workspace_id",
        "action",
        "action_detail",
        "message",
        "target_content_type",
        "target_object_id",
        "target_repr",
        "changes",
        "metadata",
        "created_at",
        "duration_ms",
        "order",
    ]
    inlines = [AuditLogReferenceInline]
    date_hierarchy = "created_at"
    ordering = ["-created_at"]

    def batch_id_short(self, obj):
        """Show first 8 chars of batch_id."""
        return str(obj.batch_id)[:8]

    batch_id_short.short_description = "Batch"

    def request_path_short(self, obj):
        """Truncate long paths."""
        path = obj.request_path
        return path[:50] + "..." if len(path) > 50 else path

    request_path_short.short_description = "Path"

    def message_short(self, obj):
        """Truncate long messages."""
        msg = obj.message
        return msg[:50] + "..." if len(msg) > 50 else msg

    message_short.short_description = "Message"

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        # Allow superusers to delete for cleanup
        return request.user.is_superuser


@admin.register(AuditLogReference)
class AuditLogReferenceAdmin(admin.ModelAdmin):
    list_display = [
        "entry",
        "content_type",
        "object_id",
        "object_repr",
        "role",
    ]
    list_filter = [
        "role",
        "content_type",
    ]
    search_fields = [
        "object_id",
        "object_repr",
    ]
    readonly_fields = [
        "id",
        "entry",
        "content_type",
        "object_id",
        "object_repr",
        "role",
    ]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return request.user.is_superuser


@admin.register(AuditLogPendingBatch)
class AuditLogPendingBatchAdmin(admin.ModelAdmin):
    list_display = [
        "created_at",
        "processed",
        "processed_at",
        "has_error",
    ]
    list_filter = [
        "processed",
        "created_at",
    ]
    readonly_fields = [
        "id",
        "data",
        "created_at",
        "processed",
        "processed_at",
        "error",
    ]
    ordering = ["-created_at"]

    def has_error(self, obj):
        return bool(obj.error)

    has_error.boolean = True
    has_error.short_description = "Error?"

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
