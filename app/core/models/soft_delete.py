import pgtrigger
from django.db import models
from polymorphic.managers import PolymorphicManager
from polymorphic.query import PolymorphicQuerySet


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


def _add_soft_delete_trigger(sender, **kwargs):
    """
    Signal handler to automatically add soft delete trigger to models with deleted_at field.
    """
    # Only process concrete models (not abstract)
    if sender._meta.abstract:
        return

    # Check if this model has deleted_at field
    if not hasattr(sender, "deleted_at"):
        return

    # Get existing triggers
    existing_triggers = list(getattr(sender._meta, "triggers", []))

    # Check if soft delete trigger is already present
    has_soft_delete = any(
        isinstance(t, SoftDeleteWithTimestamp)
        and getattr(t, "name", None) == "soft_delete"
        for t in existing_triggers
    )

    # Add soft delete trigger if not present
    if not has_soft_delete:
        soft_delete_trigger = SoftDeleteWithTimestamp(
            name="soft_delete", field="deleted_at"
        )
        existing_triggers.append(soft_delete_trigger)
        sender._meta.triggers = existing_triggers


# Connect the signal
from django.apps import apps
from django.db.models.signals import class_prepared

class_prepared.connect(_add_soft_delete_trigger)


def merge_triggers(*trigger_lists):
    """
    Helper function to merge trigger lists from parent and child classes.
    Usage in child Meta: triggers = merge_triggers([...child triggers...])
    """
    # Get the soft delete trigger from SoftDeleteMixin
    soft_delete_trigger = SoftDeleteWithTimestamp(
        name="soft_delete", field="deleted_at"
    )

    # Flatten all trigger lists
    all_triggers = []
    for trigger_list in trigger_lists:
        if trigger_list:
            if isinstance(trigger_list, (list, tuple)):
                all_triggers.extend(trigger_list)
            else:
                all_triggers.append(trigger_list)

    # Add soft delete trigger if not already present
    has_soft_delete = any(
        isinstance(t, SoftDeleteWithTimestamp) and t.name == "soft_delete"
        for t in all_triggers
    )

    if not has_soft_delete:
        all_triggers.append(soft_delete_trigger)

    return all_triggers


class SoftDeleteQuerySet(models.QuerySet):
    """QuerySet that returns proper counts for soft delete operations."""

    def delete(self):
        """
        Soft delete all objects in this queryset.
        Returns proper count even though trigger prevents actual deletion.
        """
        # Count objects before deletion
        count = self.count()

        if count == 0:
            return 0, {}

        # Try to collect cascade information for accurate reporting
        try:
            collector = models.deletion.Collector(using=self.db)
            collector.collect(self)
            collected_data = collector.data
        except (ValueError, TypeError):
            # If collection fails due to polymorphic FK issues, use simple count
            # Perform the delete (trigger will prevent but update deleted_at)
            super().delete()
            return count, {self.model._meta.label: count}

        # Perform the delete (trigger will prevent but update deleted_at)
        super().delete()

        # Return the count that would have been deleted
        return sum(len(instances) for instances in collected_data.values()), {
            model._meta.label: len(instances)
            for model, instances in collected_data.items()
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


class PolymorphicSoftDeleteQuerySet(PolymorphicQuerySet):
    """Polymorphic QuerySet that returns proper counts for soft delete operations."""

    def delete(self):
        """
        Soft delete all polymorphic objects in this queryset.
        Returns proper count even though trigger prevents actual deletion.
        """
        # Count objects before deletion
        count = self.count()

        if count == 0:
            return 0, {}

        # Try to collect cascade information for accurate reporting
        try:
            collector = models.deletion.Collector(using=self.db)
            collector.collect(self)
            collected_data = collector.data
        except (ValueError, TypeError):
            # If collection fails due to polymorphic FK issues, use simple count
            # Perform the delete (trigger will prevent but update deleted_at)
            super().delete()
            return count, {self.model._meta.label: count}

        # Perform the delete (trigger will prevent but update deleted_at)
        super().delete()

        # Return the count that would have been deleted
        return sum(len(instances) for instances in collected_data.values()), {
            model._meta.label: len(instances)
            for model, instances in collected_data.items()
        }

    def force_delete(self):
        """
        Permanently delete all objects in this queryset, bypassing soft deletion.
        """
        # Get the actual model class (not the polymorphic base)
        model_class = self.model
        if hasattr(model_class, "_meta"):
            model_name = model_class._meta.object_name
            app_label = model_class._meta.app_label
        else:
            model_name = model_class.__name__
            app_label = model_class._meta.app_label

        with pgtrigger.ignore(f"{app_label}.{model_name}:soft_delete"):
            return super().delete()


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

        # For polymorphic models with complex relationships, use direct SQL deletion
        # to avoid type checking issues in Django's collector
        from django.db import connections

        connection = connections[using]

        # Get the primary key column name for this table
        pk_field = self._meta.pk
        pk_column = pk_field.column

        try:
            # Try to collect deletion info for proper count reporting
            collector = models.deletion.Collector(using=using, origin=self)
            collector.collect([self], keep_parents=keep_parents)
            collected_data = collector.data
        except (ValueError, TypeError) as e:
            # If collection fails due to polymorphic type issues, estimate the count
            # This happens when there are ForeignKey constraints between polymorphic types
            collected_data = {self.__class__: [self]}

        # Execute DELETE on this table (trigger will intercept and soft delete)
        with connection.cursor() as cursor:
            cursor.execute(
                f"DELETE FROM {self._meta.db_table} WHERE {pk_column} = %s", [self.pk]
            )

        # Return the count that would have been deleted
        return len(collected_data), {
            model._meta.label: len(instances)
            for model, instances in collected_data.items()
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
