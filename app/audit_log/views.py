"""
API views for audit logs.
"""

from collections import defaultdict

from django.contrib.contenttypes.models import ContentType
from django.db.models import Count, Prefetch
from rest_framework import viewsets, status
from rest_framework.generics import ListAPIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny

from .models import AuditLogRequest, AuditLogEntry, AuditLogReference, AuditLogGroup
from .serializers import (
    AuditLogRequestSerializer,
    AuditLogRequestSummarySerializer,
    AuditLogEntrySerializer,
    AuditLogEntrySummarySerializer,
    AuditLogGroupSerializer,
    AuditLogGroupSummarySerializer,
    AuditLogGroupWithEntriesSerializer,
    AuditLogReferenceSerializer,
    EntryInGroupSerializer,
)


class AuditLogRequestViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint for viewing audit log requests.

    Each request represents one HTTP request with all its audit entries.
    """

    queryset = AuditLogRequest.objects.prefetch_related(
        "entries",
        "entries__target_content_type",
    ).select_related("user", "organization", "workspace")
    serializer_class = AuditLogRequestSerializer
    permission_classes = [AllowAny]

    def get_serializer_class(self):
        if self.action == "list":
            return AuditLogRequestSummarySerializer
        return AuditLogRequestSerializer

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

        # Only include requests with entries
        has_entries = self.request.query_params.get("has_entries", "true")
        if has_entries.lower() == "true":
            qs = qs.annotate(entry_count=Count("entries")).filter(entry_count__gt=0)

        return qs.order_by("-created_at")


class AuditLogEntryListView(ListAPIView):
    """
    API endpoint for viewing audit log entries.

    Returns entries in a grouped format:
    - Entries with a group containing 2+ entries are serialized as a group with nested entries
    - Single entries (no group or alone in group) are serialized with request metadata
    """

    permission_classes = [AllowAny]

    def get_queryset(self):
        qs = AuditLogEntry.objects.prefetch_related(
            "references",
            "target_content_type",
            Prefetch(
                "group",
                queryset=AuditLogGroup.objects.prefetch_related(
                    Prefetch(
                        "entries",
                        queryset=AuditLogEntry.objects.prefetch_related(
                            "references", "target_content_type"
                        ).order_by("order"),
                    )
                ),
            ),
        ).select_related("request")

        # Filter by organization (via request)
        org_id = self.request.query_params.get("organization_id")
        if org_id:
            qs = qs.filter(request__organization_id=org_id)

        # Filter by workspace (via request)
        workspace_id = self.request.query_params.get("workspace_id")
        if workspace_id:
            qs = qs.filter(request__workspace_id=workspace_id)

        # Filter by user (via request)
        user_id = self.request.query_params.get("user_id")
        if user_id:
            qs = qs.filter(request__user_id=user_id)

        # Filter by user email (via request)
        user_email = self.request.query_params.get("user_email")
        if user_email:
            qs = qs.filter(request__user_email__icontains=user_email)

        # Filter by action type
        action_type = self.request.query_params.get("action")
        if action_type:
            qs = qs.filter(action=action_type)

        # Filter by request method (via request)
        method = self.request.query_params.get("method")
        if method:
            qs = qs.filter(request__request_method=method.upper())

        # Filter by request path (via request)
        path = self.request.query_params.get("path")
        if path:
            qs = qs.filter(request__request_path__icontains=path)

        # Filter by group_id
        group_id = self.request.query_params.get("group_id")
        if group_id:
            qs = qs.filter(group_id=group_id)

        # Filter by request_id (the AuditLogRequest PK)
        request_id = self.request.query_params.get("request_id")
        if request_id:
            qs = qs.filter(request_id=request_id)

        # Filter by target type
        target_type = self.request.query_params.get("target_type")
        if target_type:
            try:
                if "." in target_type:
                    app_label, model = target_type.split(".")
                    ct = ContentType.objects.get(
                        app_label=app_label, model=model.lower()
                    )
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

    def _build_request_metadata(self, req):
        """Extract request metadata from an AuditLogRequest."""
        return {
            "user_id": str(req.user_id) if req.user_id else None,
            "username": str(req.user) if req.user else None,
            "user_email": req.user_email,
            "request_method": req.request_method,
            "request_path": req.request_path,
            "source": req.source,
            "organization_id": str(req.organization_id) if req.organization_id else None,
            "organization_name": str(req.organization) if req.organization else None,
            "workspace_id": str(req.workspace_id) if req.workspace_id else None,
            "workspace_name": str(req.workspace) if req.workspace else None,
        }

    def _serialize_entry(self, entry):
        """Serialize a single entry with request metadata."""
        references = AuditLogReferenceSerializer(entry.references.all(), many=True).data
        result = {
            "type": "entry",
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
            "references": references,
            "created_at": entry.created_at.isoformat(),
        }
        # Add request metadata
        if entry.request:
            result.update(self._build_request_metadata(entry.request))
        return result

    def _serialize_group(self, group, entries):
        """Serialize a group with its entries."""
        # Get request metadata from first entry
        first_entry = entries[0] if entries else None
        request_metadata = {}
        if first_entry and first_entry.request:
            request_metadata = self._build_request_metadata(first_entry.request)

        serialized_entries = []
        for entry in entries:
            references = AuditLogReferenceSerializer(
                entry.references.all(), many=True
            ).data
            serialized_entries.append(
                {
                    "id": str(entry.id),
                    "action": entry.action,
                    "action_detail": entry.action_detail,
                    "message": entry.message,
                    "target_type": (
                        entry.target_content_type.model
                        if entry.target_content_type
                        else None
                    ),
                    "target_object_id": entry.target_object_id,
                    "target_repr": entry.target_repr,
                    "changes": entry.changes,
                    "metadata": entry.metadata,
                    "references": references,
                    "created_at": entry.created_at.isoformat(),
                    "order": entry.order,
                }
            )

        result = {
            "type": "group",
            "group": {
                "id": str(group.id),
                "description": group.description,
                "source_type": group.source_type,
                "source_name": group.source_name,
                "metadata": group.metadata,
                "created_at": group.created_at.isoformat(),
            },
            "entries": serialized_entries,
            "created_at": group.created_at.isoformat(),
        }
        result.update(request_metadata)
        return result

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        page = self.paginate_queryset(queryset)
        entries_to_process = page if page is not None else queryset

        # Group entries by their group_id
        groups_seen = set()
        groups_with_entries = defaultdict(list)
        standalone_entries = []

        for entry in entries_to_process:
            if entry.group:
                group_entries = list(entry.group.entries.all())
                if len(group_entries) >= 2:
                    # This is a multi-entry group
                    if entry.group.id not in groups_seen:
                        groups_seen.add(entry.group.id)
                        groups_with_entries[entry.group.id] = {
                            "group": entry.group,
                            "entries": group_entries,
                            "created_at": entry.group.created_at,
                        }
                else:
                    # Single entry in group - treat as standalone
                    standalone_entries.append(entry)
            else:
                standalone_entries.append(entry)

        # Build results list maintaining chronological order
        results = []

        # Collect all items with their timestamps for sorting
        items = []
        for group_data in groups_with_entries.values():
            items.append(
                {
                    "type": "group",
                    "data": group_data,
                    "created_at": group_data["created_at"],
                }
            )
        for entry in standalone_entries:
            items.append(
                {
                    "type": "entry",
                    "data": entry,
                    "created_at": entry.created_at,
                }
            )

        # Sort by created_at descending
        items.sort(key=lambda x: x["created_at"], reverse=True)

        # Serialize
        for item in items:
            if item["type"] == "group":
                results.append(
                    self._serialize_group(
                        item["data"]["group"], item["data"]["entries"]
                    )
                )
            else:
                results.append(self._serialize_entry(item["data"]))

        if page is not None:
            return self.get_paginated_response(results)
        return Response(results)


class AuditLogGroupViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint for viewing audit log groups.

    Groups provide a way to see related entries with a description.
    """

    queryset = AuditLogGroup.objects.prefetch_related(
        "entries",
        "entries__target_content_type",
        "entries__request",
    ).order_by("-created_at")
    serializer_class = AuditLogGroupSerializer
    permission_classes = [AllowAny]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return AuditLogGroupWithEntriesSerializer
        return AuditLogGroupSerializer

    def get_queryset(self):
        qs = super().get_queryset()

        # Filter by source_type
        source_type = self.request.query_params.get("source_type")
        if source_type:
            qs = qs.filter(source_type=source_type)

        # Filter by source_name
        source_name = self.request.query_params.get("source_name")
        if source_name:
            qs = qs.filter(source_name__icontains=source_name)

        # Filter by description
        description = self.request.query_params.get("description")
        if description:
            qs = qs.filter(description__icontains=description)

        # Filter by date range
        start_date = self.request.query_params.get("start_date")
        if start_date:
            qs = qs.filter(created_at__gte=start_date)

        end_date = self.request.query_params.get("end_date")
        if end_date:
            qs = qs.filter(created_at__lte=end_date)

        return qs
