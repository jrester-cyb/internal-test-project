# django
from django.conf import settings

# thirdparty
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError


class JWTCookieAuthentication(BaseAuthentication):
    """
    Custom authentication class that supports JWT from:
    1. Authorization header (Bearer token) - for mobile/API clients
    2. HttpOnly cookie - for web clients

    This allows unified JWT auth across all client types.
    """

    def __init__(self):
        self.jwt_auth = JWTAuthentication()

    def authenticate(self, request):
        # First, try Authorization header (Bearer token)
        header = self.get_authorization_header(request)
        if header:
            return self.authenticate_header_token(request, header)

        # Fall back to cookie-based auth
        raw_token = request.COOKIES.get(settings.JWT_AUTH_COOKIE)
        if raw_token:
            return self.authenticate_cookie_token(request, raw_token)

        return None

    def get_authorization_header(self, request):
        """Extract token from Authorization header."""
        auth = request.META.get("HTTP_AUTHORIZATION", "")
        if not auth:
            return None

        parts = auth.split()
        if len(parts) != 2:
            return None

        auth_type, token = parts
        if auth_type.lower() not in [t.lower() for t in settings.SIMPLE_JWT.get("AUTH_HEADER_TYPES", ("Bearer",))]:
            return None

        return token

    def authenticate_header_token(self, request, raw_token):
        """Authenticate using token from Authorization header."""
        try:
            validated_token = self.jwt_auth.get_validated_token(raw_token)
            user = self.jwt_auth.get_user(validated_token)
            return (user, validated_token)
        except (InvalidToken, TokenError) as e:
            raise AuthenticationFailed(str(e))

    def authenticate_cookie_token(self, request, raw_token):
        """Authenticate using token from cookie."""
        try:
            validated_token = self.jwt_auth.get_validated_token(raw_token)
            user = self.jwt_auth.get_user(validated_token)
            return (user, validated_token)
        except (InvalidToken, TokenError):
            # Invalid cookie token - clear it and return None
            # The middleware will handle clearing the cookie on response
            return None

    def authenticate_header(self, request):
        """Return auth header type for WWW-Authenticate header."""
        return "Bearer"
