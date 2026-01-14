"""
Signal handlers for the actions app.

Listens for audit log entries and triggers matching actions.
"""

import logging
from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

logger = logging.getLogger(__name__)


@receiver(post_save, sender="audit_log.AuditLogEntry")
def handle_audit_entry(sender, instance, created, **kwargs):
    """
    When an AuditLogEntry is created, check for matching triggers.

    Uses transaction.on_commit() to ensure the entry is visible
    to Celery workers (important for management commands and
    other code running in transactions).
    """
    if not created:
        return

    # Import here to avoid circular imports
    from audit_log.models import AuditLogEntry
    from .models import Trigger
    from .tasks import execute_trigger_actions

    # Refetch entry with references prefetched to avoid N+1 queries
    entry = (
        AuditLogEntry.objects.prefetch_related("references", "references__content_type")
        .select_related("request")
        .get(pk=instance.pk)
    )

    # Find matching triggers
    active_triggers = Trigger.objects.filter(is_active=True).select_related(
        "target_content_type"
    )

    matching_triggers = []
    for trigger in active_triggers:
        if trigger.matches(entry):
            matching_triggers.append(trigger)
            logger.info(f"Trigger '{trigger.name}' matched entry {entry.id}")

    if matching_triggers:
        # Capture IDs for the closure
        trigger_ids = [str(t.id) for t in matching_triggers]
        entry_id = str(instance.id)

        def queue_actions():
            from .tasks import CELERY_AVAILABLE

            for trigger_id in trigger_ids:
                if CELERY_AVAILABLE:
                    execute_trigger_actions.delay(trigger_id, entry_id)
                else:
                    # Run synchronously if Celery is not available
                    execute_trigger_actions(trigger_id, entry_id)

        # Wait for transaction to commit before queuing Celery tasks
        transaction.on_commit(queue_actions)
