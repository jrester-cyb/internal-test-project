# django
from django.conf import settings
from django.contrib.auth import logout
from django.shortcuts import redirect
from django.views import View

# local
from auth_manager.jwt_utils import blacklist_refresh_token, clear_jwt_cookies


class LogoutView(View):
    def dispatch(self, request, *args, **kwargs):
        # Blacklist refresh token if present in cookie
        refresh_token = request.COOKIES.get(settings.JWT_AUTH_REFRESH_COOKIE)
        if refresh_token:
            blacklist_refresh_token(refresh_token)

        # Clear Django session (for admin and any residual session data)
        logout(request)

        # Create redirect response and clear JWT cookies
        response = redirect("auth-manager:login")
        clear_jwt_cookies(response)

        return response
