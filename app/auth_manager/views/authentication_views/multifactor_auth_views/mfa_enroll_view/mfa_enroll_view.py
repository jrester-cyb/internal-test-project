# django
from django.contrib.auth.mixins import LoginRequiredMixin
from django.shortcuts import redirect
from django.views.generic import TemplateView

# local
from mainapp.utils import reverse
from multifactor_auth.constants import MULTIFACTOR_SESSION_KEY
from multifactor_auth.models import Device


class MFAEnrollView(LoginRequiredMixin, TemplateView):
    template_name = "mfa_enrollment_templates/mfa_enroll.html"

    def dispatch(self, request, *args, **kwargs):
        # If the user is not authenticated, redirect to login
        if not request.user.is_authenticated:
            return redirect("auth-manager:login")
        # If the user is already mfa verified, redirect to the original request URI
        if request.session.get(MULTIFACTOR_SESSION_KEY, False):
            return redirect("auth-manager:finalize")

        # If user already has enrolled devices, redirect to the mfa page
        if request.user.user_multifactor_auth_devices.exclude(verified=False).exists():
            return redirect("auth-manager:mfa")

        return super().dispatch(request, *args, **kwargs)

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        user = self.request.user

        # Iterate over the devices of the user
        available_devices = Device.objects.filter(user=self.request.user, verified=False)

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
                    args=(self.request.user.global_id, device.global_id),
                    request=self.request,
                ),
                "verify_endpoint": reverse(
                    "multifactor-auth-devices-enroll_device",
                    args=(self.request.user.global_id, device.global_id),
                    request=self.request,
                ),
                "update_endpoint": reverse(
                    "multifactor-auth-devices-detail",
                    args=(self.request.user.global_id, device.global_id),
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

        context["available_device_types"] = device_list
        context["mfa_required"] = getattr(self.request.user, "mfa_required", True)
        context["mfa_finalize_endpoint"] = reverse("auth-manager:finalize", request=self.request)
        context["email"] = user.email
        context["skip_device_code_endpoint"] = reverse(
            "multifactor-auth-devices-skip-device-code", args=(self.request.user.global_id,), request=self.request
        )
        return context
