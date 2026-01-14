"""
Utilities for logging bulk operations efficiently.

When performing bulk creates, updates, or deletes, use these utilities
to log them as a single coherent action rather than many individual entries.
"""

from typing import Any, Iterable
from django.db import models

from .logging import AuditLogger, AuditEntry, get_current_batch


def log_bulk_create(
    objects: Iterable[models.Model],
    *,
    message: str = None,
    metadata: dict = None,
    parent_references: list = None,
):
    """
    Log a bulk create operation as a single audit entry.

    Usage:
        assets = Asset.objects.bulk_create([Asset(...), Asset(...), ...])
        log_bulk_create(assets, message="Imported 100 assets from CSV")

    Args:
        objects: Iterable of created model instances
        message: Custom message (auto-generated if not provided)
        metadata: Additional metadata to store
        parent_references: Common parent objects (workspace, org, etc.)
    """
    objects_list = list(objects)
    if not objects_list:
        return

    model_name = objects_list[0].__class__.__name__
    count = len(objects_list)

    # Build message
    if not message:
        message = f"Bulk created {count} {model_name}(s)"

    # Build metadata with object details
    object_details = []
    for obj in objects_list[:100]:  # Limit to first 100 for storage
        object_details.append(
            {
                "id": str(obj.pk),
                "repr": str(obj)[:100],
            }
        )

    full_metadata = {
        "bulk_operation": "create",
        "count": count,
        "objects": object_details,
        "truncated": count > 100,
        **(metadata or {}),
    }

    # Build references - include all created objects (up to a limit)
    references = list(parent_references or [])
    for obj in objects_list[:50]:  # Limit references to avoid bloat
        references.append((obj, "created"))

    AuditLogger.log(
        action="create",
        action_detail="bulk_create",
        message=message,
        target=(
            objects_list[0] if objects_list else None
        ),  # First object as primary target
        metadata=full_metadata,
        references=references,
    )


def log_bulk_update(
    objects: Iterable[models.Model],
    fields: list[str],
    *,
    message: str = None,
    changes_by_object: dict = None,
    metadata: dict = None,
    parent_references: list = None,
):
    """
    Log a bulk update operation as a single audit entry.

    Usage:
        # After bulk_update
        Asset.objects.filter(status='draft').update(status='published')
        log_bulk_update(
            updated_assets,
            fields=['status'],
            message="Published 50 draft assets",
            changes_by_object={asset.id: {'status': {'old': 'draft', 'new': 'published'}}}
        )

    Args:
        objects: Iterable of updated model instances
        fields: List of field names that were updated
        message: Custom message
        changes_by_object: Dict mapping object IDs to their changes
        metadata: Additional metadata
        parent_references: Common parent objects
    """
    objects_list = list(objects)
    if not objects_list:
        return

    model_name = objects_list[0].__class__.__name__
    count = len(objects_list)

    # Build message
    if not message:
        fields_str = ", ".join(fields)
        message = f"Bulk updated {count} {model_name}(s): {fields_str}"

    # Build metadata
    object_details = []
    for obj in objects_list[:100]:
        detail = {
            "id": str(obj.pk),
            "repr": str(obj)[:100],
        }
        if changes_by_object and obj.pk in changes_by_object:
            detail["changes"] = changes_by_object[obj.pk]
        object_details.append(detail)

    full_metadata = {
        "bulk_operation": "update",
        "count": count,
        "fields_updated": fields,
        "objects": object_details,
        "truncated": count > 100,
        **(metadata or {}),
    }

    # Aggregate changes summary
    changes_summary = {}
    if changes_by_object:
        for field in fields:
            old_values = set()
            new_values = set()
            for obj_changes in changes_by_object.values():
                if field in obj_changes:
                    old_values.add(str(obj_changes[field].get("old", "")))
                    new_values.add(str(obj_changes[field].get("new", "")))
            changes_summary[field] = {
                "old_values": list(old_values)[:10],
                "new_values": list(new_values)[:10],
            }

    # Build references
    references = list(parent_references or [])
    for obj in objects_list[:50]:
        references.append((obj, "updated"))

    AuditLogger.log(
        action="update",
        action_detail="bulk_update",
        message=message,
        target=objects_list[0] if objects_list else None,
        changes=changes_summary,
        metadata=full_metadata,
        references=references,
    )


