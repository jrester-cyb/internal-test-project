"""
Async tasks for processing audit logs.

Uses Celery if available and enabled, otherwise processes synchronously.

Settings:
    AUDIT_LOG_ASYNC = True  # Use Celery for async processing (default)
    AUDIT_LOG_ASYNC = False  # Process synchronously (no Celery required)
"""

import logging
from django.conf import settings
from django.contrib.contenttypes.models import ContentType
from django.db import transaction
from django.utils import timezone


logger = logging.getLogger(__name__)


# Check if async processing is enabled
AUDIT_LOG_ASYNC = getattr(settings, "AUDIT_LOG_ASYNC", True)

# Try to import Celery
try:
    from celery import shared_task as celery_shared_task

    CELERY_AVAILABLE = True
except ImportError:
    CELERY_AVAILABLE = False
    celery_shared_task = None


def _process_batch_impl(batch_data: dict) -> str:
    """
    Core implementation for processing audit batch.

    This is the actual logic, called by both sync and async paths.
    """
    from audit_log.models import AuditLogBatch, AuditLogEntry, AuditLogReference

    with transaction.atomic():
        # Get user if we have a user_id
        user = None
        if batch_data.get("user_id"):
            from django.contrib.auth import get_user_model

            User = get_user_model()
            try:
                user = User.objects.get(pk=batch_data["user_id"])
            except User.DoesNotExist:
                pass

        # Create the batch
        batch = AuditLogBatch.objects.create(
            user=user,
            user_email=batch_data.get("user_email", ""),
            request_id=batch_data.get("request_id", ""),
            request_method=batch_data.get("request_method", ""),
            request_path=batch_data.get("request_path", ""),
            request_query_params=batch_data.get("query_params", {}),
            ip_address=batch_data.get("ip_address") or None,
            user_agent=batch_data.get("user_agent", ""),
            organization_id=batch_data.get("organization_id"),
            workspace_id=batch_data.get("workspace_id"),
            duration_ms=batch_data.get("duration_ms"),
            entry_count=len(batch_data.get("entries", [])),
        )

        # Create entries
        entries_data = batch_data.get("entries", [])
        entry_objects = []

        for entry_data in entries_data:
            # Get target content type
            target_ct = None
            target_object_id = ""
            target_repr = ""

            if entry_data.get("target"):
                target_ct = ContentType.objects.get(
                    pk=entry_data["target"]["content_type_id"]
                )
                target_object_id = entry_data["target"]["object_id"]
                target_repr = entry_data["target"]["repr"]

            entry = AuditLogEntry.objects.create(
                batch=batch,
                action=entry_data["action"],
                action_detail=entry_data.get("action_detail", ""),
                message=entry_data["message"],
                target_content_type=target_ct,
                target_object_id=target_object_id,
                target_repr=target_repr,
                changes=entry_data.get("changes", {}),
                metadata=entry_data.get("metadata", {}),
                order=entry_data.get("order", 0),
            )
            entry_objects.append((entry, entry_data))

        # Create references
        for entry, entry_data in entry_objects:
            refs_data = entry_data.get("references", [])
            for ref_data in refs_data:
                try:
                    ref_ct = ContentType.objects.get(pk=ref_data["content_type_id"])
                    AuditLogReference.objects.create(
                        entry=entry,
                        content_type=ref_ct,
                        object_id=ref_data["object_id"],
                        object_repr=ref_data["repr"],
                        role=ref_data.get("role", "affected"),
                    )
                except Exception as e:
                    logger.warning(f"Failed to create audit reference: {e}")

        # Generate summary
        if entries_data:
            actions = [e["action"] for e in entries_data]
            action_counts = {}
            for a in actions:
                action_counts[a] = action_counts.get(a, 0) + 1
            summary_parts = [
                f"{count} {action}(s)" for action, count in action_counts.items()
            ]
            batch.summary = "; ".join(summary_parts)
            batch.save(update_fields=["summary"])

        logger.info(
            f"Processed audit batch {batch.id} with {len(entries_data)} entries"
        )
        return str(batch.id)


class ProcessAuditBatch:
    """
    Callable class that handles both sync and async processing.

    Usage:
        process_audit_batch(batch_data)  # Sync call
        process_audit_batch.delay(batch_data)  # Async call (if Celery available)
    """

    def __call__(self, batch_data: dict) -> str:
        """Process synchronously."""
        try:
            return _process_batch_impl(batch_data)
        except Exception as e:
            logger.error(f"Failed to process audit batch: {e}")
            raise

    def delay(self, batch_data: dict):
        """
        Process asynchronously if possible, otherwise sync.
        """
        if AUDIT_LOG_ASYNC and CELERY_AVAILABLE:
            # Use Celery
            return _process_audit_batch_celery.delay(batch_data)
        else:
            # Run synchronously
            return self(batch_data)


# Create the callable instance
process_audit_batch = ProcessAuditBatch()


# Only define Celery task if available
if CELERY_AVAILABLE:

    @celery_shared_task(
        bind=True,
        max_retries=3,
        default_retry_delay=60,
        autoretry_for=(Exception,),
        retry_backoff=True,
    )
    def _process_audit_batch_celery(self, batch_data: dict):
        """Celery task wrapper."""
        return _process_batch_impl(batch_data)


def process_pending_batches():
    """
    Process any pending audit batches that failed to be processed.

    Run this periodically (e.g., every 5 minutes) to catch any batches
    that couldn't be processed async (e.g., Celery was down).
    """
    from audit_log.models import AuditLogPendingBatch

    pending = AuditLogPendingBatch.objects.filter(processed=False).order_by(
        "created_at"
    )[:100]

    for batch in pending:
        try:
            _process_batch_impl(batch.data)
            batch.processed = True
            batch.processed_at = timezone.now()
            batch.save()
        except Exception as e:
            batch.error = str(e)
            batch.save()
            logger.error(f"Failed to process pending batch {batch.id}: {e}")


def cleanup_old_audit_logs(days: int = None):
    """
    Clean up old audit log entries.

    Respects AUDIT_LOG_RETENTION_DAYS setting (default: 365 days).
    """
    from audit_log.models import AuditLogBatch, AuditLogPendingBatch
    from datetime import timedelta

    retention_days = days or getattr(settings, "AUDIT_LOG_RETENTION_DAYS", 365)
    cutoff = timezone.now() - timedelta(days=retention_days)

    # Delete old batches (cascades to entries and references)
    deleted_count, _ = AuditLogBatch.objects.filter(created_at__lt=cutoff).delete()
    logger.info(f"Deleted {deleted_count} old audit batches")

    # Also clean up processed pending batches older than 7 days
    pending_cutoff = timezone.now() - timedelta(days=7)
    AuditLogPendingBatch.objects.filter(
        processed=True, processed_at__lt=pending_cutoff
    ).delete()


# Export Celery tasks if available (for celery beat scheduling)
if CELERY_AVAILABLE:
    process_pending_batches_task = celery_shared_task(process_pending_batches)
    cleanup_old_audit_logs_task = celery_shared_task(cleanup_old_audit_logs)
