# django
from django.conf import settings
from django.shortcuts import redirect
from django.urls import reverse
from django.views.generic import TemplateView

# local
from auth_manager.models import MFADevice, OneTimeToken
from auth_manager.views.shortcuts import login_error_page


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
            return login_error_page(request, message="Invalid or expired authentication token.", status=401)

        # If user already has enrolled devices, redirect to the mfa page with token
        if self.user.user_multifactor_auth_devices.exclude(verified=False).exists():
            mfa_url = f"{reverse('auth-manager:mfa')}?t={self.token}"
            return redirect(mfa_url)

        return super().dispatch(request, *args, **kwargs)

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)

        # Iterate over the devices of the user
        available_devices = MFADevice.objects.filter(user=self.user, verified=False)

        # Sort so TOTP (Authenticator App) is always first
        available_devices = sorted(available_devices, key=lambda d: 0 if d.device_type.upper() == "TOTP" else 1)

        # Attach device-specific endpoints to each device
        device_list = []
        for device in available_devices:
            device_dict = {
                "name": device.device_type,
                "value": device.device_type,
                "global_id": device.global_id,
                "request_notification_endpoint": reverse(
                    "multifactor-auth-devices-request-device-notification",
                    args=(self.user.global_id, device.global_id),
                    request=self.request,
                ),
                "verify_endpoint": reverse(
                    "multifactor-auth-devices-enroll_device",
                    args=(self.user.global_id, device.global_id),
                    request=self.request,
                ),
                "update_endpoint": reverse(
                    "multifactor-auth-devices-detail",
                    args=(self.user.global_id, device.global_id),
                    request=self.request,
                ),
            }
            if device.device_type == "TOTP":
                # thirdparty
                from pyotp import TOTP

                user_email = getattr(device.user, "email", "user")
                issuer = "Power-View"
                totp = TOTP(device.seed)
                provisioning_uri = totp.provisioning_uri(name=user_email, issuer_name=issuer)
                device_dict["provisioning_uri"] = provisioning_uri
                device_dict["seed"] = device.seed

            device_list.append(device_dict)

        # Build finalize URL with token
        finalize_url = f"{reverse('auth-manager:finalize')}?t={self.token}"

        context["available_device_types"] = device_list
        context["mfa_required"] = getattr(self.user, "mfa_required", True)
        context["mfa_finalize_endpoint"] = finalize_url
        context["email"] = self.user.email
        context["skip_device_code_endpoint"] = reverse(
            "multifactor-auth-devices-skip-device-code", args=(self.user.global_id,), request=self.request
        )
        context["auth_token"] = self.token  # Pass token to template for hidden field
        return context
