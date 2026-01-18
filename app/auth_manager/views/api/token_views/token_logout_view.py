# django
from django.conf import settings

# local
from auth_manager.jwt_utils import blacklist_refresh_token, clear_jwt_cookies

# thirdparty
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView


class TokenLogoutView(APIView):
    """
    Logout by blacklisting the refresh token and clearing cookies.

    The refresh token can be provided either:
    1. In the request body as {"refresh": "<token>"}
    2. In the refresh_token cookie (for web clients)

    This endpoint always succeeds to prevent information leakage about
    whether a token was valid.
    """

    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs) -> Response:
        # Try to get refresh token from body first, then from cookie
        refresh_token = request.data.get("refresh")
        if not refresh_token:
            refresh_token = request.COOKIES.get(settings.JWT_AUTH_REFRESH_COOKIE)

        # Blacklist the token if provided
        if refresh_token:
            blacklist_refresh_token(refresh_token)

        response = Response({"detail": "Successfully logged out."}, status=200)

        # Clear JWT cookies
        clear_jwt_cookies(response)

        return response
