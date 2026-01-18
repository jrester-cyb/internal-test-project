# django
from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied

# local
from auth_manager.jwt_utils import create_tokens_for_user, set_jwt_cookies
from auth_manager.models.one_time_token import OneTimeToken
from auth_manager.models.user_session import UserSession
from users_manager.serializers import UserSerializer

# thirdparty
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

User = get_user_model()


class APITokenInitView(APIView):
    """
    Exchange a OneTimeToken for JWT access and refresh tokens.

    Used by mobile/API clients after completing the web-based auth flow.
    The OneTimeToken is obtained from the redirect URL after MFA verification.
    """

    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs) -> Response:
        token = request.data.get("token", "")
        is_valid, user = OneTimeToken.objects.validate_token(token)
        if not is_valid:
            raise PermissionDenied()

        # Create session record for tracking (before JWT so we can include session_id)
        session = UserSession.objects.create_from_request(user, request)

        # Generate JWT tokens with session_id
        access_token, refresh_token = create_tokens_for_user(user, session_id=session.id)

        # Build response with tokens and user info
        response_data = {
            "access": access_token,
            "refresh": refresh_token,
            "user": UserSerializer(user, context={"request": request}).data,
        }

        response = Response(response_data, status=201)

        # Also set cookies in case this is called from a web context
        set_jwt_cookies(response, access_token, refresh_token)

        return response
