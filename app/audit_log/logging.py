"""
Core audit logging functionality.

Provides thread-local request context and the main logging interface.
"""

import threading
import time
import uuid
from contextlib import contextmanager
from typing import Any, Optional
from dataclasses import dataclass, field
from django.contrib.contenttypes.models import ContentType


# Thread-local storage for request context
_thread_locals = threading.local()


@dataclass
class AuditEntry:
    """A single audit log entry before it's persisted."""

    action: str
    message: str
    target: Any = None
    target_repr: str = ""
    action_detail: str = ""
    changes: dict = field(default_factory=dict)
    metadata: dict = field(default_factory=dict)
    references: list = field(default_factory=list)
    order: int = 0


@dataclass
class AuditRequestContext:
    """Context for an HTTP request containing audit entries."""

    request_id: str
    user: Any = None
    user_email: str = ""
    request_method: str = ""
    request_path: str = ""
    query_params: dict = field(default_factory=dict)
    ip_address: str = ""
    user_agent: str = ""
    organization_id: Optional[str] = None
    workspace_id: Optional[str] = None
    source: str = "api"
    start_time: float = field(default_factory=time.time)
    entries: list = field(default_factory=list)  # List of (entry, group_id) tuples

    def add_entry(self, entry: AuditEntry, group_id: str = None):
        """Add an entry to this request context."""
        entry.order = len(self.entries)
        self.entries.append((entry, group_id))

    def to_dict(self) -> dict:
        """Serialize to dictionary for async processing."""
        entries_data = []
        for entry, group_id in self.entries:
            # Serialize target
            target_data = None
            if entry.target:
                try:
                    ct = ContentType.objects.get_for_model(entry.target)
                    target_data = {
                        "content_type_id": ct.id,
                        "object_id": str(entry.target.pk),
                        "repr": entry.target_repr or str(entry.target)[:255],
                    }
                except Exception:
                    pass

            # Serialize references
            refs_data = []
            for ref in entry.references:
                if isinstance(ref, tuple):
                    obj, role = ref
                else:
                    obj, role = ref, "affected"
                try:
                    ct = ContentType.objects.get_for_model(obj)
                    refs_data.append(
                        {
                            "content_type_id": ct.id,
                            "object_id": str(obj.pk),
                            "repr": str(obj)[:255],
                            "role": role,
                        }
                    )
                except Exception:
                    pass

            entries_data.append(
                {
                    "action": entry.action,
                    "action_detail": entry.action_detail,
                    "message": entry.message,
                    "target": target_data,
                    "changes": entry.changes,
                    "metadata": entry.metadata,
                    "references": refs_data,
                    "order": entry.order,
                    "group_id": group_id,
                }
            )

        return {
            "request_id": self.request_id,
            "user_id": (
                str(self.user.pk) if self.user and self.user.is_authenticated else None
            ),
            "user_email": self.user_email,
            "request_method": self.request_method,
            "request_path": self.request_path,
            "query_params": self.query_params,
            "ip_address": self.ip_address,
            "user_agent": self.user_agent,
            "organization_id": (
                str(self.organization_id) if self.organization_id else None
            ),
            "workspace_id": str(self.workspace_id) if self.workspace_id else None,
            "source": self.source,
            "duration_ms": int((time.time() - self.start_time) * 1000),
            "entries": entries_data,
        }


def get_current_request_context() -> Optional[AuditRequestContext]:
    """Get the current request's audit context."""
    return getattr(_thread_locals, "audit_request", None)


def set_current_request_context(ctx: Optional[AuditRequestContext]):
    """Set the current request's audit context."""
    _thread_locals.audit_request = ctx


def clear_current_request_context():
    """Clear the current request's audit context."""
    if hasattr(_thread_locals, "audit_request"):
        del _thread_locals.audit_request


# Legacy aliases for backwards compatibility
get_current_batch = get_current_request_context
set_current_batch = set_current_request_context
clear_current_batch = clear_current_request_context
AuditBatchContext = AuditRequestContext


def create_group() -> str:
    """
    Generate a new group ID for grouping audit log entries within a request.

    Use this when you want to group related entries together.

    Usage:
        # Log entries with a custom group
        my_group = create_group()
        AuditLogger.log(action="notify", message="...", group_id=my_group)
        AuditLogger.log(action="email", message="...", group_id=my_group)

        # These go to the request without a group
        AuditLogger.log(action="update", message="...")
    """
    return str(uuid.uuid4())


# Legacy alias
create_new_batch = create_group


