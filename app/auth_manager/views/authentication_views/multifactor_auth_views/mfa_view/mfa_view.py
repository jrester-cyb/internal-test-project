# django
from django.conf import settings
from django.contrib import messages
from django.shortcuts import redirect
from django.urls import reverse
from django.views.generic import TemplateView

# local
from auth_manager.emails import MagicLinkRequestEmail
from auth_manager.models import MFADevice, OneTimeToken
from auth_manager.views.shortcuts import login_error_page


class MFAView(TemplateView):
    template_name = "mfa_templates/mfa.html"
    user = None
    token = None

    def dispatch(self, request, *args, **kwargs):
        # Get token from URL parameter or POST data
        self.token = request.GET.get("t") or request.POST.get("t")
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
        devices = self.user.mfa_devices.filter(confirmed_at__isnull=False)
        if not devices.exists():
            # Redirect to enrollment with token
            enroll_url = f"{reverse('auth-manager:mfa-enroll')}?t={self.token}"
            return redirect(enroll_url)
        return super().get(request, *args, **kwargs)

    def post(self, request, *args, **kwargs):
        """Handle MFA verification form submissions."""
        action = request.POST.get("action")

        if action == "verify_totp":
            return self._handle_totp_verify(request)
        elif action == "request_sms":
            return self._handle_sms_request(request)
        elif action == "verify_sms":
            return self._handle_sms_verify(request)
        elif action == "send_magic_link":
            return self._handle_send_magic_link(request)

        # Unknown action, just re-render
        return self.get(request, *args, **kwargs)

    def _handle_totp_verify(self, request):
        """Handle TOTP code verification."""
        device_id = request.POST.get("device_id", "")
        code = request.POST.get("code", "")

        if not device_id or not code:
            messages.error(request, "Device and verification code are required.")
            return redirect(f"{reverse('auth-manager:mfa')}?t={self.token}")

        try:
            device = MFADevice.objects.get(
                id=device_id,
                user=self.user,
                confirmed_at__isnull=False,
            )
        except MFADevice.DoesNotExist:
            messages.error(request, "Device not found.")
            return redirect(f"{reverse('auth-manager:mfa')}?t={self.token}")

        # Verify the code
        if not device.authenticate(code):
            messages.error(request, "Invalid verification code. Please try again.")
            return redirect(f"{reverse('auth-manager:mfa')}?t={self.token}")

        # Redirect to finalize
        return redirect(f"{reverse('auth-manager:finalize')}?t={self.token}")

    def _handle_sms_request(self, request):
        """Handle SMS code request."""
        device_id = request.POST.get("device_id", "")

        if not device_id:
            messages.error(request, "Device is required.")
            return redirect(f"{reverse('auth-manager:mfa')}?t={self.token}")

        try:
            device = MFADevice.objects.get(
                id=device_id,
                user=self.user,
                confirmed_at__isnull=False,
            )
        except MFADevice.DoesNotExist:
            messages.error(request, "Device not found.")
            return redirect(f"{reverse('auth-manager:mfa')}?t={self.token}")

        # Send the code
        try:
            device.send_code()
        except Exception as e:
            messages.error(request, f"Failed to send verification code: {str(e)}")
            return redirect(f"{reverse('auth-manager:mfa')}?t={self.token}")

        # Store device ID in session for verification step
        request.session["sms_verify_device_id"] = str(device.id)

        messages.success(request, "Verification code sent to your phone.")
        return redirect(f"{reverse('auth-manager:mfa')}?t={self.token}&sms_verify=1")

    def _handle_sms_verify(self, request):
        """Handle SMS code verification."""
        code = request.POST.get("code", "")
        device_id = request.session.get("sms_verify_device_id")

        if not device_id:
            messages.error(request, "SMS verification session expired. Please request a new code.")
            return redirect(f"{reverse('auth-manager:mfa')}?t={self.token}")

        if not code:
            messages.error(request, "Verification code is required.")
            return redirect(f"{reverse('auth-manager:mfa')}?t={self.token}&sms_verify=1")

        try:
            device = MFADevice.objects.get(
                id=device_id,
                user=self.user,
                confirmed_at__isnull=False,
            )
        except MFADevice.DoesNotExist:
            messages.error(request, "Device not found.")
            return redirect(f"{reverse('auth-manager:mfa')}?t={self.token}")

        # Verify the code
        if not device.authenticate(code):
            messages.error(request, "Invalid verification code. Please try again.")
            return redirect(f"{reverse('auth-manager:mfa')}?t={self.token}&sms_verify=1")

        # Clear session
        del request.session["sms_verify_device_id"]

        # Redirect to finalize
        return redirect(f"{reverse('auth-manager:finalize')}?t={self.token}")

    def _handle_send_magic_link(self, request):
        """Handle sending magic link email for MFA."""
        # Generate a new token for the magic link
        new_token = OneTimeToken.objects.generate_token(user=self.user)

        # Send the magic link email
        try:
            MagicLinkRequestEmail(
                user_first_name=self.user.first_name,
                user_email=self.user.email,
                login_url=request.build_absolute_uri(
                    reverse("auth-manager:magic-link-callback", args=(new_token,))
                ),
            ).send()
            messages.success(request, "Magic link sent! Check your email inbox.")
        except Exception as e:
            messages.error(request, f"Failed to send magic link: {str(e)}")

        return redirect(f"{reverse('auth-manager:mfa')}?t={self.token}")

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        devices = self.user.mfa_devices.filter(confirmed_at__isnull=False)

        # Check if we're in SMS verification mode
        sms_verify_mode = self.request.GET.get("sms_verify") == "1"
        sms_device_id = self.request.session.get("sms_verify_device_id")

        device_list = []
        for device in devices:
            device_dict = {
                "name": device.delivery_method_display,
                "value": device.delivery_method,
                "id": str(device.id),
            }
            if device.delivery_method == "sms":
                device_dict["phone_number"] = device.get_masked_destination()

            device_list.append(device_dict)

        # Add email as a magic link option (always available)
        device_list.append({
            "name": "Email",
            "value": "email",
            "id": None,
        })

        context["devices"] = device_list
        context["email"] = self.user.email
        context["auth_token"] = self.token
        context["sms_verify_mode"] = sms_verify_mode
        context["sms_device_id"] = sms_device_id
        return context
