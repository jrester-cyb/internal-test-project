from django.apps import AppConfig


class ActionsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "actions"
    verbose_name = "Actions & Triggers"

    def ready(self):
        # Import signals to register them
        from . import signals  # noqa: F401
