"""
Audit logging system for tracking all API actions.

Usage:
    # In views - use the mixin or decorator
    from audit_log.mixins import AuditLogMixin

    class AssetViewSet(AuditLogMixin, viewsets.ModelViewSet):
        audit_action_map = {
            'create': 'created',
            'update': 'updated',
            'destroy': 'deleted',
        }

    # Or use decorator
    from audit_log.decorators import audit_action

    @audit_action('updated', model=Asset)
    def my_view(request):
        ...

    # Manual logging
    from audit_log import log_action

    log_action(
        request=request,
        action='updated',
        message='Updated attribute {attr} on asset {asset}',
        references=[asset, workspace, attribute],
        changes={'old': old_value, 'new': new_value},
    )

    # Bulk operations
    from audit_log import log_bulk_create, log_bulk_update, log_bulk_delete

    assets = Asset.objects.bulk_create([...])
    log_bulk_create(assets, message="Imported 100 assets")

    # With automatic change tracking
    from audit_log.bulk import BulkOperationContext

    with BulkOperationContext(queryset, fields=['status']) as ctx:
        queryset.update(status='published')
    # Changes are automatically logged

    # Context manager for grouping entries within a request
    from audit_log import audit_group

    with audit_group() as group_id:
        log_action(action="notify", message="Sent email")
        log_action(action="notify", message="Sent Slack message")
"""

default_app_config = "audit_log.apps.AuditLogConfig"


def audit_group(group_id: str = None):
    """
    Context manager for grouping audit log entries within a request.

    All log_action() or AuditLogger.log() calls within this context will share
    the same group_id, making them easy to query together while still belonging
    to the same HTTP request.

    Usage:
        from audit_log import audit_group, log_action

        # All logs in this block share the same group_id
        with audit_group() as gid:
            log_action(action="notify", message="Sent email")
            log_action(action="notify", message="Sent Slack message")

        # This has no group_id
        log_action(action="update", message="Updated record")

    Args:
        group_id: Optional custom group ID. If not provided, one will be generated.

    Yields:
        The group_id being used for this context.
    """
    from audit_log.logging import audit_group as _audit_group

    return _audit_group(group_id)


# Legacy alias
def audit_batch(batch_id: str = None):
    """Deprecated: Use audit_group instead."""
    return audit_group(batch_id)


def create_group() -> str:
    """
    Generate a new group ID for grouping audit log entries within a request.

    Use this when you want to group related log entries together.

    Usage:
        from audit_log import create_group, log_action

        # Log entries with a custom group
        my_group = create_group()
        log_action(action="notify", message="...", group_id=my_group)
        log_action(action="email", message="...", group_id=my_group)

        # These have no group
        log_action(action="update", message="...")
    """
    from audit_log.logging import create_group as _create_group

    return _create_group()


# Legacy alias
def create_new_batch() -> str:
    """Deprecated: Use create_group instead."""
    return create_group()


def log_action(
    *,
    request=None,
    user=None,
    organization=None,
    workspace=None,
    action: str,
    message: str,
    target=None,
    target_repr: str = "",
    action_detail: str = "",
    references: list = None,
    changes: dict = None,
    metadata: dict = None,
    group_id: str = None,
    source: str = None,  # Source of the action (api, management_command, celery_task, system)
):
    """
    Log an audit action. Can be called from anywhere.

    Args:
        request: The current request (optional, will use thread-local if not provided)
        user: The user performing the action (optional, will use request.user)
        organization: The organization context for this action (optional)
        workspace: The workspace context for this action (optional)
        action: Action type (e.g., 'create', 'update', 'delete', 'read')
        message: Human-readable message describing the action
        target: The object being acted upon (required for CRUD actions)
        target_repr: String representation of target (auto-generated if not provided)
        action_detail: Additional detail about the action (e.g., "workspace_local")
        references: List of related objects - either model instances or (obj, role) tuples
        changes: Dict of changes made (e.g., {'field': {'old': x, 'new': y}})
        metadata: Additional metadata to store
        group_id: Optional group ID to group related entries within a request.
        source: Source of the action (api, management_command, celery_task, system).
                If not provided, defaults to 'api' for HTTP requests, 'system' otherwise.
    """
    from audit_log.logging import AuditLogger

    return AuditLogger.log(
        request=request,
        user=user,
        organization=organization,
        workspace=workspace,
        action=action,
        message=message,
        target=target,
        target_repr=target_repr,
        action_detail=action_detail,
        references=references or [],
        changes=changes or {},
        metadata=metadata or {},
        group_id=group_id,
        source=source,
    )


