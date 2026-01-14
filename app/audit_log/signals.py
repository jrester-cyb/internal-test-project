"""
Django signals for automatic audit log capture.

These signals can be used to automatically capture model changes
without requiring explicit logging calls.

Note: Signals are disabled by default. Enable them in settings:
    AUDIT_LOG_AUTO_CAPTURE = True
    AUDIT_LOG_AUTO_CAPTURE_MODELS = [
        'assets.Asset',
        'workspaces.Workspace',
        # ...
    ]
"""

import logging
from django.conf import settings
from django.db.models.signals import post_save, post_delete, m2m_changed
from django.dispatch import receiver

logger = logging.getLogger(__name__)


def is_auto_capture_enabled() -> bool:
    """Check if automatic model capture is enabled."""
    return getattr(settings, "AUDIT_LOG_AUTO_CAPTURE", False)


def get_auto_capture_models() -> list:
    """Get list of models to auto-capture."""
    return getattr(settings, "AUDIT_LOG_AUTO_CAPTURE_MODELS", [])


def should_capture_model(instance) -> bool:
    """Check if this model instance should be auto-captured."""
    if not is_auto_capture_enabled():
        return False

    model_label = f"{instance._meta.app_label}.{instance.__class__.__name__}"
    allowed_models = get_auto_capture_models()

    # If no models specified, capture all (except audit log models)
    if not allowed_models:
        return instance._meta.app_label != "audit_log"

    return model_label in allowed_models


class ModelChangeTracker:
    """
    Context manager to track model changes for audit logging.

    Usage:
        with ModelChangeTracker(instance) as tracker:
            instance.name = 'new_name'
            instance.save()

        # tracker.changes contains {'name': {'old': 'old_name', 'new': 'new_name'}}
    """

    def __init__(self, instance):
        self.instance = instance
        self.old_values = {}
        self.changes = {}

    def __enter__(self):
        # Capture current values
        for field in self.instance._meta.fields:
            self.old_values[field.name] = getattr(self.instance, field.name)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is None:
            # Calculate changes
            for field in self.instance._meta.fields:
                old_val = self.old_values.get(field.name)
                new_val = getattr(self.instance, field.name)

                if str(old_val) != str(new_val):
                    self.changes[field.name] = {
                        "old": str(old_val) if old_val is not None else None,
                        "new": str(new_val) if new_val is not None else None,
                    }
        return False


# Store pre-save state for change tracking
_pre_save_state = {}


def capture_pre_save(sender, instance, **kwargs):
    """Capture model state before save for change tracking."""
    if not should_capture_model(instance):
        return

    if instance.pk:
        # Existing object - capture current DB state
        try:
            db_instance = sender.objects.get(pk=instance.pk)
            state = {}
            for field in instance._meta.fields:
                state[field.name] = getattr(db_instance, field.name)
            _pre_save_state[f"{sender.__name__}:{instance.pk}"] = state
        except sender.DoesNotExist:
            pass


def capture_post_save(sender, instance, created, **kwargs):
    """Log model creation or update."""
    if not should_capture_model(instance):
        return

    from audit_log.logging import AuditLogger, get_current_batch

    # Only log if we're in a request context (to avoid logging internal operations)
    if not get_current_batch():
        return

    if created:
        AuditLogger.log_create(
            target=instance,
            message=f"Created {instance.__class__.__name__}: {instance}",
        )
    else:
        # Calculate changes
        key = f"{sender.__name__}:{instance.pk}"
        old_state = _pre_save_state.pop(key, {})

        changes = {}
        for field in instance._meta.fields:
            old_val = old_state.get(field.name)
            new_val = getattr(instance, field.name)

            if str(old_val) != str(new_val):
                changes[field.name] = {
                    "old": str(old_val) if old_val is not None else None,
                    "new": str(new_val) if new_val is not None else None,
                }

        if changes:
            AuditLogger.log_update(
                target=instance,
                changes=changes,
                message=f"Updated {instance.__class__.__name__}: {instance}",
            )


def capture_post_delete(sender, instance, **kwargs):
    """Log model deletion."""
    if not should_capture_model(instance):
        return

    from audit_log.logging import AuditLogger, get_current_batch

    if not get_current_batch():
        return

    AuditLogger.log_delete(
        target=instance,
        message=f"Deleted {instance.__class__.__name__}: {instance}",
    )


def connect_auto_capture_signals():
    """
    Connect signals for auto-capturing model changes.

    Call this in AppConfig.ready() if you want automatic capture.
    """
    from django.apps import apps

    models_to_capture = get_auto_capture_models()

    if not models_to_capture:
        # If no specific models, we'll rely on should_capture_model() check
        return

    for model_label in models_to_capture:
        try:
            app_label, model_name = model_label.split(".")
            model = apps.get_model(app_label, model_name)

            # Connect pre_save for change tracking
            from django.db.models.signals import pre_save

            pre_save.connect(capture_pre_save, sender=model, weak=False)
            post_save.connect(capture_post_save, sender=model, weak=False)
            post_delete.connect(capture_post_delete, sender=model, weak=False)

            logger.info(f"Audit log auto-capture enabled for {model_label}")
        except Exception as e:
            logger.warning(f"Failed to connect audit signals for {model_label}: {e}")
