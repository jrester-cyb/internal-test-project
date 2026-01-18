# django
from django.shortcuts import redirect
from django.views.generic import TemplateView

# local
from mainapp.utils import reverse
from multifactor_auth.constants import MULTIFACTOR_SESSION_KEY


class MFAView(TemplateView):
    template_name = "mfa_templates/mfa.html"

    def dispatch(self, request, *args, **kwargs):
        if not request.user.is_authenticated:
            return redirect("auth-manager:login")

        # If the user is already mfa verified, redirect to the original request URI
        if request.session.get(MULTIFACTOR_SESSION_KEY, False):
            return redirect("auth-manager:finalize")

        return super().dispatch(request, *args, **kwargs)

    def get(self, request, *args, **kwargs):
        user = request.user
        devices = user.user_multifactor_auth_devices.exclude(verified=False)
        if not devices.exists():
            return redirect("auth-manager:mfa-enroll")
        return super().get(request, *args, **kwargs)

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        user = self.request.user
        devices = user.user_multifactor_auth_devices.exclude(verified=False)
        device_list = []
        for device in devices:
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
                    "multifactor-auth-devices-verify-device-code",
                    args=(self.request.user.global_id, device.global_id),
                    request=self.request,
                ),
            }
            if device.device_type.lower() == "email":
                device_dict["email"] = device.user.email
            elif device.device_type.lower() == "sms":
                device_dict["phone_number"] = device.phone_number

            device_list.append(device_dict)
        context["mfa_finalize_endpoint"] = reverse("auth-manager:finalize", request=self.request)
        context["devices"] = device_list
        context["email"] = user.email
        return context