def log_create(
    target,
    *,
    message: str = None,
    request=None,
    user=None,
    organization=None,
    workspace=None,
    action_detail: str = "",
    references: list = None,
    metadata: dict = None,
    group_id: str = None,
    source: str = None,
):
    """
    Log a create action.

    Args:
        target: The object that was created (required)
        message: Human-readable message (auto-generated if not provided)
        request: The current request (optional)
        user: The user performing the action (optional)
        organization: The organization context for this action (optional)
        workspace: The workspace context for this action (optional)
        action_detail: Additional detail about the action
        references: List of related objects - either model instances or (obj, role) tuples
        metadata: Additional metadata to store
        group_id: Optional group ID to group related entries
        source: Source of the action (api, management_command, celery_task, system)
    """
    if not message:
        message = f"Created {target.__class__.__name__}: {target}"
    return log_action(
        action="create",
        message=message,
        target=target,
        request=request,
        user=user,
        organization=organization,
        workspace=workspace,
        action_detail=action_detail,
        references=references,
        metadata=metadata,
        group_id=group_id,
        source=source,
    )


def log_update(
    target,
    changes: dict,
    *,
    message: str = None,
    request=None,
    user=None,
    organization=None,
    workspace=None,
    action_detail: str = "",
    references: list = None,
    metadata: dict = None,
    group_id: str = None,
    source: str = None,
):
    """
    Log an update action.

    Args:
        target: The object that was updated (required)
        changes: Dict of changes {field: {old: x, new: y}} (required)
        message: Human-readable message (auto-generated if not provided)
        request: The current request (optional)
        user: The user performing the action (optional)
        organization: The organization context for this action (optional)
        workspace: The workspace context for this action (optional)
        action_detail: Additional detail about the action
        references: List of related objects - either model instances or (obj, role) tuples
        metadata: Additional metadata to store
        group_id: Optional group ID to group related entries
        source: Source of the action (api, management_command, celery_task, system)
    """
    if not message:
        changed_fields = ", ".join(changes.keys())
        message = f"Updated {target.__class__.__name__} {target}: {changed_fields}"
    return log_action(
        action="update",
        message=message,
        target=target,
        changes=changes,
        request=request,
        user=user,
        organization=organization,
        workspace=workspace,
        action_detail=action_detail,
        references=references,
        metadata=metadata,
        group_id=group_id,
        source=source,
    )


def log_delete(
    target,
    *,
    message: str = None,
    request=None,
    user=None,
    organization=None,
    workspace=None,
    action_detail: str = "",
    references: list = None,
    metadata: dict = None,
    group_id: str = None,
    source: str = None,
):
    """
    Log a delete action.

    Args:
        target: The object that was deleted (required)
        message: Human-readable message (auto-generated if not provided)
        request: The current request (optional)
        user: The user performing the action (optional)
        organization: The organization context for this action (optional)
        workspace: The workspace context for this action (optional)
        action_detail: Additional detail about the action
        references: List of related objects - either model instances or (obj, role) tuples
        metadata: Additional metadata to store
        group_id: Optional group ID to group related entries
        source: Source of the action (api, management_command, celery_task, system)
    """
    if not message:
        message = f"Deleted {target.__class__.__name__}: {target}"
    return log_action(
        action="delete",
        message=message,
        target=target,
        request=request,
        user=user,
        organization=organization,
        workspace=workspace,
        action_detail=action_detail,
        references=references,
        metadata=metadata,
        group_id=group_id,
        source=source,
    )


def log_read(
    target,
    *,
    message: str = None,
    request=None,
    user=None,
    organization=None,
    workspace=None,
    action_detail: str = "",
    references: list = None,
    metadata: dict = None,
    group_id: str = None,
    source: str = None,
):
    """
    Log a read action.

    Args:
        target: The object that was read (required)
        message: Human-readable message (auto-generated if not provided)
        request: The current request (optional)
        user: The user performing the action (optional)
        organization: The organization context for this action (optional)
        workspace: The workspace context for this action (optional)
        action_detail: Additional detail about the action
        references: List of related objects - either model instances or (obj, role) tuples
        metadata: Additional metadata to store
        group_id: Optional group ID to group related entries
        source: Source of the action (api, management_command, celery_task, system)
    """
    if not message:
        message = f"Read {target.__class__.__name__}: {target}"
    return log_action(
        action="read",
        message=message,
        target=target,
        request=request,
        user=user,
        organization=organization,
        workspace=workspace,
        action_detail=action_detail,
        references=references,
        metadata=metadata,
        group_id=group_id,
        source=source,
    )


def log_bulk_create(*args, **kwargs):
    """Log a bulk create operation. See audit_log.bulk.log_bulk_create for details."""
    from audit_log.bulk import log_bulk_create as _log_bulk_create

    return _log_bulk_create(*args, **kwargs)


def log_bulk_update(*args, **kwargs):
    """Log a bulk update operation. See audit_log.bulk.log_bulk_update for details."""
    from audit_log.bulk import log_bulk_update as _log_bulk_update

    return _log_bulk_update(*args, **kwargs)


def log_bulk_delete(*args, **kwargs):
    """Log a bulk delete operation. See audit_log.bulk.log_bulk_delete for details."""
    from audit_log.bulk import log_bulk_delete as _log_bulk_delete

    return _log_bulk_delete(*args, **kwargs)
