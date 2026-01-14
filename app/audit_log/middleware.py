"""
Middleware for capturing request context and batching audit log entries.
"""

import uuid
import time
from django.conf import settings
from django.utils.deprecation import MiddlewareMixin

from .logging import (
    AuditRequestContext,
    set_current_request_context,
    get_current_request_context,
    clear_current_request_context,
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

    def should_skip_path(self, request) -> bool:
        """Check if this path should be completely skipped."""
        for path in self.EXCLUDED_PATHS:
            if request.path.startswith(path):
                return True
        return False

    def process_request(self, request):
        """Initialize audit request context for this request."""
        # Skip excluded paths entirely
        if self.should_skip_path(request):
            return None

        # Always create request context - individual views may want to log
        # even if global LOG_READS is False (via audit_log_reads = True on ViewSet)

        # Generate request ID
        request_id = request.META.get("HTTP_X_REQUEST_ID") or str(uuid.uuid4())
        request.audit_request_id = request_id

        # Extract context IDs (may not be available yet before URL resolution)
        organization_id, workspace_id = extract_context_ids(request)

        # Create request context
        ctx = AuditRequestContext(
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

        set_current_request_context(ctx)
        return None

    def process_view(self, request, view_func, view_args, view_kwargs):
        """Update context with resolved URL parameters."""
        ctx = get_current_request_context()
        if ctx:
            # Update organization/workspace IDs now that URL is resolved
            if not ctx.organization_id:
                ctx.organization_id = view_kwargs.get(
                    "organization_pk"
                ) or view_kwargs.get("organization_id")
            if not ctx.workspace_id:
                ctx.workspace_id = view_kwargs.get("workspace_pk") or view_kwargs.get(
                    "workspace_id"
                )

            # Update user info (authentication middleware runs before us)
            if hasattr(request, "user") and request.user.is_authenticated:
                ctx.user = request.user
                ctx.user_email = getattr(request.user, "email", "")

        return None

    def process_response(self, request, response):
        """Submit audit request for processing."""
        ctx = get_current_request_context()

        if ctx and ctx.entries:
            from .tasks import process_audit_request

            # Calculate duration
            request_data = ctx.to_dict()

            # Submit for processing
            try:
                process_audit_request.delay(request_data)
            except Exception:
                # If Celery is not available, queue for later processing
                from .models import AuditLogPendingBatch

                AuditLogPendingBatch.objects.create(data=request_data)

        # Clean up
        clear_current_request_context()

        return response

    def process_exception(self, request, exception):
        """Clean up on exception."""
        clear_current_request_context()
        return None
