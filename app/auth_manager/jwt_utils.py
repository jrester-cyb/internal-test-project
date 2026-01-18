# django
from django.conf import settings

# thirdparty
from rest_framework_simplejwt.tokens import RefreshToken


def create_tokens_for_user(user):
    """
    Generate JWT access and refresh tokens for a user.

    Returns:
        tuple: (access_token, refresh_token) as strings
    """
    refresh = RefreshToken.for_user(user)
    return str(refresh.access_token), str(refresh)


def set_jwt_cookies(response, access_token, refresh_token):
    """
    Set JWT access and refresh tokens as HttpOnly cookies on the response.

    Args:
        response: Django/DRF response object
        access_token: JWT access token string
        refresh_token: JWT refresh token string

    Returns:
        The response object with cookies set
    """
    response.set_cookie(
        key=settings.JWT_AUTH_COOKIE,
        value=access_token,
        httponly=settings.JWT_AUTH_HTTPONLY,
        secure=settings.JWT_AUTH_SECURE,
        samesite=settings.JWT_AUTH_SAMESITE,
        path="/",
        max_age=int(settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds()),
    )
    response.set_cookie(
        key=settings.JWT_AUTH_REFRESH_COOKIE,
        value=refresh_token,
        httponly=settings.JWT_AUTH_HTTPONLY,
        secure=settings.JWT_AUTH_SECURE,
        samesite=settings.JWT_AUTH_SAMESITE,
        path="/",
        max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
    )
    return response


def clear_jwt_cookies(response):
    """
    Clear JWT cookies from the response.

    Args:
        response: Django/DRF response object

    Returns:
        The response object with cookies cleared
    """
    response.delete_cookie(
        key=settings.JWT_AUTH_COOKIE,
        path="/",
        samesite=settings.JWT_AUTH_SAMESITE,
    )
    response.delete_cookie(
        key=settings.JWT_AUTH_REFRESH_COOKIE,
        path="/",
        samesite=settings.JWT_AUTH_SAMESITE,
    )
    return response


def blacklist_refresh_token(refresh_token):
    """
    Blacklist a refresh token to invalidate it.

    Args:
        refresh_token: JWT refresh token string

    Returns:
        bool: True if blacklisted successfully, False otherwise
    """
    try:
        token = RefreshToken(refresh_token)
        token.blacklist()
        return True
    except Exception:
        return False
