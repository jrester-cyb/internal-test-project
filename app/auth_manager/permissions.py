# thirdparty
from rest_framework.permissions import BasePermission


class IsMultiFactorAuthenticated(BasePermission):
    """
    Permission class that requires the user to have completed MFA verification.

    With JWT authentication, having a valid JWT means the user completed the
    full authentication flow (including MFA). This is because JWTs are only
    issued after successful MFA verification in the login finalize step.

    For session-based authentication (e.g., Django admin), this will always
    return False since we no longer track MFA status in sessions for API access.
    """

    message = "Multi-factor authentication is required."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        # Check if the request was authenticated via JWT
        # If JWT auth succeeded, it means MFA was completed (JWT only issued after MFA)
        if hasattr(request, "auth") and request.auth is not None:
            # request.auth contains the validated JWT token when using JWTAuthentication
            # Its presence indicates successful JWT authentication
            return True

        # For non-JWT authentication (session-based), deny access
        # Session auth is only used during the login/MFA flow, not for API access
        return False
