"""
API views for the actions app.
"""

from rest_framework import viewsets
from rest_framework.permissions import AllowAny

from .models import Trigger, Action, ActionExecution
from .serializers import (
    TriggerSerializer,
    TriggerListSerializer,
    ActionSerializer,
    ActionExecutionSerializer,
)


class TriggerViewSet(viewsets.ModelViewSet):
    """
    API endpoint for managing triggers.
    """

    queryset = Trigger.objects.prefetch_related("actions").select_related(
        "target_content_type", "organization", "workspace"
    )
    serializer_class = TriggerSerializer
    permission_classes = [AllowAny]  # TODO: Replace with proper permissions

    def get_serializer_class(self):
        if self.action == "list":
            return TriggerListSerializer
        return TriggerSerializer

    def get_queryset(self):
        qs = super().get_queryset()

        # Filter by organization
        org_id = self.request.query_params.get("organization_id")
        if org_id:
            qs = qs.filter(organization_id=org_id)

        # Filter by workspace
        workspace_id = self.request.query_params.get("workspace_id")
        if workspace_id:
            qs = qs.filter(workspace_id=workspace_id)

        # Filter by event_action
        event_action = self.request.query_params.get("event_action")
        if event_action:
            qs = qs.filter(event_action=event_action)

        # Filter by active status
        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() == "true")

        return qs.order_by("-created_at")


class ActionViewSet(viewsets.ModelViewSet):
    """
    API endpoint for managing actions.
    """

    queryset = Action.objects.select_related("trigger")
    serializer_class = ActionSerializer
    permission_classes = [AllowAny]  # TODO: Replace with proper permissions

    def get_queryset(self):
        qs = super().get_queryset()

        # Filter by trigger
        trigger_id = self.request.query_params.get("trigger_id")
        if trigger_id:
            qs = qs.filter(trigger_id=trigger_id)

        # Filter by action_type
        action_type = self.request.query_params.get("action_type")
        if action_type:
            qs = qs.filter(action_type=action_type)

        return qs.order_by("trigger", "order")


class ActionExecutionViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint for viewing action executions.
    """

    queryset = ActionExecution.objects.select_related(
        "action", "action__trigger", "audit_entry"
    )
    serializer_class = ActionExecutionSerializer
    permission_classes = [AllowAny]  # TODO: Replace with proper permissions

    def get_queryset(self):
        qs = super().get_queryset()

        # Filter by action
        action_id = self.request.query_params.get("action_id")
        if action_id:
            qs = qs.filter(action_id=action_id)

        # Filter by trigger
        trigger_id = self.request.query_params.get("trigger_id")
        if trigger_id:
            qs = qs.filter(action__trigger_id=trigger_id)

        # Filter by status
        status = self.request.query_params.get("status")
        if status:
            qs = qs.filter(status=status)

        # Filter by audit entry
        entry_id = self.request.query_params.get("entry_id")
        if entry_id:
            qs = qs.filter(audit_entry_id=entry_id)

        return qs.order_by("-created_at")
