"""
Mixins for adding audit logging to ViewSets.
"""

from typing import Optional
from rest_framework import status


class AuditLogMixin:
    """
    Mixin for ViewSets that automatically logs CRUD actions.

    Usage:
        class AssetViewSet(AuditLogMixin, viewsets.ModelViewSet):
            queryset = Asset.objects.all()
            serializer_class = AssetSerializer

            # Optional: customize action messages
            audit_action_messages = {
                'create': 'Created asset: {obj}',
                'update': 'Updated asset: {obj}',
                'destroy': 'Deleted asset: {obj}',
            }

            # Optional: exclude certain actions from logging
            audit_exclude_actions = ['list', 'retrieve']

    Attributes:
        audit_action_messages: Dict mapping action names to message templates
        audit_exclude_actions: List of action names to exclude from logging
        audit_log_reads: Whether to log read operations (default False)
    """

    audit_action_messages: dict = {}
    audit_exclude_actions: list = []
    audit_log_reads: bool = False

    def _should_audit_action(self, action: str) -> bool:
        """Check if this action should be audited."""
        if action in self.audit_exclude_actions:
            return False

        # By default, don't log reads unless explicitly enabled
        if not self.audit_log_reads and action in ("list", "retrieve"):
            return False

        return True

    def _get_audit_message(self, action: str, obj=None) -> str:
        """Get the audit message for an action."""
        template = self.audit_action_messages.get(action)
        if template:
            return template.format(obj=obj, action=action)

        # Default messages
        model_name = (
            self.queryset.model.__name__
            if hasattr(self, "queryset") and self.queryset is not None
            else "object"
        )

        default_messages = {
            "create": f"Created {model_name}: {{obj}}",
            "update": f"Updated {model_name}: {{obj}}",
            "partial_update": f"Updated {model_name}: {{obj}}",
            "destroy": f"Deleted {model_name}: {{obj}}",
            "list": f"Listed {model_name}s",
            "retrieve": f"Retrieved {model_name}: {{obj}}",
        }

        template = default_messages.get(action, f"{action} {model_name}: {{obj}}")
        return template.format(obj=obj)

    def _get_references(self, obj) -> list:
        """Get reference objects for the audit log."""
        references = []

        if obj:
            # Add workspace if present
            if hasattr(obj, "workspace") and obj.workspace:
                references.append((obj.workspace, "workspace"))

            # Add organization if present
            if hasattr(obj, "organization") and obj.organization:
                references.append((obj.organization, "organization"))

            # Add parent if present
            if hasattr(obj, "parent") and obj.parent:
                references.append((obj.parent, "parent"))

        # Add workspace/org from URL if not on object
        if not references:
            request = getattr(self, "request", None)
            if request:
                # Try to get from view kwargs
                workspace_pk = self.kwargs.get("workspace_pk")
                org_pk = self.kwargs.get("organization_pk")

                if workspace_pk:
                    try:
                        from workspaces.models import Workspace

                        ws = Workspace.objects.get(pk=workspace_pk)
                        references.append((ws, "workspace"))
                    except Exception:
                        pass

                if org_pk:
                    try:
                        from organizations.models import Organization

                        org = Organization.objects.get(pk=org_pk)
                        references.append((org, "organization"))
                    except Exception:
                        pass

        return references

    def _calculate_changes(self, old_obj, new_obj) -> dict:
        """Calculate field changes between old and new object state."""
        changes = {}

        if not old_obj or not new_obj:
            return changes

        for field in new_obj._meta.fields:
            field_name = field.name
            old_val = old_obj.get(field_name)
            new_val = getattr(new_obj, field_name, None)

            # Convert to comparable types
            if hasattr(old_val, "pk"):
                old_val = str(old_val.pk)
            if hasattr(new_val, "pk"):
                new_val = str(new_val.pk)

            if str(old_val) != str(new_val):
                changes[field_name] = {
                    "old": str(old_val) if old_val is not None else None,
                    "new": str(new_val) if new_val is not None else None,
                }

        return changes

    def _log_action(self, action: str, obj=None, changes: dict = None):
        """Log an audit action."""
        from audit_log.logging import AuditLogger

        if not self._should_audit_action(action):
            return

        AuditLogger.log(
            action=action,
            message=self._get_audit_message(action, obj),
            target=obj,
            changes=changes or {},
            references=self._get_references(obj),
        )

    def perform_create(self, serializer):
        """Override to log create actions."""
        super().perform_create(serializer)
        self._log_action("create", serializer.instance)

    def perform_update(self, serializer):
        """Override to log update actions."""
        # Capture old values before update
        instance = serializer.instance
        old_values = {}
        for field in instance._meta.fields:
            old_values[field.name] = getattr(instance, field.name)

        super().perform_update(serializer)

        # Refresh and calculate changes
        instance.refresh_from_db()
        changes = self._calculate_changes(old_values, instance)

        action = "partial_update" if self.action == "partial_update" else "update"
        self._log_action(action, instance, changes)

    def perform_destroy(self, instance):
        """Override to log delete actions."""
        # Log before delete (object will be gone after)
        self._log_action("destroy", instance)
        super().perform_destroy(instance)

    def retrieve(self, request, *args, **kwargs):
        """Override to log retrieve actions when audit_log_reads is True."""
        response = super().retrieve(request, *args, **kwargs)
        if self.audit_log_reads and response.status_code == 200:
            try:
                obj = self.get_object()
                self._log_action("retrieve", obj)
            except Exception:
                pass
        return response

    def list(self, request, *args, **kwargs):
        """Override to log list actions when audit_log_reads is True."""
        response = super().list(request, *args, **kwargs)
        if self.audit_log_reads and response.status_code == 200:
            from audit_log.logging import AuditLogger

            # Log as a single entry with metadata about the query
            count = (
                response.data.get("count")
                if isinstance(response.data, dict)
                else len(response.data)
            )
            filters = dict(request.query_params)

            AuditLogger.log(
                action="read",
                action_detail="list",
                message=self._get_audit_message("list"),
                metadata={
                    "count": count,
                    "filters": filters,
                    "page": request.query_params.get("page", 1),
                },
                references=self._get_references(None),
            )
        return response


class AuditLogDetailMixin:
    """
    Mixin for detailed attribute-level audit logging.

    Useful for models with many attributes where you want granular logging.

    Usage:
        class AssetViewSet(AuditLogDetailMixin, viewsets.ModelViewSet):
            audit_detail_fields = ['name', 'status', 'location']  # Fields to track in detail
    """

    audit_detail_fields: list = []

    def perform_update(self, serializer):
        """Log detailed field changes."""
        from audit_log.logging import AuditLogger

        instance = serializer.instance

        # Track specified fields
        old_values = {}
        for field_name in self.audit_detail_fields:
            if hasattr(instance, field_name):
                old_values[field_name] = getattr(instance, field_name)

        super().perform_update(serializer)
        instance.refresh_from_db()

        # Log individual field changes
        for field_name in self.audit_detail_fields:
            if field_name in old_values:
                old_val = old_values[field_name]
                new_val = getattr(instance, field_name, None)

                if str(old_val) != str(new_val):
                    AuditLogger.log(
                        action="update",
                        action_detail=f"field_{field_name}_changed",
                        message=f"Updated {field_name} on {instance.__class__.__name__}: {instance}",
                        target=instance,
                        changes={
                            field_name: {
                                "old": str(old_val) if old_val is not None else None,
                                "new": str(new_val) if new_val is not None else None,
                            }
                        },
                        references=(
                            self._get_references(instance)
                            if hasattr(self, "_get_references")
                            else []
                        ),
                    )
