import pgtrigger
from django.db import models
from django.utils import timezone
from polymorphic.managers import PolymorphicManager


class SoftDeleteWithTimestamp(pgtrigger.SoftDelete):
    """
    Custom trigger that marks records as deleted with a timestamp
    instead of actually deleting them. Extends pgtrigger.SoftDelete
    to set timestamp value instead of boolean.

    For polymorphic child models, updates the parent table since that's
    where the deleted_at field lives.
    """

    def get_func(self, model):
        """Override to set timestamp value (NOW()) instead of boolean value."""
        # Check if this is a polymorphic child model
        parent_link = getattr(model._meta, "parents", {})
        if parent_link:
            # This is a child model - find the parent with deleted_at
            for parent_model, parent_field in parent_link.items():
                if hasattr(parent_model, "deleted_at"):
                    parent_table = parent_model._meta.db_table
                    parent_pk = parent_field.column  # e.g., 'baseattributevalue_ptr_id'
                    return pgtrigger.Func(
                        f"""
                        UPDATE {parent_table}
                        SET {self.field} = NOW()
                        WHERE id = OLD.{parent_pk};
                        RETURN NULL;
                        """
                    )

        # Regular model - update its own table
        return pgtrigger.Func(
            f"""
            UPDATE {{meta.db_table}} 
            SET {self.field} = NOW()
            WHERE id = OLD.id;
            RETURN NULL;
            """
        )


class SoftDeleteQuerySet(models.QuerySet):
    """QuerySet that returns proper counts for soft delete operations."""

    def delete(self):
        """
        Soft delete all objects in this queryset.
        Returns proper count even though trigger prevents actual deletion.
        """
        # Collect all instances by model
        collector = models.deletion.Collector(using=self.db)
        collector.collect(self)

        # Perform the delete (trigger will prevent but update deleted_at)
        super().delete()

        # Return the count that would have been deleted
        return sum(len(instances) for instances in collector.data.values()), {
            model._meta.label: len(instances)
            for model, instances in collector.data.items()
        }


class SoftDeleteManager(models.Manager):
    """Manager that excludes soft-deleted objects by default."""

    def get_queryset(self):
        return SoftDeleteQuerySet(self.model, using=self._db).filter(
            deleted_at__isnull=True
        )

    def restore(self):
        """Restore all objects in this queryset by clearing their deleted_at field."""
        return self.get_queryset().update(deleted_at=None)


class AllObjectsManager(models.Manager):
    """Manager that includes soft-deleted objects."""

    def get_queryset(self):
        return SoftDeleteQuerySet(self.model, using=self._db)

    def restore(self):
        """Restore all soft-deleted objects in this queryset by clearing their deleted_at field."""
        return (
            self.get_queryset().filter(deleted_at__isnull=False).update(deleted_at=None)
        )


class PolymorphicSoftDeleteQuerySet(models.QuerySet):
    """Polymorphic QuerySet that returns proper counts for soft delete operations."""

    def delete(self):
        """
        Soft delete all polymorphic objects in this queryset.
        Returns proper count even though trigger prevents actual deletion.
        """
        # Collect all instances by model
        collector = models.deletion.Collector(using=self.db)
        collector.collect(self)

        # Perform the delete (trigger will prevent but update deleted_at)
        super().delete()

        # Return the count that would have been deleted
        return sum(len(instances) for instances in collector.data.values()), {
            model._meta.label: len(instances)
            for model, instances in collector.data.items()
        }


class PolymorphicSoftDeleteManager(PolymorphicManager):
    """Polymorphic manager that excludes soft-deleted objects by default."""

    def get_queryset(self):
        return PolymorphicSoftDeleteQuerySet(self.model, using=self._db).filter(
            deleted_at__isnull=True
        )

    def restore(self):
        """Restore all objects in this queryset by clearing their deleted_at field."""
        return self.get_queryset().update(deleted_at=None)


class PolymorphicAllObjectsManager(PolymorphicManager):
    """Polymorphic manager that includes soft-deleted objects."""

    def get_queryset(self):
        return PolymorphicSoftDeleteQuerySet(self.model, using=self._db)

    def restore(self):
        """Restore all soft-deleted objects in this queryset by clearing their deleted_at field."""
        return (
            self.get_queryset().filter(deleted_at__isnull=False).update(deleted_at=None)
        )


class SoftDeleteMixin(models.Model):
    """
    Abstract model that provides soft deletion functionality.
    Uses custom trigger that sets timestamp on deletion.
    Child classes automatically inherit the trigger configuration.
    """

    deleted_at = models.DateTimeField(null=True, blank=True, default=None)

    objects = SoftDeleteManager()
    all_objects = AllObjectsManager()

    class Meta:
        abstract = True
        default_manager_name = "all_objects"
        triggers = [SoftDeleteWithTimestamp(name="soft_delete", field="deleted_at")]

    def delete(self, using=None, keep_parents=False):
        """
        Soft delete: trigger updates deleted_at and prevents actual deletion.
        Returns proper deletion count even though trigger returns NULL.
        """
        using = using or self._state.db
        # Collect deletion info before the operation
        collector = models.deletion.Collector(using=using, origin=self)
        collector.collect([self], keep_parents=keep_parents)

        # Execute DELETE on this table (trigger will intercept and soft delete)
        from django.db import connections

        connection = connections[using]

        # Get the primary key column name for this table
        pk_field = self._meta.pk
        pk_column = pk_field.column

        with connection.cursor() as cursor:
            cursor.execute(
                f"DELETE FROM {self._meta.db_table} WHERE {pk_column} = %s", [self.pk]
            )

        # Return the count that would have been deleted
        return len(collector.data), {
            model._meta.label: len(instances)
            for model, instances in collector.data.items()
        }

    def force_delete(self, *args, **kwargs):
        """Permanently delete the object, bypassing soft deletion."""
        trigger_name = f"soft_delete_{self.__class__.__name__.lower()}"
        with pgtrigger.ignore(
            f"{self._meta.app_label}.{self.__class__.__name__}:{trigger_name}"
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
    Child classes automatically inherit the trigger configuration.
    """

    objects = PolymorphicSoftDeleteManager()
    all_objects = PolymorphicAllObjectsManager()

    class Meta:
        abstract = True
        triggers = [SoftDeleteWithTimestamp(name="soft_delete", field="deleted_at")]
        default_manager_name = "all_objects"
