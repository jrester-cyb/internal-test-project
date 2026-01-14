"""
Serializers for audit log API endpoints.
"""

from rest_framework import serializers
from .models import AuditLogEntry, AuditLogReference


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
    """Full entry serializer with all fields."""

    references = AuditLogReferenceSerializer(many=True, read_only=True)
    target_type = serializers.CharField(
        source="target_content_type.model", read_only=True, allow_null=True
    )
    username = serializers.CharField(
        source="user.username", read_only=True, allow_null=True
    )

    class Meta:
        model = AuditLogEntry
        fields = [
            "id",
            "batch_id",
            # User info
            "user",
            "username",
            "user_email",
            # Request info
            "request_id",
            "request_method",
            "request_path",
            "request_query_params",
            "ip_address",
            # Context
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
        source="user.username", read_only=True, allow_null=True
    )

    class Meta:
        model = AuditLogEntry
        fields = [
            "id",
            "batch_id",
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


class AuditLogBatchGroupSerializer(serializers.Serializer):
    """Serializer for grouped batch view."""

    batch_id = serializers.UUIDField()
    user = serializers.IntegerField(allow_null=True)
    username = serializers.CharField(allow_null=True)
    user_email = serializers.EmailField()
    request_method = serializers.CharField()
    request_path = serializers.CharField()
    organization_id = serializers.UUIDField(allow_null=True)
    workspace_id = serializers.UUIDField(allow_null=True)
    created_at = serializers.DateTimeField()
    duration_ms = serializers.IntegerField(allow_null=True)
    entry_count = serializers.IntegerField()
    actions = serializers.ListField(child=serializers.CharField())