@contextmanager
def audit_group(
    description: str = None,
    *,
    group_id: str = None,
    source_type: str = "",
    source_name: str = "",
    metadata: dict = None,
):
    """
    Context manager for grouping audit log entries within a request.

    All AuditLogger.log() calls within this context will share the same group.
    They still belong to the same HTTP request but are grouped for logical organization.

    Usage:
        from audit_log.logging import audit_group, AuditLogger

        # All logs in this block share the same group with a description
        with audit_group("Organization setup wizard") as group:
            AuditLogger.log(action="create", message="Created organization")
            AuditLogger.log(action="create", message="Created workspace")

        # With additional metadata
        with audit_group(
            "Import OSM data",
            source_type="management_command",
            source_name="import_osm_data",
            metadata={"location": "Austin, TX"}
        ) as group:
            AuditLogger.log(action="import", message="Imported assets")

    Args:
        description: Human-readable description of what this group represents.
        group_id: Optional custom group ID. If not provided, one will be generated.
        source_type: Type of source (e.g., 'management_command', 'celery_task').
        source_name: Name of the source (e.g., 'startorganization').
        metadata: Additional metadata dict.

    Yields:
        The group_id (UUID string) being used for this context.
    """
    gid = group_id or create_group()

    # If a description is provided, create an AuditLogGroup record
    if description:
        from audit_log.models import AuditLogGroup
        AuditLogGroup.objects.create(
            id=gid,
            description=description,
            source_type=source_type,
            source_name=source_name,
            metadata=metadata or {},
        )

    # Store the group_id in thread-local so AuditLogger.log can find it
    prev_context_group = getattr(_thread_locals, "_context_group_id", None)
    _thread_locals._context_group_id = gid

    try:
        yield gid
    finally:
        # Restore previous context (for nested contexts)
        if prev_context_group is not None:
            _thread_locals._context_group_id = prev_context_group
        elif hasattr(_thread_locals, "_context_group_id"):
            del _thread_locals._context_group_id


# Legacy alias
audit_batch = audit_group


def get_context_group_id() -> Optional[str]:
    """Get the current context manager's group_id, if any."""
    return getattr(_thread_locals, "_context_group_id", None)


# Legacy alias
get_context_batch_id = get_context_group_id


class AuditLogger:
    """
    Main audit logging interface.

    Usage:
        AuditLogger.log(
            action='update',
            message='Updated attribute X on Asset Y',
            target=asset,
            changes={'name': {'old': 'foo', 'new': 'bar'}},
            references=[workspace, organization],
        )
    """

    @classmethod
    def log(
        cls,
        *,
        action: str,
        message: str,
        request=None,
        user=None,
        target=None,
        target_repr: str = "",
        action_detail: str = "",
        changes: dict = None,
        metadata: dict = None,
        references: list = None,
        group_id: str = None,
        source: str = None,
    ):
        """
        Log an audit action.

        Args:
            action: The action type (create, update, delete, etc.)
            message: Human-readable description of the action
            request: Optional request object for context
            user: Optional user object (uses request.user if not provided)
            target: The object being acted upon
            target_repr: String representation of target (auto-generated if not provided)
            action_detail: Additional detail about the action (e.g., "workspace_local")
            changes: Dict of field changes {field: {old: x, new: y}}
            metadata: Additional metadata dict
            references: List of related objects [(obj, role), ...]
            group_id: Optional group ID for grouping entries within a request.
                      Use create_group() to generate one. Also set automatically when
                      using the audit_group() context manager.
            source: Source of the action (api, management_command, celery_task, system).
                    Defaults to 'api' for HTTP requests, 'system' for standalone calls.

        If called within a request context (middleware active), the entry
        will be added to the request's audit context.

        If called outside a request context, the entry will be logged
        immediately as a standalone request.
        """
        # Check for context manager group_id (group_id param takes precedence over batch_id)
        effective_group_id = group_id or get_context_group_id()

        entry = AuditEntry(
            action=action,
            message=message,
            target=target,
            target_repr=target_repr or (str(target)[:255] if target else ""),
            action_detail=action_detail,
            changes=changes or {},
            metadata=metadata or {},
            references=references or [],
        )

        # Try to add to current request context
        current_ctx = get_current_request_context()
        if current_ctx:
            current_ctx.add_entry(entry, group_id=effective_group_id)
            return

        # No request context - create standalone request and process immediately
        from audit_log.tasks import process_audit_request

        # Determine source: use provided value, or default to 'system' for standalone calls
        effective_source = source or "system"

        standalone_ctx = AuditRequestContext(
            request_id=str(uuid.uuid4()),
            user=user or (request.user if request else None),
            user_email=getattr(
                user or (request.user if request else None), "email", ""
            ),
            request_method=request.method if request else "SYSTEM",
            request_path=request.path if request else "",
            source=effective_source,
        )

        standalone_ctx.add_entry(entry, group_id=effective_group_id)
        process_audit_request.delay(standalone_ctx.to_dict())

    @classmethod
    def flush_custom_batches(cls):
        """
        Legacy method - no longer needed since all entries go to request context.
        Kept for backwards compatibility.
        """
        pass

    @classmethod
    def log_create(cls, target, message: str = None, **kwargs):
        """Convenience method for logging create actions."""
        if not message:
            message = f"Created {target.__class__.__name__}: {target}"
        cls.log(action="create", message=message, target=target, **kwargs)

    @classmethod
    def log_update(cls, target, changes: dict, message: str = None, **kwargs):
        """Convenience method for logging update actions."""
        if not message:
            changed_fields = ", ".join(changes.keys())
            message = f"Updated {target.__class__.__name__} {target}: {changed_fields}"
        cls.log(
            action="update", message=message, target=target, changes=changes, **kwargs
        )

    @classmethod
    def log_delete(cls, target, message: str = None, **kwargs):
        """Convenience method for logging delete actions."""
        if not message:
            message = f"Deleted {target.__class__.__name__}: {target}"
        cls.log(action="delete", message=message, target=target, **kwargs)
