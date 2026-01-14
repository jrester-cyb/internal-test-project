"""
Core audit logging functionality.

Provides thread-local request context and the main logging interface.
"""

import threading
import time
import uuid
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
class AuditBatchContext:
    """Context for a batch of audit entries within a request."""

    request_id: str
    batch_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    user: Any = None
    user_email: str = ""
    request_method: str = ""
    request_path: str = ""
    query_params: dict = field(default_factory=dict)
    ip_address: str = ""
    user_agent: str = ""
    organization_id: str = None
    workspace_id: str = None
    start_time: float = field(default_factory=time.time)
    entries: list = field(default_factory=list)

    def add_entry(self, entry: AuditEntry):
        """Add an entry to this batch."""
        entry.order = len(self.entries)
        self.entries.append(entry)

    def to_dict(self) -> dict:
        """Serialize to dictionary for async processing."""
        entries_data = []
        for entry in self.entries:
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
                }
            )

        return {
            "batch_id": self.batch_id,
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
            "duration_ms": int((time.time() - self.start_time) * 1000),
            "entries": entries_data,
        }


def get_current_batch() -> Optional[AuditBatchContext]:
    """Get the current request's audit batch context."""
    return getattr(_thread_locals, "audit_batch", None)


def set_current_batch(batch: Optional[AuditBatchContext]):
    """Set the current request's audit batch context."""
    _thread_locals.audit_batch = batch


def clear_current_batch():
    """Clear the current request's audit batch context."""
    if hasattr(_thread_locals, "audit_batch"):
        del _thread_locals.audit_batch


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
    ):
        """
        Log an audit action.

        If called within a request context (middleware active), the entry
        will be batched with other entries from the same request.

        If called outside a request context, the entry will be logged
        immediately as a standalone batch.
        """
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

        # Try to add to current batch
        batch = get_current_batch()
        if batch:
            batch.add_entry(entry)
            return

        # No batch context - create standalone batch and process immediately
        from audit_log.tasks import process_audit_batch

        standalone_batch = AuditBatchContext(
            request_id=str(uuid.uuid4()),
            user=user or (request.user if request else None),
            user_email=getattr(
                user or (request.user if request else None), "email", ""
            ),
            request_method=request.method if request else "MANUAL",
            request_path=request.path if request else "",
        )
        standalone_batch.add_entry(entry)

        # Process async
        process_audit_batch.delay(standalone_batch.to_dict())

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
