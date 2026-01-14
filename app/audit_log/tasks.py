"""
Tasks for processing audit logs.

Uses Celery if available and enabled, otherwise processes synchronously.

Settings:
    AUDIT_LOG_ASYNC = True  # Use Celery for async processing (default)
    AUDIT_LOG_ASYNC = False  # Process synchronously (no Celery required)
"""

import logging
import uuid
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


def _process_request_impl(request_data: dict) -> str:
    """
    Core implementation for processing audit request data.

    Creates AuditLogRequest and AuditLogEntry records.
    """
    from audit_log.models import AuditLogRequest, AuditLogEntry, AuditLogReference

    with transaction.atomic():
        # Get user if we have a user_id
        user = None
        if request_data.get("user_id"):
            from django.contrib.auth import get_user_model

            User = get_user_model()
            try:
                user = User.objects.get(pk=request_data["user_id"])
            except User.DoesNotExist:
                pass

        # Get organization and workspace FKs
        organization = None
        workspace = None

        if request_data.get("organization_id"):
            try:
                from organizations.models import Organization

                organization = Organization.objects.get(
                    pk=request_data["organization_id"]
                )
            except Exception:
                pass

        if request_data.get("workspace_id"):
            try:
                from workspaces.models import Workspace

                workspace = Workspace.objects.get(pk=request_data["workspace_id"])
            except Exception:
                pass

        # Create the request record
        audit_request = AuditLogRequest.objects.create(
            request_id=request_data.get("request_id", ""),
            user=user,
            user_email=request_data.get("user_email", ""),
            request_method=request_data.get("request_method", ""),
            request_path=request_data.get("request_path", ""),
            request_query_params=request_data.get("query_params", {}),
            ip_address=request_data.get("ip_address") or None,
            user_agent=request_data.get("user_agent", ""),
            organization=organization,
            workspace=workspace,
            duration_ms=request_data.get("duration_ms"),
        )

        # Create entries
        entries_data = request_data.get("entries", [])
        entry_objects = []

        for entry_data in entries_data:
            # Get target content type
            target_ct = None
            target_object_id = ""
            target_repr = ""

            if entry_data.get("target"):
                try:
                    target_ct = ContentType.objects.get(
                        pk=entry_data["target"]["content_type_id"]
                    )
                    target_object_id = entry_data["target"]["object_id"]
                    target_repr = entry_data["target"]["repr"]
                except ContentType.DoesNotExist:
                    pass

            # Parse group_id if present
            group_id = None
            if entry_data.get("group_id"):
                try:
                    group_id = uuid.UUID(entry_data["group_id"])
                except (ValueError, TypeError):
                    group_id = None

            entry = AuditLogEntry.objects.create(
                request=audit_request,
                group_id=group_id,
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

        # Get workspace and organization content types for auto-references
        workspace_ct = None
        organization_ct = None

        if workspace:
            try:
                from workspaces.models import Workspace

                workspace_ct = ContentType.objects.get_for_model(Workspace)
            except Exception:
                pass

        if organization:
            try:
                from organizations.models import Organization

                organization_ct = ContentType.objects.get_for_model(Organization)
            except Exception:
                pass

        # Create references
        for entry, entry_data in entry_objects:
            # Auto-add workspace reference if available
            if workspace and workspace_ct:
                AuditLogReference.objects.create(
                    entry=entry,
                    content_type=workspace_ct,
                    object_id=str(workspace.pk),
                    object_repr=str(workspace)[:255],
                    role="workspace",
                )

            # Auto-add organization reference if available
            if organization and organization_ct:
                AuditLogReference.objects.create(
                    entry=entry,
                    content_type=organization_ct,
                    object_id=str(organization.pk),
                    object_repr=str(organization)[:255],
                    role="organization",
                )

            # Add explicit references from entry data
            refs_data = entry_data.get("references", [])
            for ref_data in refs_data:
                try:
                    ref_ct = ContentType.objects.get(pk=ref_data["content_type_id"])
                    # Skip if it's the same as auto-added workspace/org
                    if (
                        workspace_ct
                        and ref_ct.id == workspace_ct.id
                        and ref_data["object_id"] == str(workspace.pk)
                    ):
                        continue
                    if (
                        organization_ct
                        and ref_ct.id == organization_ct.id
                        and ref_data["object_id"] == str(organization.pk)
                    ):
                        continue
                    AuditLogReference.objects.create(
                        entry=entry,
                        content_type=ref_ct,
                        object_id=ref_data["object_id"],
                        object_repr=ref_data["repr"],
                        role=ref_data.get("role", "affected"),
                    )
                except Exception as e:
                    logger.warning(f"Failed to create audit reference: {e}")

        logger.info(
            f"Processed audit request {audit_request.id} with {len(entries_data)} entries"
        )
        return str(audit_request.id)


class ProcessAuditRequest:
    """
    Callable class that handles both sync and async processing.

    Usage:
        process_audit_request(request_data)  # Sync call
        process_audit_request.delay(request_data)  # Async call (if Celery available)
    """

    def __call__(self, request_data: dict) -> str:
        """Process synchronously."""
        try:
            return _process_request_impl(request_data)
        except Exception as e:
            logger.error(f"Failed to process audit request: {e}")
            raise

    def delay(self, request_data: dict):
        """
        Process asynchronously if possible, otherwise sync.
        """
        if AUDIT_LOG_ASYNC and CELERY_AVAILABLE:
            # Use Celery
            return _process_audit_request_celery.delay(request_data)
        else:
            # Run synchronously
            return self(request_data)


# Create the callable instance
process_audit_request = ProcessAuditRequest()

# Legacy alias
process_audit_batch = process_audit_request


# Only define Celery task if available
if CELERY_AVAILABLE:

    @celery_shared_task(
        bind=True,
        max_retries=3,
        default_retry_delay=60,
        autoretry_for=(Exception,),
        retry_backoff=True,
    )
    def _process_audit_request_celery(self, request_data: dict):
        """Celery task wrapper."""
        return _process_request_impl(request_data)


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
            _process_request_impl(batch.data)
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
    from audit_log.models import AuditLogRequest, AuditLogPendingBatch
    from datetime import timedelta

    retention_days = days or getattr(settings, "AUDIT_LOG_RETENTION_DAYS", 365)
    cutoff = timezone.now() - timedelta(days=retention_days)

    # Delete old requests (cascades to entries and references)
    deleted_count, _ = AuditLogRequest.objects.filter(created_at__lt=cutoff).delete()
    logger.info(f"Deleted {deleted_count} old audit requests")

    # Also clean up processed pending batches older than 7 days
    pending_cutoff = timezone.now() - timedelta(days=7)
    AuditLogPendingBatch.objects.filter(
        processed=True, processed_at__lt=pending_cutoff
    ).delete()


# Export Celery tasks if available (for celery beat scheduling)
if CELERY_AVAILABLE:
    process_pending_batches_task = celery_shared_task(process_pending_batches)
    cleanup_old_audit_logs_task = celery_shared_task(cleanup_old_audit_logs)
