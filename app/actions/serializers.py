"""
Serializers for the actions app.
"""

from rest_framework import serializers
from .models import Trigger, Action, ActionExecution


class ActionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Action
        fields = [
            "id",
            "name",
            "action_type",
            "config",
            "order",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class TriggerSerializer(serializers.ModelSerializer):
    actions = ActionSerializer(many=True, read_only=True)
    target_type = serializers.CharField(
        source="target_content_type.model",
        read_only=True,
        allow_null=True,
    )

    class Meta:
        model = Trigger
        fields = [
            "id",
            "name",
            "description",
            "event_action",
            "target_type",
            "target_content_type",
            "source_filter",
            "organization",
            "workspace",
            "is_active",
            "actions",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class TriggerListSerializer(serializers.ModelSerializer):
    target_type = serializers.CharField(
        source="target_content_type.model",
        read_only=True,
        allow_null=True,
    )
    action_count = serializers.SerializerMethodField()

    class Meta:
        model = Trigger
        fields = [
            "id",
            "name",
            "event_action",
            "target_type",
            "is_active",
            "action_count",
            "created_at",
        ]

    def get_action_count(self, obj):
        return obj.actions.count()


class ActionExecutionSerializer(serializers.ModelSerializer):
    action_name = serializers.CharField(source="action.name", read_only=True)
    trigger_name = serializers.CharField(source="action.trigger.name", read_only=True)

    class Meta:
        model = ActionExecution
        fields = [
            "id",
            "action",
            "action_name",
            "trigger_name",
            "audit_entry",
            "status",
            "result",
            "started_at",
            "completed_at",
            "created_at",
        ]
        read_only_fields = fields
