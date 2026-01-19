# stdlib
from urllib.parse import ParseResult, parse_qs, urlencode, urlparse, urlunparse

# django
from django.conf import settings
from django.contrib.auth.models import update_last_login
from django.http import HttpResponseRedirect as DefaultHttpResponseRedirect
from django.shortcuts import redirect
from django.views import View

# local
from auth_manager.jwt_utils import create_tokens_for_user, set_jwt_cookies
from auth_manager.models.one_time_token import OneTimeToken
from auth_manager.models.user_session import UserSession
from auth_manager.views.shortcuts import login_error_page
from users_manager.permissions.caching import warmup_user_permissions


def add_token_to_url(url: str, token: str) -> str:
    parsed = urlparse(url)
    # A valid URL should have at least scheme and netloc
    if not (parsed.scheme and parsed.netloc):
        raise ValueError("Invalid URL")
    # Parse existing query parameters
    query = parse_qs(parsed.query)
    query["t"] = token
    # urlencode expects a list for each value
    new_query = urlencode(query, doseq=True)
    # Rebuild the URL with the new query string
    new_url = urlunparse(
        ParseResult(
            scheme=parsed.scheme,
            netloc=parsed.netloc,
            path=parsed.path,
            params=parsed.params,
            query=new_query,
            fragment=parsed.fragment,
        )
    )
    return new_url


class HttpResponseRedirect(DefaultHttpResponseRedirect):
    """
    An override to the `HttpResponseRedirect` class to append "powerview" as one of the allowed
    schemes.
    """

    allowed_schemes = DefaultHttpResponseRedirect.allowed_schemes + ["powerview"]


class LoginFinalizeView(View):
    user = None
    token = None

    def dispatch(self, request, *args, **kwargs):
        # Get token from URL parameter
        self.token = request.GET.get("t")
        if not self.token:
            return redirect("auth-manager:login")

        # Validate and consume the token (one-time use)
        is_valid, self.user = OneTimeToken.objects.validate_token(
            self.token,
            token_expiration_time=settings.SHORT_TOKEN_EXPIRATION,
            consume=True,  # Consume the token - this is the final step
        )
        if not is_valid or not self.user:
            return login_error_page(request, message="Invalid or expired authentication token.", status=401)

        return super().dispatch(request, *args, **kwargs)

    def get(self, request, *args, **kwargs):
        # Get auth method and redirect URI from session (set during login init)
        method = request.session.pop("auth_method", "c")
        redirect_to_uri = request.session.pop("redirect_uri", None)

        # For mobile (method="t"), pass a new token in redirect URL
        # Mobile app will exchange this token for JWT via API
        if method == "t" and redirect_to_uri:
            # Generate a new token for the mobile app to exchange
            new_token = OneTimeToken.objects.generate_token(self.user)
            redirect_to_uri = add_token_to_url(redirect_to_uri, new_token)
            return HttpResponseRedirect(redirect_to_uri)

        # Update last_login timestamp
        update_last_login(None, self.user)

        # Create session record for tracking (before JWT so we can include session_id)
        session = UserSession.objects.create_from_request(self.user, request)

        # Pre-calculate and cache permissions for faster first API request
        warmup_user_permissions(self.user)

        # For web (method="c"), generate JWT and set cookies
        access_token, refresh_token = create_tokens_for_user(self.user, session_id=session.id)
        response = HttpResponseRedirect(redirect_to_uri or "/")
        set_jwt_cookies(response, access_token, refresh_token)

        return response
