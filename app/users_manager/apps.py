from django.apps import AppConfig


class UsersManagerConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "users_manager"
    verbose_name = "Users Manager"

    def ready(self):
        # Import signals to register them
        import users_manager.permissions.signals  # noqa: F401
        
        # Connect m2m signals that need the actual model class
        from users_manager.permissions.signals import connect_m2m_signals
        connect_m2m_signals()
