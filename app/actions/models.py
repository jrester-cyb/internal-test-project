"""
Models for the actions app.

Triggers subscribe to audit log events and execute actions when conditions are met.
"""

import uuid
from django.db import models
from django.contrib.contenttypes.models import ContentType


class Trigger(models.Model):
    """
    A trigger that listens for specific audit log events.

    When an AuditLogEntry matches the trigger's conditions,
    the associated actions are executed.
    """

    class EventAction(models.TextChoices):
        CREATE = "create", "Create"
        UPDATE = "update", "Update"
        DELETE = "delete", "Delete"
        READ = "read", "Read"
        ANY = "any", "Any"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)

    # What to listen for
    event_action = models.CharField(
        max_length=50,
        choices=EventAction.choices,
        default=EventAction.ANY,
        help_text="The action type to trigger on",
    )
    target_content_type = models.ForeignKey(
        ContentType,
        on_delete=models.CASCADE,
        help_text="The model type to trigger on (e.g., Organization, Workspace)",
    )
    reference_role = models.CharField(
        max_length=50,
        blank=True,
        help_text="When matching references, only match this role (e.g., 'affected', 'created', 'parent'). Leave blank to match any role.",
    )

    # Optional filtering
    source_filter = models.CharField(
        max_length=50,
        blank=True,
        help_text="Only trigger for specific sources (api, management_command, etc.)",
    )

    # Scoping
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="triggers",
        help_text="Limit trigger to specific organization (null = global)",
    )
    workspace = models.ForeignKey(
        "workspaces.Workspace",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="triggers",
        help_text="Limit trigger to specific workspace",
    )

    # State
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        target = self.target_content_type.model if self.target_content_type else "any"
        return f"{self.name} ({self.event_action} {target})"

    def matches(self, entry):
        """Check if an AuditLogEntry matches this trigger's conditions."""
        # Check action
        if self.event_action != self.EventAction.ANY:
            if entry.action != self.event_action:
                return False

        # Check target type - match if it's the direct target OR in references
        type_matched = False

        # Check direct target
        if entry.target_content_type == self.target_content_type:
            type_matched = True

        # Check references (e.g., organization created via wizard has it in references)
        if not type_matched:
            for ref in entry.references.all():
                if ref.content_type == self.target_content_type:
                    # If reference_role is specified, only match that role
                    if self.reference_role:
                        if ref.role == self.reference_role:
                            type_matched = True
                            break
                    else:
                        type_matched = True
                        break

        if not type_matched:
            return False

        # Check source filter
        if self.source_filter and entry.request:
            if entry.request.source != self.source_filter:
                return False

        # Check organization scope
        if self.organization and entry.request:
            if entry.request.organization_object_id != str(self.organization_id):
                return False

        # Check workspace scope
        if self.workspace and entry.request:
            if entry.request.workspace_object_id != str(self.workspace_id):
                return False

        return True


class Action(models.Model):
    """
    An action to execute when a trigger fires.

    Multiple actions can be attached to a single trigger.
    """

    class ActionType(models.TextChoices):
        WEBHOOK = "webhook", "Webhook"
        EMAIL = "email", "Email Notification"
        CELERY_TASK = "celery_task", "Celery Task"
        LOG = "log", "Log Message"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    trigger = models.ForeignKey(
        Trigger,
        on_delete=models.CASCADE,
        related_name="actions",
    )
    name = models.CharField(max_length=255)
    action_type = models.CharField(
        max_length=50,
        choices=ActionType.choices,
    )

    # Configuration based on action_type
    config = models.JSONField(
        default=dict,
        help_text="Action-specific configuration (webhook URL, email template, task name, etc.)",
    )

    # Execution settings
    order = models.PositiveIntegerField(
        default=0,
        help_text="Order in which actions are executed (lower = first)",
    )
    is_active = models.BooleanField(default=True)

    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["trigger", "order"]

    def __str__(self):
        return f"{self.name} ({self.action_type})"


class ActionExecution(models.Model):
    """
    Record of an action execution.

    Tracks when actions were triggered and their results.
    """

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        RUNNING = "running", "Running"
        SUCCESS = "success", "Success"
        FAILED = "failed", "Failed"
        SKIPPED = "skipped", "Skipped"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    action = models.ForeignKey(
        Action,
        on_delete=models.CASCADE,
        related_name="executions",
    )
    audit_entry = models.ForeignKey(
        "audit_log.AuditLogEntry",
        on_delete=models.CASCADE,
        related_name="action_executions",
    )

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )
    result = models.JSONField(
        default=dict,
        blank=True,
        help_text="Execution result or error details",
    )

    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.action.name} - {self.status}"
