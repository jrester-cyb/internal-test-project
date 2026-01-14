"""
API views for audit logs.
"""

from django.contrib.contenttypes.models import ContentType
from django.db.models import Count, Min, Max
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny

from .models import AuditLogEntry, AuditLogReference
from .serializers import (
    AuditLogEntrySerializer,
    AuditLogEntrySummarySerializer,
)


class AuditLogEntryViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint for viewing audit log entries.

    Provides read-only access to audit logs with filtering capabilities.
    All entries contain full request context - use batch_id to group related entries.
    """

    queryset = AuditLogEntry.objects.prefetch_related(
        "references",
        "target_content_type",
    ).select_related("user")
    serializer_class = AuditLogEntrySerializer
    permission_classes = [AllowAny]

    def get_serializer_class(self):
        if self.action == "list":
            return AuditLogEntrySummarySerializer
        return AuditLogEntrySerializer

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

        # Filter by action type
        action_type = self.request.query_params.get("action")
        if action_type:
            qs = qs.filter(action=action_type)

        # Filter by request method
        method = self.request.query_params.get("method")
        if method:
            qs = qs.filter(request_method=method.upper())

        # Filter by request path
        path = self.request.query_params.get("path")
        if path:
            qs = qs.filter(request_path__icontains=path)

        # Filter by batch_id
        batch_id = self.request.query_params.get("batch_id")
        if batch_id:
            qs = qs.filter(batch_id=batch_id)

        # Filter by target type
        target_type = self.request.query_params.get("target_type")
        if target_type:
            try:
                if "." in target_type:
                    app_label, model = target_type.split(".")
                    ct = ContentType.objects.get(app_label=app_label, model=model.lower())
                else:
                    ct = ContentType.objects.get(model=target_type.lower())
                qs = qs.filter(target_content_type=ct)
            except ContentType.DoesNotExist:
                pass

        # Filter by target object ID
        target_id = self.request.query_params.get("target_id")
        if target_id:
            qs = qs.filter(target_object_id=target_id)

        # Filter by date range
        start_date = self.request.query_params.get("start_date")
        if start_date:
            qs = qs.filter(created_at__gte=start_date)

        end_date = self.request.query_params.get("end_date")
        if end_date:
            qs = qs.filter(created_at__lte=end_date)

        return qs.order_by("-created_at")

    @action(detail=False, methods=["get"])
    def batches(self, request):
        """
        Get entries grouped by batch_id.

        Returns aggregated batch information without duplicating entry data.
        """
        qs = self.get_queryset()

        # Group by batch_id and get summary
        batches = (
            qs.values(
                "batch_id",
                "user_id",
                "user_email",
                "request_method",
                "request_path",
                "organization_id",
                "workspace_id",
                "duration_ms",
            )
            .annotate(
                entry_count=Count("id"),
                created_at=Min("created_at"),
            )
            .order_by("-created_at")
        )

        # Add username for each batch
        results = []
        for batch in batches:
            batch_data = dict(batch)
            if batch["user_id"]:
                from django.contrib.auth import get_user_model

                User = get_user_model()
                try:
                    user = User.objects.get(pk=batch["user_id"])
                    batch_data["username"] = user.username
                except User.DoesNotExist:
                    batch_data["username"] = None
            else:
                batch_data["username"] = None

            # Get actions for this batch
            actions = list(
                qs.filter(batch_id=batch["batch_id"])
                .values_list("action", flat=True)
                .distinct()
            )
            batch_data["actions"] = actions

            results.append(batch_data)

        return Response(results)

    @action(detail=False, methods=["get"])
    def for_object(self, request):
        """
        Get all audit entries related to a specific object.

        Query params:
            - type: Model type in format "app_label.ModelName" or just "modelname"
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
            if "." in target_type:
                app_label, model = target_type.split(".")
                ct = ContentType.objects.get(app_label=app_label, model=model.lower())
            else:
                ct = ContentType.objects.get(model=target_type.lower())
        except ContentType.DoesNotExist:
            return Response(
                {"error": f"Invalid type: {target_type}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Get entries where this object is the target
        target_entry_ids = set(
            AuditLogEntry.objects.filter(
                target_content_type=ct,
                target_object_id=target_id,
            ).values_list("id", flat=True)
        )

        # Also get entries where this object is a reference
        ref_entry_ids = set(
            AuditLogReference.objects.filter(
                content_type=ct,
                object_id=target_id,
            ).values_list("entry_id", flat=True)
        )

        # Combine and deduplicate
        all_ids = target_entry_ids | ref_entry_ids
        entries = (
            AuditLogEntry.objects.filter(id__in=all_ids)
            .prefetch_related("references", "target_content_type")
            .select_related("user")
            .order_by("-created_at")
        )

        page = self.paginate_queryset(entries)
        if page is not None:
            serializer = AuditLogEntrySerializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = AuditLogEntrySerializer(entries, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def batch(self, request):
        """
        Get all entries for a specific batch.

        Query params:
            - batch_id: The batch UUID
        """
        batch_id = request.query_params.get("batch_id")
        if not batch_id:
            return Response(
                {"error": "'batch_id' query parameter is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        entries = (
            AuditLogEntry.objects.filter(batch_id=batch_id)
            .prefetch_related("references", "target_content_type")
            .select_related("user")
            .order_by("order")
        )

        serializer = AuditLogEntrySerializer(entries, many=True)
        return Response(serializer.data)
