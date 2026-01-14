"""
Serializers for audit log API endpoints.
"""

from rest_framework import serializers
from .models import AuditLogBatch, AuditLogEntry, AuditLogReference


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
    references = AuditLogReferenceSerializer(many=True, read_only=True)
    target_type = serializers.CharField(
        source="target_content_type.model", read_only=True
    )

    class Meta:
        model = AuditLogEntry
        fields = [
            "id",
            "action",
            "action_detail",
            "message",
            "target_type",
            "target_object_id",
            "target_repr",
            "changes",
            "metadata",
            "references",
            "order",
            "created_at",
        ]


class AuditLogBatchSerializer(serializers.ModelSerializer):
    entries = AuditLogEntrySerializer(many=True, read_only=True)
    username = serializers.CharField(
        source="user.username", read_only=True, allow_null=True
    )

    class Meta:
        model = AuditLogBatch
        fields = [
            "id",
            "user",
            "username",
            "user_email",
            "request_id",
            "request_method",
            "request_path",
            "request_query_params",
            "ip_address",
            "organization_id",
            "workspace_id",
            "created_at",
            "duration_ms",
            "entry_count",
            "summary",
            "entries",
        ]


class AuditLogBatchSummarySerializer(serializers.ModelSerializer):
    """Lightweight serializer without nested entries."""

    username = serializers.CharField(
        source="user.username", read_only=True, allow_null=True
    )

    class Meta:
        model = AuditLogBatch
        fields = [
            "id",
            "user",
            "username",
            "user_email",
            "request_method",
            "request_path",
            "organization_id",
            "workspace_id",
            "created_at",
            "entry_count",
            "summary",
        ]
