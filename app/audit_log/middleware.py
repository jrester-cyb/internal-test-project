"""
Middleware for capturing request context and batching audit log entries.
"""

import uuid
import time
from django.conf import settings
from django.utils.deprecation import MiddlewareMixin

from .logging import (
    AuditBatchContext,
    set_current_batch,
    get_current_batch,
    clear_current_batch,
)


def get_client_ip(request):
    """Extract client IP from request, handling proxies."""
    x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if x_forwarded_for:
        ip = x_forwarded_for.split(",")[0].strip()
    else:
        ip = request.META.get("REMOTE_ADDR")
    return ip


def extract_context_ids(request):
    """Extract organization and workspace IDs from request path or params."""
    organization_id = None
    workspace_id = None

    # Try URL kwargs first (from DRF view)
    if hasattr(request, "parser_context") and request.parser_context:
        kwargs = request.parser_context.get("kwargs", {})
        organization_id = kwargs.get("organization_pk") or kwargs.get("organization_id")
        workspace_id = kwargs.get("workspace_pk") or kwargs.get("workspace_id")

    # Fall back to resolver match
    if (
        not organization_id
        and hasattr(request, "resolver_match")
        and request.resolver_match
    ):
        kwargs = request.resolver_match.kwargs
        organization_id = kwargs.get("organization_pk") or kwargs.get("organization_id")
        workspace_id = kwargs.get("workspace_pk") or kwargs.get("workspace_id")

    # Fall back to query params
    if not organization_id:
        organization_id = request.GET.get("organization_id") or request.GET.get(
            "organization"
        )
    if not workspace_id:
        workspace_id = request.GET.get("workspace_id") or request.GET.get("workspace")

    return organization_id, workspace_id


class AuditLogMiddleware(MiddlewareMixin):
    """
    Middleware that captures request context for audit logging.

    - Creates a batch context at request start
    - Collects all audit entries during the request
    - Submits the batch for async processing at request end

    Add to MIDDLEWARE:
        'audit_log.middleware.AuditLogMiddleware',
    """

    # Paths to exclude from audit logging
    EXCLUDED_PATHS = getattr(
        settings,
        "AUDIT_LOG_EXCLUDED_PATHS",
        [
            "/health/",
            "/api/health/",
            "/static/",
            "/media/",
            "/__debug__/",
            "/silk/",
        ],
    )

    # Methods to exclude (typically only log state-changing methods)
    EXCLUDED_METHODS = getattr(settings, "AUDIT_LOG_EXCLUDED_METHODS", [])

    # Whether to log read operations
    LOG_READS = getattr(settings, "AUDIT_LOG_READS", False)

    def should_audit(self, request) -> bool:
        """Determine if this request should be audited."""
        # Check excluded paths
        for path in self.EXCLUDED_PATHS:
            if request.path.startswith(path):
                return False

        # Check excluded methods
        if request.method in self.EXCLUDED_METHODS:
            return False

        # By default, only audit state-changing methods unless LOG_READS is True
        if not self.LOG_READS and request.method in ("GET", "HEAD", "OPTIONS"):
            return False

        return True

    def process_request(self, request):
        """Initialize audit batch context for this request."""
        if not self.should_audit(request):
            return None

        # Generate request ID
        request_id = request.META.get("HTTP_X_REQUEST_ID") or str(uuid.uuid4())
        request.audit_request_id = request_id

        # Extract context IDs (may not be available yet before URL resolution)
        organization_id, workspace_id = extract_context_ids(request)

        # Create batch context
        batch = AuditBatchContext(
            request_id=request_id,
            user=(
                request.user
                if hasattr(request, "user") and request.user.is_authenticated
                else None
            ),
            user_email=(
                getattr(request.user, "email", "") if hasattr(request, "user") else ""
            ),
            request_method=request.method,
            request_path=request.path,
            query_params=dict(request.GET),
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", "")[:500],
            organization_id=organization_id,
            workspace_id=workspace_id,
            start_time=time.time(),
        )

        set_current_batch(batch)
        return None

    def process_view(self, request, view_func, view_args, view_kwargs):
        """Update context with resolved URL parameters."""
        batch = get_current_batch()
        if batch:
            # Update organization/workspace IDs now that URL is resolved
            if not batch.organization_id:
                batch.organization_id = view_kwargs.get(
                    "organization_pk"
                ) or view_kwargs.get("organization_id")
            if not batch.workspace_id:
                batch.workspace_id = view_kwargs.get("workspace_pk") or view_kwargs.get(
                    "workspace_id"
                )

            # Update user info (authentication middleware runs before us)
            if hasattr(request, "user") and request.user.is_authenticated:
                batch.user = request.user
                batch.user_email = getattr(request.user, "email", "")

        return None

    def process_response(self, request, response):
        """Submit audit batch for async processing."""
        batch = get_current_batch()

        if batch and batch.entries:
            from .tasks import process_audit_batch

            # Calculate duration
            batch_data = batch.to_dict()

            # Submit for async processing
            try:
                process_audit_batch.delay(batch_data)
            except Exception:
                # If Celery is not available, queue for later processing
                from .models import AuditLogPendingBatch

                AuditLogPendingBatch.objects.create(data=batch_data)

        # Clean up
        clear_current_batch()

        return response

    def process_exception(self, request, exception):
        """Clean up on exception."""
        clear_current_batch()
        return None
