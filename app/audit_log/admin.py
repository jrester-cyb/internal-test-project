"""
Django admin configuration for audit logs.
"""

from django.contrib import admin
from django.utils.html import format_html
from .models import (
    AuditLogBatch,
    AuditLogEntry,
    AuditLogReference,
    AuditLogPendingBatch,
)


class AuditLogEntryInline(admin.TabularInline):
    model = AuditLogEntry
    extra = 0
    readonly_fields = [
        "action",
        "action_detail",
        "message",
        "target_repr",
        "changes",
        "order",
    ]
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


class AuditLogReferenceInline(admin.TabularInline):
    model = AuditLogReference
    extra = 0
    readonly_fields = ["content_type", "object_id", "object_repr", "role"]
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(AuditLogBatch)
class AuditLogBatchAdmin(admin.ModelAdmin):
    list_display = [
        "created_at",
        "user_email",
        "request_method",
        "request_path",
        "entry_count",
        "duration_ms",
        "organization_id",
        "workspace_id",
    ]
    list_filter = [
        "request_method",
        "created_at",
    ]
    search_fields = [
        "user_email",
        "request_path",
        "request_id",
        "summary",
    ]
    readonly_fields = [
        "id",
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
        "created_at",
        "duration_ms",
        "entry_count",
        "summary",
    ]
    inlines = [AuditLogEntryInline]
    date_hierarchy = "created_at"
    ordering = ["-created_at"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        # Allow superusers to delete for cleanup
        return request.user.is_superuser


@admin.register(AuditLogEntry)
class AuditLogEntryAdmin(admin.ModelAdmin):
    list_display = [
        "created_at",
        "action",
        "action_detail",
        "message_preview",
        "target_repr",
        "batch_link",
    ]
    list_filter = [
        "action",
        "created_at",
    ]
    search_fields = [
        "message",
        "target_repr",
        "action_detail",
    ]
    readonly_fields = [
        "id",
        "batch",
        "action",
        "action_detail",
        "message",
        "target_content_type",
        "target_object_id",
        "target_repr",
        "changes_formatted",
        "metadata_formatted",
        "created_at",
        "order",
    ]
    inlines = [AuditLogReferenceInline]
    date_hierarchy = "created_at"
    ordering = ["-created_at"]

    def message_preview(self, obj):
        return obj.message[:50] + "..." if len(obj.message) > 50 else obj.message

    message_preview.short_description = "Message"

    def batch_link(self, obj):
        return format_html(
            '<a href="/admin/audit_log/auditlogbatch/{}/change/">{}</a>',
            obj.batch_id,
            obj.batch.request_path if obj.batch else "-",
        )

    batch_link.short_description = "Batch"

    def changes_formatted(self, obj):
        import json

        return format_html("<pre>{}</pre>", json.dumps(obj.changes, indent=2))

    changes_formatted.short_description = "Changes"

    def metadata_formatted(self, obj):
        import json

        return format_html("<pre>{}</pre>", json.dumps(obj.metadata, indent=2))

    metadata_formatted.short_description = "Metadata"

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(AuditLogReference)
class AuditLogReferenceAdmin(admin.ModelAdmin):
    list_display = [
        "entry",
        "role",
        "content_type",
        "object_id",
        "object_repr",
    ]
    list_filter = [
        "role",
        "content_type",
    ]
    search_fields = [
        "object_repr",
        "object_id",
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


@admin.register(AuditLogPendingBatch)
class AuditLogPendingBatchAdmin(admin.ModelAdmin):
    list_display = [
        "id",
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

    def has_error(self, obj):
        return bool(obj.error)

    has_error.boolean = True
    has_error.short_description = "Error"

    def has_add_permission(self, request):
        return False
