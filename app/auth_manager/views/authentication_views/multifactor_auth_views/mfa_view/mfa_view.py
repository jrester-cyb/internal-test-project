# django
from django.conf import settings
from django.shortcuts import redirect
from django.urls import reverse
from django.views.generic import TemplateView

# local
from auth_manager.models import OneTimeToken
from auth_manager.views.shortcuts import login_error_page


class MFAView(TemplateView):
    template_name = "mfa_templates/mfa.html"
    user = None
    token = None

    def dispatch(self, request, *args, **kwargs):
        # Get token from URL parameter
        self.token = request.GET.get("t")
        if not self.token:
            return redirect("auth-manager:login")

        # Validate token to get user (don't consume - we need it for the whole flow)
        is_valid, self.user = OneTimeToken.objects.validate_token(
            self.token,
            token_expiration_time=settings.SHORT_TOKEN_EXPIRATION,
            consume=False,  # Don't consume the token yet
        )
        if not is_valid or not self.user:
            return login_error_page(
                request, message="Invalid or expired authentication token.", status=401
            )

        return super().dispatch(request, *args, **kwargs)

    def get(self, request, *args, **kwargs):
        devices = self.user.user_multifactor_auth_devices.exclude(verified=False)
        if not devices.exists():
            # Redirect to enrollment with token
            enroll_url = f"{reverse('auth-manager:mfa-enroll')}?t={self.token}"
            return redirect(enroll_url)
        return super().get(request, *args, **kwargs)

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        devices = self.user.user_multifactor_auth_devices.exclude(verified=False)
        device_list = []

        # Base URL for MFA device API endpoints
        base_url = f"/api/auth/users/{self.user.id}/mfa-devices"

        for device in devices:
            device_dict = {
                "name": device.device_type,
                "value": device.device_type,
                "id": device.id,
                "request_notification_endpoint": f"{base_url}/{device.id}/request-notification/",
                "verify_endpoint": f"{base_url}/{device.id}/verify/",
            }
            if device.device_type.lower() == "email":
                device_dict["email"] = device.user.email
            elif device.device_type.lower() == "sms":
                device_dict["phone_number"] = device.phone_number

            device_list.append(device_dict)

        # Build finalize URL with token (will be updated after MFA verification)
        finalize_url = f"{reverse('auth-manager:finalize')}?t={self.token}"
        context["mfa_finalize_endpoint"] = finalize_url
        context["devices"] = device_list
        context["email"] = self.user.email
        context["auth_token"] = self.token  # Pass token to template for API calls
        return context
