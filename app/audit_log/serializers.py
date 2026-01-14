"""
Serializers for audit log API endpoints.
"""

from rest_framework import serializers
from .models import AuditLogRequest, AuditLogEntry, AuditLogReference


class AuditLogReferenceSerializer(serializers.ModelSerializer):
    content_type_name = serializers.CharField(
        source="content_type.model", read_only=True
    )

    class Meta:
        model = AuditLogReference
        fields = [
            "id",
            "content_type",
            "content_type_name",
            "object_id",
            "object_repr",
            "role",
        ]


class AuditLogEntrySerializer(serializers.ModelSerializer):
    """Entry serializer with action-specific fields and request context."""

    references = AuditLogReferenceSerializer(many=True, read_only=True)
    target_type = serializers.CharField(
        source="target_content_type.model", read_only=True, allow_null=True
    )
    # Request context from related AuditLogRequest
    username = serializers.CharField(
        source="request.user.username", read_only=True, allow_null=True
    )
    user_id = serializers.UUIDField(
        source="request.user_id", read_only=True, allow_null=True
    )
    user_email = serializers.EmailField(source="request.user_email", read_only=True)
    request_id = serializers.CharField(source="request.request_id", read_only=True)
    request_method = serializers.CharField(
        source="request.request_method", read_only=True
    )
    request_path = serializers.CharField(source="request.request_path", read_only=True)
    request_query_params = serializers.JSONField(
        source="request.request_query_params", read_only=True
    )
    ip_address = serializers.IPAddressField(
        source="request.ip_address", read_only=True, allow_null=True
    )
    organization_id = serializers.UUIDField(
        source="request.organization_id", read_only=True, allow_null=True
    )
    workspace_id = serializers.UUIDField(
        source="request.workspace_id", read_only=True, allow_null=True
    )
    duration_ms = serializers.IntegerField(
        source="request.duration_ms", read_only=True, allow_null=True
    )

    class Meta:
        model = AuditLogEntry
        fields = [
            "id",
            "group_id",
            # User info (from request)
            "user_id",
            "username",
            "user_email",
            # Request info (from request)
            "request_id",
            "request_method",
            "request_path",
            "request_query_params",
            "ip_address",
            # Context (from request)
            "organization_id",
            "workspace_id",
            # Action
            "action",
            "action_detail",
            "message",
            # Target
            "target_type",
            "target_object_id",
            "target_repr",
            # Changes
            "changes",
            "metadata",
            # References
            "references",
            # Timing
            "created_at",
            "duration_ms",
            "order",
        ]


class AuditLogEntrySummarySerializer(serializers.ModelSerializer):
    """Lightweight serializer for list views."""

    target_type = serializers.CharField(
        source="target_content_type.model", read_only=True, allow_null=True
    )
    username = serializers.CharField(
        source="request.user.username", read_only=True, allow_null=True
    )
    user_email = serializers.EmailField(source="request.user_email", read_only=True)
    request_method = serializers.CharField(
        source="request.request_method", read_only=True
    )
    request_path = serializers.CharField(source="request.request_path", read_only=True)
    organization_id = serializers.UUIDField(
        source="request.organization_id", read_only=True, allow_null=True
    )
    workspace_id = serializers.UUIDField(
        source="request.workspace_id", read_only=True, allow_null=True
    )

    class Meta:
        model = AuditLogEntry
        fields = [
            "id",
            "group_id",
            "username",
            "user_email",
            "request_method",
            "request_path",
            "organization_id",
            "workspace_id",
            "action",
            "action_detail",
            "message",
            "target_type",
            "target_object_id",
            "target_repr",
            "created_at",
        ]


class AuditLogRequestSerializer(serializers.ModelSerializer):
    """Serializer for AuditLogRequest with nested entries."""

    entries = AuditLogEntrySummarySerializer(many=True, read_only=True)
    username = serializers.CharField(
        source="user.username", read_only=True, allow_null=True
    )
    entry_count = serializers.SerializerMethodField()

    class Meta:
        model = AuditLogRequest
        fields = [
            "id",
            "request_id",
            # User
            "user",
            "username",
            "user_email",
            # Request metadata
            "request_method",
            "request_path",
            "request_query_params",
            "ip_address",
            "user_agent",
            # Context
            "organization",
            "workspace",
            # Timing
            "created_at",
            "duration_ms",
            # Entries
            "entry_count",
            "entries",
        ]

    def get_entry_count(self, obj):
        return obj.entries.count()


class AuditLogRequestSummarySerializer(serializers.ModelSerializer):
    """Lightweight serializer for request list views."""

    username = serializers.CharField(
        source="user.username", read_only=True, allow_null=True
    )
    entry_count = serializers.SerializerMethodField()
    actions = serializers.SerializerMethodField()

    class Meta:
        model = AuditLogRequest
        fields = [
            "id",
            "request_id",
            "username",
            "user_email",
            "request_method",
            "request_path",
            "organization",
            "workspace",
            "created_at",
            "duration_ms",
            "entry_count",
            "actions",
        ]

    def get_entry_count(self, obj):
        return obj.entries.count()

    def get_actions(self, obj):
        return list(obj.entries.values_list("action", flat=True).distinct())
