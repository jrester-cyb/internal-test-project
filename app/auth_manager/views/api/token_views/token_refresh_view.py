# django
from django.conf import settings

# local
from auth_manager.jwt_utils import set_jwt_cookies

# thirdparty
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.tokens import RefreshToken


class TokenRefreshView(APIView):
    """
    Refresh JWT access token using a refresh token.

    The refresh token can be provided either:
    1. In the request body as {"refresh": "<token>"}
    2. In the refresh_token cookie (for web clients)

    Returns new access and refresh tokens, and sets them as cookies.
    """

    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs) -> Response:
        # Try to get refresh token from body first, then from cookie
        refresh_token = request.data.get("refresh")
        if not refresh_token:
            refresh_token = request.COOKIES.get(settings.JWT_AUTH_REFRESH_COOKIE)

        if not refresh_token:
            return Response(
                {"detail": "No refresh token provided."},
                status=400,
            )

        try:
            # Validate and rotate the refresh token
            token = RefreshToken(refresh_token)
            # Blacklist the old token if rotation is enabled
            if settings.SIMPLE_JWT.get("ROTATE_REFRESH_TOKENS", False):
                if settings.SIMPLE_JWT.get("BLACKLIST_AFTER_ROTATION", False):
                    try:
                        token.blacklist()
                    except AttributeError:
                        # Token blacklist not enabled
                        pass

            # Generate new tokens
            new_refresh = RefreshToken.for_user(token.payload.get("user_id"))
            # We need to get the user to generate proper tokens
            from django.contrib.auth import get_user_model

            User = get_user_model()
            try:
                user = User.objects.get(id=token.payload.get("user_id"))
                new_refresh = RefreshToken.for_user(user)
            except User.DoesNotExist:
                return Response({"detail": "User not found."}, status=401)

            new_access = str(new_refresh.access_token)
            new_refresh_str = str(new_refresh)

            response_data = {
                "access": new_access,
                "refresh": new_refresh_str,
            }

            response = Response(response_data, status=200)
            set_jwt_cookies(response, new_access, new_refresh_str)

            return response

        except (InvalidToken, TokenError) as e:
            return Response(
                {"detail": str(e)},
                status=401,
            )
