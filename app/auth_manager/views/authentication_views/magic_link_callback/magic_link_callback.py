# stdlib
import logging

# django
from django.conf import settings
from django.contrib.auth.models import update_last_login
from django.http import HttpRequest, HttpResponse
from django.shortcuts import redirect, render
from django.views.generic import TemplateView

# local
from auth_manager.jwt_utils import create_tokens_for_user, set_jwt_cookies
from auth_manager.models.one_time_token import OneTimeToken
from auth_manager.models.user_session import UserSession
from users_manager.permissions.caching import warmup_user_permissions

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

        # Update last_login timestamp
        update_last_login(None, user)

        # Create session record for tracking
        session = UserSession.objects.create_from_request(user, request)

        # Pre-calculate and cache permissions for faster first API request
        warmup_user_permissions(user)

        # Generate JWT and set cookies
        access_token, refresh_token = create_tokens_for_user(user, session_id=session.id)
        response = redirect("/")
        set_jwt_cookies(response, access_token, refresh_token)

        return response
