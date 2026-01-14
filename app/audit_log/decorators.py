"""
Decorators for adding audit logging to views.
"""

from functools import wraps
from typing import Callable, Union


def audit_action(
    action: str,
    message: str = None,
    action_detail: str = "",
    get_target: Callable = None,
    get_references: Callable = None,
    get_changes: Callable = None,
):
    """
    Decorator to add audit logging to a view function.

    Usage:
        @audit_action('create', message='Created new asset')
        def create_asset(request):
            ...

        # With dynamic message
        @audit_action(
            'update',
            get_target=lambda view, request, response: response.data.get('id'),
            get_changes=lambda view, request, response: {'status': request.data.get('status')},
        )
        def update_asset(request, pk):
            ...

    Args:
        action: The action type (create, update, delete, etc.)
        message: Static message or None to auto-generate
        action_detail: More specific action identifier
        get_target: Function(view, request, response) -> target object or ID
        get_references: Function(view, request, response) -> list of related objects
        get_changes: Function(view, request, response) -> dict of changes
    """

    def decorator(func: Callable):
        @wraps(func)
        def wrapper(self_or_request, *args, **kwargs):
            from audit_log.logging import AuditLogger

            # Handle both function views and class-based views
            if hasattr(self_or_request, "request"):
                # Class-based view
                view = self_or_request
                request = view.request
            else:
                # Function view
                view = None
                request = self_or_request

            # Execute the view
            response = func(self_or_request, *args, **kwargs)

            # Only log successful responses (2xx)
            if hasattr(response, "status_code") and 200 <= response.status_code < 300:
                # Get target
                target = None
                if get_target:
                    try:
                        target = get_target(view, request, response)
                    except Exception:
                        pass

                # Get references
                references = []
                if get_references:
                    try:
                        references = get_references(view, request, response)
                    except Exception:
                        pass

                # Get changes
                changes = {}
                if get_changes:
                    try:
                        changes = get_changes(view, request, response)
                    except Exception:
                        pass

                # Build message
                log_message = message
                if not log_message:
                    target_name = target.__class__.__name__ if target else "resource"
                    log_message = f"{action.capitalize()}d {target_name}"

                AuditLogger.log(
                    action=action,
                    message=log_message,
                    target=target,
                    action_detail=action_detail,
                    changes=changes,
                    references=references,
                )

            return response

        return wrapper

    return decorator


def audit_viewset_action(
    action: str = None,
    message: str = None,
    action_detail: str = "",
    include_changes: bool = True,
    include_metadata: bool = True,
):
    """
    Decorator for ViewSet action methods with automatic target detection.

    Usage:
        class AssetViewSet(viewsets.ModelViewSet):
            @audit_viewset_action(action='custom', message='Performed custom action')
            @action(detail=True, methods=['post'])
            def custom_action(self, request, pk=None):
                ...
    """

    def decorator(func: Callable):
        @wraps(func)
        def wrapper(self, request, *args, **kwargs):
            from audit_log.logging import AuditLogger

            # Get the object before the action (for tracking changes)
            old_values = {}
            obj = None
            if hasattr(self, "get_object") and (
                kwargs.get("pk") or hasattr(self, "kwargs")
            ):
                try:
                    obj = self.get_object()
                    if include_changes:
                        # Capture current field values
                        for field in obj._meta.fields:
                            old_values[field.name] = getattr(obj, field.name)
                except Exception:
                    pass

            # Execute the action
            response = func(self, request, *args, **kwargs)

            # Only log successful responses
            if hasattr(response, "status_code") and 200 <= response.status_code < 300:
                # Determine action type
                log_action = action or self.action

                # Get the object after (it might have been created)
                target = obj
                if not target and hasattr(self, "get_object"):
                    try:
                        target = self.get_object()
                    except Exception:
                        pass

                # Calculate changes
                changes = {}
                if include_changes and target and old_values:
                    target.refresh_from_db()
                    for field in target._meta.fields:
                        old_val = old_values.get(field.name)
                        new_val = getattr(target, field.name)
                        if old_val != new_val:
                            changes[field.name] = {
                                "old": str(old_val) if old_val else None,
                                "new": str(new_val) if new_val else None,
                            }

                # Build metadata
                metadata = {}
                if include_metadata:
                    # Add view kwargs (workspace_pk, organization_pk, etc.)
                    if hasattr(self, "kwargs"):
                        metadata["view_kwargs"] = {
                            k: str(v) for k, v in self.kwargs.items()
                        }
                    # Add result count for list actions
                    if log_action == "list" and hasattr(response, "data"):
                        data = response.data
                        if isinstance(data, dict) and "count" in data:
                            metadata["result_count"] = data["count"]
                        elif isinstance(data, list):
                            metadata["result_count"] = len(data)

                # Build message
                log_message = message
                if not log_message:
                    model_name = target.__class__.__name__ if target else "resource"
                    log_message = (
                        f"{log_action.replace('_', ' ').capitalize()} {model_name}"
                    )
                    if target:
                        log_message += f": {target}"

                # Get references (workspace, organization if available)
                references = []
                if target:
                    if hasattr(target, "workspace") and target.workspace:
                        references.append((target.workspace, "workspace"))
                    if hasattr(target, "organization") and target.organization:
                        references.append((target.organization, "organization"))

                AuditLogger.log(
                    action=log_action,
                    message=log_message,
                    target=target,
                    action_detail=action_detail,
                    changes=changes,
                    metadata=metadata,
                    references=references,
                )

            return response

        return wrapper

    return decorator
