"""
API views for audit logs.
"""

from django.contrib.contenttypes.models import ContentType
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAdminUser

from .models import AuditLogBatch, AuditLogEntry, AuditLogReference
from .serializers import (
    AuditLogBatchSerializer,
    AuditLogBatchSummarySerializer,
    AuditLogEntrySerializer,
)


class AuditLogBatchViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint for viewing audit log batches.

    Provides read-only access to audit logs with filtering capabilities.
    """

    queryset = AuditLogBatch.objects.prefetch_related(
        "entries__references",
        "entries__target_content_type",
    ).select_related("user")
    serializer_class = AuditLogBatchSerializer
    permission_classes = [IsAdminUser]

    def get_serializer_class(self):
        if self.action == "list":
            return AuditLogBatchSummarySerializer
        return AuditLogBatchSerializer

    def get_queryset(self):
        qs = super().get_queryset()

        # Filter by organization
        org_id = self.request.query_params.get("organization_id")
        if org_id:
            qs = qs.filter(organization_id=org_id)

        # Filter by workspace
        workspace_id = self.request.query_params.get("workspace_id")
        if workspace_id:
            qs = qs.filter(workspace_id=workspace_id)

        # Filter by user
        user_id = self.request.query_params.get("user_id")
        if user_id:
            qs = qs.filter(user_id=user_id)

        # Filter by user email
        user_email = self.request.query_params.get("user_email")
        if user_email:
            qs = qs.filter(user_email__icontains=user_email)

        # Filter by request method
        method = self.request.query_params.get("method")
        if method:
            qs = qs.filter(request_method=method.upper())

        # Filter by request path
        path = self.request.query_params.get("path")
        if path:
            qs = qs.filter(request_path__icontains=path)

        # Filter by date range
        start_date = self.request.query_params.get("start_date")
        if start_date:
            qs = qs.filter(created_at__gte=start_date)

        end_date = self.request.query_params.get("end_date")
        if end_date:
            qs = qs.filter(created_at__lte=end_date)

        return qs.order_by("-created_at")


class AuditLogEntryViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint for viewing individual audit log entries.
    """

    queryset = AuditLogEntry.objects.prefetch_related(
        "references",
        "target_content_type",
    ).select_related("batch", "batch__user")
    serializer_class = AuditLogEntrySerializer
    permission_classes = [IsAdminUser]

    def get_queryset(self):
        qs = super().get_queryset()

        # Filter by action type
        action_type = self.request.query_params.get("action")
        if action_type:
            qs = qs.filter(action=action_type)

        # Filter by target type
        target_type = self.request.query_params.get("target_type")
        if target_type:
            try:
                app_label, model = target_type.split(".")
                ct = ContentType.objects.get(app_label=app_label, model=model.lower())
                qs = qs.filter(target_content_type=ct)
            except (ValueError, ContentType.DoesNotExist):
                pass

        # Filter by target object ID
        target_id = self.request.query_params.get("target_id")
        if target_id:
            qs = qs.filter(target_object_id=target_id)

        # Filter by batch
        batch_id = self.request.query_params.get("batch_id")
        if batch_id:
            qs = qs.filter(batch_id=batch_id)

        return qs.order_by("-created_at")

    @action(detail=False, methods=["get"])
    def for_object(self, request):
        """
        Get all audit entries related to a specific object.

        Query params:
            - type: Model type in format "app_label.ModelName"
            - id: Object ID
        """
        target_type = request.query_params.get("type")
        target_id = request.query_params.get("id")

        if not target_type or not target_id:
            return Response(
                {"error": "Both 'type' and 'id' query parameters are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            app_label, model = target_type.split(".")
            ct = ContentType.objects.get(app_label=app_label, model=model.lower())
        except (ValueError, ContentType.DoesNotExist):
            return Response(
                {"error": f"Invalid type: {target_type}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Get entries where this object is the target
        target_entries = AuditLogEntry.objects.filter(
            target_content_type=ct,
            target_object_id=target_id,
        )

        # Also get entries where this object is a reference
        ref_entry_ids = AuditLogReference.objects.filter(
            content_type=ct,
            object_id=target_id,
        ).values_list("entry_id", flat=True)

        # Combine and deduplicate
        entries = (
            AuditLogEntry.objects.filter(
                id__in=set(target_entries.values_list("id", flat=True))
                | set(ref_entry_ids)
            )
            .prefetch_related(
                "references",
                "batch",
            )
            .order_by("-created_at")
        )

        serializer = self.get_serializer(entries, many=True)
        return Response(serializer.data)
