"""
Celery tasks for executing actions.
"""

import logging
import requests
from django.utils import timezone

logger = logging.getLogger(__name__)

# Try to import Celery, but make it optional
try:
    from celery import shared_task

    CELERY_AVAILABLE = True
except ImportError:
    CELERY_AVAILABLE = False

    # Create a dummy decorator when Celery isn't available
    def shared_task(*args, **kwargs):
        def decorator(func):
            func.delay = lambda *a, **kw: func(*a, **kw)  # Sync fallback
            return func

        if args and callable(args[0]):
            return decorator(args[0])
        return decorator


@shared_task(bind=True, max_retries=3)
def execute_trigger_actions(self, trigger_id: str, entry_id: str):
    """
    Execute all actions for a trigger that matched an audit entry.
    """
    from .models import Trigger, Action, ActionExecution
    from audit_log.models import AuditLogEntry

    try:
        trigger = Trigger.objects.get(id=trigger_id)
        entry = AuditLogEntry.objects.select_related(
            "request", "target_content_type"
        ).get(id=entry_id)
    except (Trigger.DoesNotExist, AuditLogEntry.DoesNotExist) as e:
        logger.error(f"Trigger or entry not found: {e}")
        return

    actions = trigger.actions.filter(is_active=True).order_by("order")

    for action in actions:
        execution = ActionExecution.objects.create(
            action=action,
            audit_entry=entry,
            status=ActionExecution.Status.RUNNING,
            started_at=timezone.now(),
        )

        try:
            result = execute_action(action, entry)
            execution.status = ActionExecution.Status.SUCCESS
            execution.result = result
        except Exception as e:
            logger.exception(f"Action {action.id} failed: {e}")
            execution.status = ActionExecution.Status.FAILED
            execution.result = {"error": str(e)}
        finally:
            execution.completed_at = timezone.now()
            execution.save()


def execute_action(action, entry):
    """
    Execute a single action based on its type.
    """
    from .models import Action

    if action.action_type == Action.ActionType.WEBHOOK:
        return execute_webhook(action, entry)
    elif action.action_type == Action.ActionType.EMAIL:
        return execute_email(action, entry)
    elif action.action_type == Action.ActionType.CELERY_TASK:
        return execute_celery_task(action, entry)
    elif action.action_type == Action.ActionType.LOG:
        return execute_log(action, entry)
    else:
        raise ValueError(f"Unknown action type: {action.action_type}")


def execute_webhook(action, entry):
    """Send a webhook request with entry data."""
    config = action.config
    url = config.get("url")
    method = config.get("method", "POST").upper()
    headers = config.get("headers", {})
    timeout = config.get("timeout", 30)

    if not url:
        raise ValueError("Webhook URL is required")

    payload = build_entry_payload(entry)

    response = requests.request(
        method=method,
        url=url,
        json=payload,
        headers=headers,
        timeout=timeout,
    )
    response.raise_for_status()

    return {
        "status_code": response.status_code,
        "response": response.text[:1000],  # Truncate response
    }


def execute_email(action, entry):
    """Send an email notification."""
    from django.core.mail import send_mail

    config = action.config
    to_emails = config.get("to", [])
    subject_template = config.get("subject", "Action triggered: {action}")
    body_template = config.get("body", "Entry: {entry_id}")

    if not to_emails:
        raise ValueError("Email recipients are required")

    subject = subject_template.format(
        action=entry.action,
        target_type=(
            entry.target_content_type.model if entry.target_content_type else "unknown"
        ),
    )
    body = body_template.format(
        entry_id=str(entry.id),
        action=entry.action,
        message=entry.message,
        target_repr=entry.target_repr,
    )

    send_mail(
        subject=subject,
        message=body,
        from_email=None,  # Uses DEFAULT_FROM_EMAIL
        recipient_list=to_emails,
    )

    return {"sent_to": to_emails}


def execute_celery_task(action, entry):
    """Execute a Celery task."""
    if not CELERY_AVAILABLE:
        raise ValueError("Celery is not installed. Cannot execute celery_task actions.")

    from celery import current_app

    config = action.config
    task_name = config.get("task_name")
    task_args = config.get("args", [])
    task_kwargs = config.get("kwargs", {})

    if not task_name:
        raise ValueError("Task name is required")

    # Add entry info to kwargs
    task_kwargs["_audit_entry_id"] = str(entry.id)

    task = current_app.send_task(task_name, args=task_args, kwargs=task_kwargs)

    return {"task_id": task.id}


def execute_log(action, entry):
    """Log a message."""
    config = action.config
    level = config.get("level", "info").lower()
    message_template = config.get("message", "Trigger fired for entry {entry_id}")

    message = message_template.format(
        entry_id=str(entry.id),
        action=entry.action,
        message=entry.message,
        target_repr=entry.target_repr,
    )

    log_func = getattr(logger, level, logger.info)
    log_func(message)

    return {"logged": message}


def build_entry_payload(entry):
    """Build a JSON-serializable payload from an entry."""
    payload = {
        "id": str(entry.id),
        "action": entry.action,
        "action_detail": entry.action_detail,
        "message": entry.message,
        "target_type": (
            entry.target_content_type.model if entry.target_content_type else None
        ),
        "target_object_id": entry.target_object_id,
        "target_repr": entry.target_repr,
        "changes": entry.changes,
        "metadata": entry.metadata,
        "created_at": entry.created_at.isoformat(),
    }

    if entry.request:
        payload["request"] = {
            "user_id": str(entry.request.user_id) if entry.request.user_id else None,
            "user_repr": str(entry.request.user) if entry.request.user else None,
            "user_email": entry.request.user_email,
            "source": entry.request.source,
            "organization_id": (
                str(entry.request.organization_id)
                if entry.request.organization_id
                else None
            ),
            "organization_repr": (
                str(entry.request.organization) if entry.request.organization else None
            ),
            "workspace_id": (
                str(entry.request.workspace_id) if entry.request.workspace_id else None
            ),
            "workspace_repr": (
                str(entry.request.workspace) if entry.request.workspace else None
            ),
        }

    return payload
