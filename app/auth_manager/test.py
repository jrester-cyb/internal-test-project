# django
from django.conf import settings
from django.test import Client as DjangoClient

# local
from auth_manager.jwt_utils import create_tokens_for_user


class Client(DjangoClient):
    """
    Test client that simulates a fully authenticated user with JWT.

    For API testing, use force_authenticate() to set JWT auth.
    For browser-based testing, use force_login() which sets JWT cookies.
    """

    _jwt_access_token = None
    _jwt_refresh_token = None

    def force_login(self, user, backend=None):
        """
        Force login with JWT authentication.

        Sets JWT cookies on the client, simulating a fully authenticated
        user who has completed MFA (since JWT is only issued after MFA).
        """
        super().force_login(user, backend)

        # Generate JWT tokens for the user
        access_token, refresh_token = create_tokens_for_user(user)
        self._jwt_access_token = access_token
        self._jwt_refresh_token = refresh_token

        # Set cookies on the client
        self.cookies[settings.JWT_AUTH_COOKIE] = access_token
        self.cookies[settings.JWT_AUTH_REFRESH_COOKIE] = refresh_token

    def force_authenticate(self, user):
        """
        Force JWT authentication for API requests.

        Sets the Authorization header with a Bearer token for the given user.
        This is the preferred method for API testing.
        """
        access_token, refresh_token = create_tokens_for_user(user)
        self._jwt_access_token = access_token
        self._jwt_refresh_token = refresh_token
        self.defaults["HTTP_AUTHORIZATION"] = f"Bearer {access_token}"

    def logout(self):
        """Clear JWT authentication."""
        self._jwt_access_token = None
        self._jwt_refresh_token = None
        self.cookies.pop(settings.JWT_AUTH_COOKIE, None)
        self.cookies.pop(settings.JWT_AUTH_REFRESH_COOKIE, None)
        self.defaults.pop("HTTP_AUTHORIZATION", None)
        super().logout()


class APIClient(Client):
    """
    API test client that uses JWT Bearer token authentication by default.

    This is a convenience wrapper around Client that automatically uses
    force_authenticate() instead of force_login().
    """

    def force_login(self, user, backend=None):
        """Use JWT Bearer token authentication for API testing."""
        self.force_authenticate(user)
