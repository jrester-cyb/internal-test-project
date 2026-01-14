"""
Audit log models for tracking API actions.

Flattened structure - each entry contains full request context,
with batch_id to group entries from the same request.
"""

import uuid
from django.conf import settings
from django.db import models
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType


class AuditLogEntry(models.Model):
    """
    Audit log entry representing a single action with full request context.

    Each entry contains all the information about the request and the action,
    making it queryable without joins. Entries from the same request share
    a batch_id for grouping.
    """

    class ActionType(models.TextChoices):
        CREATE = "create", "Created"
        READ = "read", "Read"
        UPDATE = "update", "Updated"
        DELETE = "delete", "Deleted"
        DESTROY = "destroy", "Destroyed"
        LIST = "list", "Listed"
        RETRIEVE = "retrieve", "Retrieved"
        EXPORT = "export", "Exported"
        IMPORT = "import", "Imported"
        LOGIN = "login", "Logged In"
        LOGOUT = "logout", "Logged Out"
        PERMISSION = "permission", "Permission Changed"
        CUSTOM = "custom", "Custom Action"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Batch grouping - entries from the same request share this ID
    batch_id = models.UUIDField(
        db_index=True,
        help_text="Groups entries from the same request",
    )

    # User info
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_entries",
    )
    user_email = models.EmailField(
        blank=True,
        help_text="Stored separately in case user is deleted",
    )

    # Request metadata
    request_id = models.CharField(
        max_length=100,
        blank=True,
        db_index=True,
        help_text="Unique request identifier for correlation",
    )
    request_method = models.CharField(max_length=10, blank=True)
    request_path = models.CharField(max_length=500, blank=True)
    request_query_params = models.JSONField(default=dict, blank=True)

    # Network context
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)

    # Organization/Workspace context (for filtering)
    organization_id = models.UUIDField(null=True, blank=True, db_index=True)
    workspace_id = models.UUIDField(null=True, blank=True, db_index=True)

    # Action details
    action = models.CharField(
        max_length=50,
        choices=ActionType.choices,
        db_index=True,
    )
    action_detail = models.CharField(
        max_length=100,
        blank=True,
        help_text="More specific action, e.g., 'workspace_local', 'global'",
    )

    # Human-readable message
    message = models.TextField(
        help_text="Human-readable description like 'Updated attribute X on Asset Y'",
    )

    # Primary target of the action
    target_content_type = models.ForeignKey(
        ContentType,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_entries_as_target",
    )
    target_object_id = models.CharField(max_length=100, blank=True, db_index=True)
    target = GenericForeignKey("target_content_type", "target_object_id")
    target_repr = models.CharField(
        max_length=255,
        blank=True,
        help_text="String representation of target at time of action",
    )

    # Changes made (for update actions)
    changes = models.JSONField(
        default=dict,
        blank=True,
        help_text="Dict of field changes: {field: {old: x, new: y}}",
    )

    # Additional metadata
    metadata = models.JSONField(
        default=dict,
        blank=True,
        help_text="Additional context data",
    )

    # Timing
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    duration_ms = models.IntegerField(
        null=True,
        blank=True,
        help_text="Request duration in milliseconds",
    )
    order = models.IntegerField(
        default=0,
        help_text="Order within the batch",
    )

    class Meta:
        ordering = ["-created_at", "order"]
        indexes = [
            models.Index(fields=["user", "-created_at"]),
            models.Index(fields=["organization_id", "-created_at"]),
            models.Index(fields=["workspace_id", "-created_at"]),
            models.Index(fields=["action", "-created_at"]),
            models.Index(fields=["target_content_type", "target_object_id"]),
            models.Index(fields=["batch_id", "order"]),
        ]

    def __str__(self):
        return f"{self.action}: {self.message[:50]}"

    @property
    def target_type(self) -> str:
        """Return the model name of the target."""
        if self.target_content_type:
            return self.target_content_type.model
        return ""


class AuditLogReference(models.Model):
    """
    References to all models affected by an audit entry.

    This allows tracking all changes related to a specific object,
    even if it wasn't the primary target of the action.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    entry = models.ForeignKey(
        AuditLogEntry,
        on_delete=models.CASCADE,
        related_name="references",
    )

    # Referenced object
    content_type = models.ForeignKey(
        ContentType,
        on_delete=models.CASCADE,
    )
    object_id = models.CharField(max_length=100, db_index=True)
    content_object = GenericForeignKey("content_type", "object_id")

    # Stored representation (in case object is deleted)
    object_repr = models.CharField(
        max_length=255,
        blank=True,
        help_text="String representation at time of action",
    )

    # Role in the action
    role = models.CharField(
        max_length=50,
        default="affected",
        help_text="Role: 'target', 'parent', 'workspace', 'organization', etc.",
    )

    class Meta:
        indexes = [
            models.Index(fields=["content_type", "object_id"]),
        ]

    def __str__(self):
        return f"{self.role}: {self.object_repr}"


class AuditLogPendingBatch(models.Model):
    """
    Temporary storage for pending audit batches before processing.

    Used as fallback if async processing fails.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    data = models.JSONField(
        help_text="Serialized batch data for processing",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    processed = models.BooleanField(default=False, db_index=True)
    processed_at = models.DateTimeField(null=True, blank=True)
    error = models.TextField(blank=True)

    class Meta:
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["processed", "created_at"]),
        ]
