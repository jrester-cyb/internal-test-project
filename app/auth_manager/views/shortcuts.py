# django
from django.conf import settings
from django.shortcuts import render

# thirdparty
from humanfriendly import format_timespan


def login_error_page(request, message=None, status=400, context=None):
    """
    Renders a generic login error page with a custom message.
    """
    _context = {"error_message": message or "An unknown error occurred."}
    if context:
        _context.update(context)
    return render(request, "idp_provider_templates/login_error.html", _context, status=status)


def identity_provider_disabled_page(request, status=200, context=None):
    """
    Renders a generic identity provider disabled page with a custom message.
    """
    _context = {"expiration_time": format_timespan(settings.MAGIC_LINK_TOKEN_EXPIRATION_TIME), **(context or {})}

    return render(request, "idp_provider_templates/idp_disabled.html", _context, status=status)