def log_bulk_delete(
    objects: Iterable[models.Model] = None,
    *,
    model_class: type = None,
    object_ids: list = None,
    object_reprs: list[str] = None,
    count: int = None,
    message: str = None,
    metadata: dict = None,
    parent_references: list = None,
):
    """
    Log a bulk delete operation.

    Can be called before or after deletion. If called after, pass object_ids
    and optionally object_reprs since the objects no longer exist.

    Usage:
        # Before delete (objects still exist)
        objects_to_delete = Asset.objects.filter(status='archived')
        log_bulk_delete(objects_to_delete, message="Purged archived assets")
        objects_to_delete.delete()

        # After delete (objects gone)
        deleted_ids = [...]
        log_bulk_delete(
            model_class=Asset,
            object_ids=deleted_ids,
            count=len(deleted_ids),
            message="Deleted selected assets"
        )

    Args:
        objects: Iterable of objects being deleted (if still exist)
        model_class: Model class if objects are already deleted
        object_ids: List of deleted object IDs
        object_reprs: List of string representations
        count: Number of deleted objects
        message: Custom message
        metadata: Additional metadata
        parent_references: Common parent objects
    """
    if objects:
        objects_list = list(objects)
        model_name = objects_list[0].__class__.__name__ if objects_list else "Object"
        actual_count = len(objects_list)

        object_details = []
        for obj in objects_list[:100]:
            object_details.append(
                {
                    "id": str(obj.pk),
                    "repr": str(obj)[:100],
                }
            )
    else:
        model_name = model_class.__name__ if model_class else "Object"
        actual_count = count or len(object_ids or [])

        object_details = []
        if object_ids:
            for i, obj_id in enumerate(object_ids[:100]):
                detail = {"id": str(obj_id)}
                if object_reprs and i < len(object_reprs):
                    detail["repr"] = object_reprs[i][:100]
                object_details.append(detail)

    # Build message
    if not message:
        message = f"Bulk deleted {actual_count} {model_name}(s)"

    # Build metadata
    full_metadata = {
        "bulk_operation": "delete",
        "count": actual_count,
        "objects": object_details,
        "truncated": actual_count > 100,
        **(metadata or {}),
    }

    # Build references (only if objects still exist)
    references = list(parent_references or [])
    if objects:
        for obj in list(objects)[:50]:
            references.append((obj, "deleted"))

    AuditLogger.log(
        action="delete",
        action_detail="bulk_delete",
        message=message,
        target=None,  # No single target for bulk delete
        metadata=full_metadata,
        references=references,
    )


class BulkOperationContext:
    """
    Context manager for tracking bulk operations.

    Automatically captures before/after state for bulk updates.

    Usage:
        with BulkOperationContext(queryset, fields=['status', 'name']) as ctx:
            queryset.update(status='published')

        # ctx.log_update() is called automatically with changes

    Or manually:
        ctx = BulkOperationContext(queryset, fields=['status'])
        ctx.capture_before()
        queryset.update(status='published')
        ctx.capture_after()
        ctx.log_update(message="Published assets")
    """

    def __init__(
        self,
        queryset,
        fields: list[str] = None,
        parent_references: list = None,
    ):
        self.queryset = queryset
        self.fields = fields or []
        self.parent_references = parent_references or []
        self.before_state = {}
        self.after_state = {}
        self.object_ids = []

    def capture_before(self):
        """Capture state before the operation."""
        self.object_ids = list(self.queryset.values_list("pk", flat=True))

        if self.fields:
            for obj in self.queryset.only("pk", *self.fields):
                self.before_state[obj.pk] = {
                    field: getattr(obj, field) for field in self.fields
                }

    def capture_after(self):
        """Capture state after the operation."""
        if self.fields and self.object_ids:
            qs = self.queryset.model.objects.filter(pk__in=self.object_ids)
            for obj in qs.only("pk", *self.fields):
                self.after_state[obj.pk] = {
                    field: getattr(obj, field) for field in self.fields
                }

    def get_changes(self) -> dict:
        """Calculate changes between before and after state."""
        changes_by_object = {}

        for obj_id in self.object_ids:
            before = self.before_state.get(obj_id, {})
            after = self.after_state.get(obj_id, {})

            changes = {}
            for field in self.fields:
                old_val = before.get(field)
                new_val = after.get(field)
                if str(old_val) != str(new_val):
                    changes[field] = {
                        "old": str(old_val) if old_val is not None else None,
                        "new": str(new_val) if new_val is not None else None,
                    }

            if changes:
                changes_by_object[obj_id] = changes

        return changes_by_object

    def log_update(self, message: str = None, metadata: dict = None):
        """Log the bulk update with captured changes."""
        objects = list(self.queryset.model.objects.filter(pk__in=self.object_ids))

        log_bulk_update(
            objects,
            fields=self.fields,
            message=message,
            changes_by_object=self.get_changes(),
            metadata=metadata,
            parent_references=self.parent_references,
        )

    def __enter__(self):
        self.capture_before()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is None:
            self.capture_after()
            self.log_update()
        return False
