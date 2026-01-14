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
"""

default_app_config = "audit_log.apps.AuditLogConfig"


def log_action(
    *,
    request=None,
    user=None,
    action: str,
    message: str,
    references: list = None,
    changes: dict = None,
    metadata: dict = None,
):
    """
    Log an audit action. Can be called from anywhere.

    Args:
        request: The current request (optional, will use thread-local if not provided)
        user: The user performing the action (optional, will use request.user)
        action: Action type (e.g., 'created', 'updated', 'deleted')
        message: Human-readable message describing the action
        references: List of model instances that were affected
        changes: Dict of changes made (e.g., {'field': {'old': x, 'new': y}})
        metadata: Additional metadata to store
    """
    from audit_log.logging import AuditLogger

    return AuditLogger.log(
        request=request,
        user=user,
        action=action,
        message=message,
        references=references or [],
        changes=changes or {},
        metadata=metadata or {},
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
