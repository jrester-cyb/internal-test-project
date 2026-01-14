from django.apps import AppConfig


class AssetsConfig(AppConfig):
    name = "assets"

    def ready(self):
        """Register signal handlers for cache invalidation."""
        from django.db.models.signals import post_save, post_delete
        from .models import Asset
        from .views.asset_view import invalidate_asset_list_cache

        def on_asset_change(sender, instance, **kwargs):
            """Invalidate asset list cache when an asset changes."""
            invalidate_asset_list_cache(instance)

        post_save.connect(on_asset_change, sender=Asset)
        post_delete.connect(on_asset_change, sender=Asset)
