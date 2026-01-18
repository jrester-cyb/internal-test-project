# django
from django.conf import settings
from django.shortcuts import redirect
from django.urls import reverse
from django.views.generic import TemplateView

# local
from auth_manager.models import OneTimeToken
from auth_manager.views.shortcuts import login_error_page


# Available MFA device types for enrollment
AVAILABLE_DEVICE_TYPES = [
    {
        "type": "app",
        "name": "Authenticator App",
        "description": "Use an authenticator app like Google Authenticator or Authy",
    },
    {
        "type": "sms",
        "name": "SMS",
        "description": "Receive codes via text message",
    },
    {
        "type": "email",
        "name": "Email",
        "description": "Receive a magic link via email",
    },
]


class MFAEnrollView(TemplateView):
    template_name = "mfa_enrollment_templates/mfa_enroll.html"
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
            consume=False,
        )
        if not is_valid or not self.user:
            return login_error_page(
                request, message="Invalid or expired authentication token.", status=401
            )

        # If user already has enrolled devices, redirect to the mfa page with token
        if self.user.mfa_devices.filter(confirmed_at__isnull=False).exists():
            mfa_url = f"{reverse('auth-manager:mfa')}?t={self.token}"
            return redirect(mfa_url)

        return super().dispatch(request, *args, **kwargs)

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)

        # Base URL for MFA device API endpoints
        base_url = f"/api/auth/users/{self.user.id}/mfa-devices"

        # Build list of available device types for enrollment
        device_type_list = []
        for device_type in AVAILABLE_DEVICE_TYPES:
            device_dict = {
                "type": device_type["type"],
                "name": device_type["name"],
                "description": device_type["description"],
                "create_endpoint": f"{base_url}/",
            }
            device_type_list.append(device_dict)

        # Build finalize URL with token (will be updated after MFA verification)
        finalize_url = f"{reverse('auth-manager:finalize')}?t={self.token}"

        context["available_device_types"] = device_type_list
        context["mfa_required"] = getattr(self.user, "mfa_required", True)
        context["mfa_finalize_endpoint"] = finalize_url
        context["email"] = self.user.email
        context["phone_number"] = getattr(self.user, "phone_number", "")
        context["skip_device_code_endpoint"] = f"{base_url}/skip/"
        context["auth_token"] = self.token  # Pass token to template for API calls
        return context
