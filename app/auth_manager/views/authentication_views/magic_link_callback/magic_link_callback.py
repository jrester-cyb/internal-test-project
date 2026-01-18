# stdlib
import logging

# django
from django.conf import settings
from django.contrib.auth import login
from django.http import HttpRequest, HttpResponse
from django.shortcuts import redirect, render
from django.views.generic import TemplateView

# local
from auth_manager.models.one_time_token import OneTimeToken
from multifactor_auth.constants import MULTIFACTOR_SESSION_KEY

logger = logging.getLogger(__name__)


class MagicLinkCallbackView(TemplateView):
    template_name = "magic_link_callback.html"

    def get(self, request: HttpRequest, *args, **kwargs) -> HttpResponse:
        token = kwargs.get("uidb64", "")
        is_valid, user = OneTimeToken.objects.validate_token(
            token, token_expiration_time=settings.MAGIC_LINK_TOKEN_EXPIRATION_TIME
        )
        if not is_valid:
            return render(request, self.template_name, {"message": "Invalid or missing token provided."}, status=400)

        # Log the user in
        login(request, user)
        if user.identity_providers.exists():
            request.session[MULTIFACTOR_SESSION_KEY] = True
            request.session.save()

        # Redirect to the top page
        return redirect("/")
