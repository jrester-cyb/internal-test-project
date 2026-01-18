# django
from django.shortcuts import get_object_or_404

# local
from app.pagination import FlexiblePagination
from auth_manager.models import UserSession
from auth_manager.permissions import IsMultiFactorAuthenticated

# thirdparty
from rest_framework import serializers, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet
from rest_framework.mixins import ListModelMixin, RetrieveModelMixin, DestroyModelMixin


class UserSessionSerializer(serializers.ModelSerializer):
    device = serializers.SerializerMethodField()
    location = serializers.SerializerMethodField()
    is_current = serializers.SerializerMethodField()

    class Meta:
        model = UserSession
        fields = [
            "id",
            "device",
            "location",
            "ip_address",
            "device_type",
            "browser",
            "operating_system",
            "created_at",
            "last_activity_at",
            "logged_out_at",
            "is_current",
        ]

    def get_device(self, obj) -> str | None:
        return obj.device_display

    def get_location(self, obj) -> str | None:
        return obj.location_display

    def get_is_current(self, obj) -> bool:
        request = self.context.get("request")
        if request and hasattr(request, "session"):
            return obj.session_key == request.session.session_key
        return False


class UserSessionsViewSet(
    ListModelMixin, RetrieveModelMixin, DestroyModelMixin, GenericViewSet
):
    """
    ViewSet for managing user sessions.

    Allows users to view and revoke their own sessions.
    Users with appropriate permissions can also manage sessions for other users.

    Endpoints:
    - GET /users/{user_id}/sessions/ - List all sessions for a user
    - GET /users/{user_id}/sessions/{id}/ - Get a specific session
    - DELETE /users/{user_id}/sessions/{id}/ - Revoke (logout) a session
    - POST /users/{user_id}/sessions/{id}/revoke/ - Alternative revoke endpoint
    """

    permission_classes = [IsMultiFactorAuthenticated]
    serializer_class = UserSessionSerializer
    pagination_class = FlexiblePagination
    lookup_field = "id"

    def get_queryset(self):
        """
        Return sessions for the specified user.
        Users can only see their own sessions unless they have admin permissions.
        """
        user_id = self.kwargs.get("user_id")
        user = self.request.user

        # Check if user is requesting their own sessions or has permission
        if str(user.id) != user_id and not user.is_staff:
            return UserSession.objects.none()

        return UserSession.objects.filter(user_id=user_id).order_by("-created_at")

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["request"] = self.request
        return context

    def destroy(self, request, user_id=None, id=None):
        """
        Revoke a session by marking it as logged out.
        """
        session = self.get_object()

        # Don't allow revoking the current session via this endpoint
        if (
            hasattr(request, "session")
            and session.session_key == request.session.session_key
        ):
            return Response(
                {"detail": "Cannot revoke your current session. Use logout instead."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        session.logout()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], url_path="revoke")
    def revoke(self, request, user_id=None, id=None):
        """
        Alternative endpoint to revoke a session.
        """
        session = self.get_object()

        # Don't allow revoking the current session via this endpoint
        if (
            hasattr(request, "session")
            and session.session_key == request.session.session_key
        ):
            return Response(
                {"detail": "Cannot revoke your current session. Use logout instead."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        session.logout()
        return Response({"detail": "Session revoked."}, status=status.HTTP_200_OK)
