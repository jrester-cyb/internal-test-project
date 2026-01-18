# stdlib
from urllib.parse import ParseResult, parse_qs, urlencode, urlparse, urlunparse

# django
from django.http import HttpResponseRedirect as DefaultHttpResponseRedirect
from django.shortcuts import redirect
from django.views import View

# local
from auth_manager.models.one_time_token import OneTimeToken
from multifactor_auth.constants import MULTIFACTOR_SESSION_KEY


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

    def dispatch(self, request, *args, **kwargs):
        # If the user is authenticated, proceed to the next step
        if not request.user.is_authenticated:
            return redirect("auth-manager:login")
        elif not request.session.get(MULTIFACTOR_SESSION_KEY, False):
            return redirect("auth-manager:mfa")
        return super().dispatch(request, *args, **kwargs)

    def get(self, request, *args, **kwargs):
        method = request.session.pop("auth_method", "c")
        redirect_to_uri = request.session.pop("redirect_uri", None)
        # If the method is "t" that means that we are going to be
        # Generating a short-lived token and updating the "redirect-uri" to include that token
        # As a queryparam. This is to allow that
        if method == "t" and redirect_to_uri:
            redirect_to_uri = add_token_to_url(redirect_to_uri, OneTimeToken.objects.generate_token(request.user))

        return HttpResponseRedirect(redirect_to_uri or "/")
