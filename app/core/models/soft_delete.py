import pgtrigger
from django.db import models
from django.utils import timezone
from polymorphic.managers import PolymorphicManager


class SoftDeleteManager(models.Manager):
    """Manager that excludes soft-deleted objects by default."""

    def get_queryset(self):
        return super().get_queryset().filter(deleted_at__isnull=True)

    def restore(self):
        """Restore all objects in this queryset by clearing their deleted_at field."""
        return self.get_queryset().update(deleted_at=None)


class AllObjectsManager(models.Manager):
    """Manager that includes soft-deleted objects."""

    def get_queryset(self):
        return super().get_queryset()

    def restore(self):
        """Restore all soft-deleted objects in this queryset by clearing their deleted_at field."""
        return (
            self.get_queryset().filter(deleted_at__isnull=False).update(deleted_at=None)
        )


class PolymorphicSoftDeleteManager(PolymorphicManager):
    """Polymorphic manager that excludes soft-deleted objects by default."""

    def get_queryset(self):
        return super().get_queryset().filter(deleted_at__isnull=True)

    def restore(self):
        """Restore all objects in this queryset by clearing their deleted_at field."""
        return self.get_queryset().update(deleted_at=None)


class PolymorphicAllObjectsManager(PolymorphicManager):
    """Polymorphic manager that includes soft-deleted objects."""

    def get_queryset(self):
        return super().get_queryset()

    def restore(self):
        """Restore all soft-deleted objects in this queryset by clearing their deleted_at field."""
        return (
            self.get_queryset().filter(deleted_at__isnull=False).update(deleted_at=None)
        )


class SoftDeleteMixin(models.Model):
    """
    Abstract model that provides soft deletion functionality.
    Uses pgtrigger.SoftDelete with a timestamp field.
    """

    deleted_at = models.BooleanField(null=True, default=None)

    objects = SoftDeleteManager()
    all_objects = AllObjectsManager()

    class Meta:
        abstract = True
        default_manager_name = "all_objects"
        triggers = [pgtrigger.SoftDelete(name="soft_delete", field="deleted_at")]

    def delete(self, using=None, keep_parents=False):
        """Soft delete: the trigger will handle setting deleted_at timestamp."""
        super().delete(using=using, keep_parents=keep_parents)

    def force_delete(self, *args, **kwargs):
        """Permanently delete the object, bypassing soft deletion."""
        with pgtrigger.ignore(
            f"{self._meta.app_label}.{self.__class__.__name__}:soft_delete"
        ):
            super().delete(*args, **kwargs)

    def restore(self, *args, **kwargs):
        """Restore a soft-deleted object."""
        self.deleted_at = None
        self.save(*args, **kwargs, update_fields=["deleted_at"])

    @property
    def is_deleted(self):
        """Check if the object is soft-deleted."""
        return self.deleted_at is not None


class PolymorphicSoftDeleteMixin(SoftDeleteMixin):
    """
    Abstract model that provides soft deletion functionality for polymorphic models.
    Uses polymorphic-aware managers to properly handle subclass retrieval.
    """

    objects = PolymorphicSoftDeleteManager()
    all_objects = PolymorphicAllObjectsManager()

    class Meta:
        abstract = True
        default_manager_name = "all_objects"
        # No triggers by default - should be added only to base polymorphic models
        triggers = []
