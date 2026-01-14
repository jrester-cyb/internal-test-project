from django.apps import AppConfig


class AuditLogConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "audit_log"
    verbose_name = "Audit Log"

    def ready(self):
        from django.conf import settings

        # Connect auto-capture signals if enabled
        if getattr(settings, "AUDIT_LOG_AUTO_CAPTURE", False):
            from audit_log.signals import connect_auto_capture_signals

            connect_auto_capture_signals()
