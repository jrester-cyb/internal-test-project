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


def get_session_id_from_request(request) -> str | None:
    """
    Extract the session_id from the JWT token in the request.
    Returns None if no valid session_id is found.
    """
    if hasattr(request, "auth") and request.auth:
        # request.auth is the validated token payload from SimpleJWT
        return request.auth.get("session_id")
    return None


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
        if request:
            current_session_id = get_session_id_from_request(request)
            if current_session_id:
                return str(obj.id) == current_session_id
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
        Return active sessions for the specified user.
        Users can only see their own sessions unless they have admin permissions.
        Excludes soft-deleted sessions (handled by manager) and logged-out sessions.
        """
        user_id = self.kwargs.get("user_id")
        user = self.request.user

        # Check if user is requesting their own sessions or has permission
        if str(user.id) != user_id and not user.is_staff:
            return UserSession.objects.none()

        return UserSession.objects.filter(
            user_id=user_id,
            logged_out_at__isnull=True,  # Only active sessions
        ).order_by("-created_at")

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["request"] = self.request
        return context

    def _is_current_session(self, request, session) -> bool:
        """Check if the given session is the current session from the JWT."""
        current_session_id = get_session_id_from_request(request)
        if current_session_id:
            return str(session.id) == current_session_id
        return False

    def destroy(self, request, user_id=None, id=None):
        """
        Revoke a session by marking it as logged out.
        """
        session = self.get_object()

        # Don't allow revoking the current session via this endpoint
        if self._is_current_session(request, session):
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
        if self._is_current_session(request, session):
            return Response(
                {"detail": "Cannot revoke your current session. Use logout instead."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        session.logout()
        return Response({"detail": "Session revoked."}, status=status.HTTP_200_OK)

    @action(detail=False, methods=["post"], url_path="revoke-all")
    def revoke_all(self, request, user_id=None):
        """
        Revoke all sessions except the current one.
        """
        current_session_id = get_session_id_from_request(request)
        queryset = self.get_queryset()

        # Exclude the current session
        if current_session_id:
            queryset = queryset.exclude(id=current_session_id)

        count = queryset.count()
        for session in queryset:
            session.logout()

        return Response(
            {"detail": f"Revoked {count} session(s).", "count": count},
            status=status.HTTP_200_OK,
        )
