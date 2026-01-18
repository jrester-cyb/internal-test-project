# django
from django.conf import settings
from django.contrib import messages
from django.shortcuts import redirect
from django.urls import reverse
from django.utils import timezone
from django.views.generic import TemplateView

# local
from auth_manager.emails import MagicLinkRequestEmail
from auth_manager.models import OneTimeToken, MFADevice, TOTPDevice, SMSDevice
from auth_manager.views.shortcuts import login_error_page


class MFAEnrollView(TemplateView):
    template_name = "mfa_enrollment_templates/mfa_enroll.html"
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
            consume=False,
        )
        if not is_valid or not self.user:
            return login_error_page(
                request, message="Invalid or expired authentication token.", status=401
            )

        # If user already has enrolled devices, redirect to the mfa page with token
        # Use MFADevice.objects to respect soft delete filtering
        if MFADevice.objects.filter(user=self.user, confirmed_at__isnull=False).exists():
            mfa_url = f"{reverse('auth-manager:mfa')}?t={self.token}"
            return redirect(mfa_url)

        return super().dispatch(request, *args, **kwargs)

    def post(self, request, *args, **kwargs):
        """Handle MFA enrollment form submissions."""
        action = request.POST.get("action")

        if action == "enroll_totp":
            return self._handle_totp_enrollment(request)
        elif action == "initiate_sms":
            return self._handle_sms_initiate(request)
        elif action == "verify_sms":
            return self._handle_sms_verify(request)
        elif action == "send_magic_link":
            return self._handle_send_magic_link(request)
        elif action == "skip":
            return self._handle_skip(request)

        # Unknown action, just re-render
        return self.get(request, *args, **kwargs)

    def _handle_totp_enrollment(self, request):
        """Handle TOTP device enrollment."""
        seed = request.POST.get("seed", "")
        code = request.POST.get("code", "")

        if not seed or not code:
            messages.error(request, "Seed and verification code are required.")
            return redirect(f"{reverse('auth-manager:mfa-enroll')}?t={self.token}")

        # Create TOTP device with provided seed
        device = TOTPDevice(
            user=self.user,
            name="Authenticator App",
        )
        device.secret = seed
        device.save()

        # Verify the code
        if not device.verify_totp(code):
            device.delete()
            messages.error(request, "Invalid verification code. Please try again.")
            return redirect(f"{reverse('auth-manager:mfa-enroll')}?t={self.token}")

        # Confirm the device
        device.confirmed_at = timezone.now()
        device.save(update_fields=["confirmed_at"])

        # Redirect to finalize
        return redirect(f"{reverse('auth-manager:finalize')}?t={self.token}")

    def _handle_sms_initiate(self, request):
        """Handle SMS enrollment initiation - create device and send code."""
        phone_number = request.POST.get("phone_number", "")

        if not phone_number:
            messages.error(request, "Phone number is required.")
            return redirect(f"{reverse('auth-manager:mfa-enroll')}?t={self.token}")

        # Delete any existing unconfirmed SMS devices for this user
        SMSDevice.objects.filter(user=self.user, confirmed_at__isnull=True).delete()

        # Create SMS device
        device = SMSDevice.objects.create(
            user=self.user,
            name="SMS",
            phone_number=phone_number,
        )

        # Send the verification code
        try:
            device.send_code()
        except Exception as e:
            device.delete()
            messages.error(request, f"Failed to send verification code: {str(e)}")
            return redirect(f"{reverse('auth-manager:mfa-enroll')}?t={self.token}")

        # Store device ID in session for verification step
        request.session["sms_enroll_device_id"] = str(device.id)

        messages.success(request, "Verification code sent to your phone.")
        return redirect(f"{reverse('auth-manager:mfa-enroll')}?t={self.token}&sms_verify=1")

    def _handle_sms_verify(self, request):
        """Handle SMS code verification."""
        code = request.POST.get("code", "")
        device_id = request.session.get("sms_enroll_device_id")

        if not device_id:
            messages.error(request, "SMS enrollment session expired. Please start over.")
            return redirect(f"{reverse('auth-manager:mfa-enroll')}?t={self.token}")

        if not code:
            messages.error(request, "Verification code is required.")
            return redirect(f"{reverse('auth-manager:mfa-enroll')}?t={self.token}&sms_verify=1")

        try:
            device = SMSDevice.objects.get(
                id=device_id,
                user=self.user,
                confirmed_at__isnull=True,
            )
        except SMSDevice.DoesNotExist:
            messages.error(request, "Device not found. Please start over.")
            return redirect(f"{reverse('auth-manager:mfa-enroll')}?t={self.token}")

        # Verify the code
        if not device.verify_totp(code):
            messages.error(request, "Invalid verification code. Please try again.")
            return redirect(f"{reverse('auth-manager:mfa-enroll')}?t={self.token}&sms_verify=1")

        # Confirm the device
        device.confirmed_at = timezone.now()
        device.save(update_fields=["confirmed_at"])

        # Clear session
        del request.session["sms_enroll_device_id"]

        # Redirect to finalize
        return redirect(f"{reverse('auth-manager:finalize')}?t={self.token}")

    def _handle_send_magic_link(self, request):
        """Handle sending magic link email for MFA enrollment."""
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

        return redirect(f"{reverse('auth-manager:mfa-enroll')}?t={self.token}")

    def _handle_skip(self, request):
        """Handle MFA skip (only if allowed)."""
        if getattr(self.user, "mfa_required", True):
            messages.error(request, "MFA is required for this account.")
            return redirect(f"{reverse('auth-manager:mfa-enroll')}?t={self.token}")

        # Redirect to finalize without enrolling
        return redirect(f"{reverse('auth-manager:finalize')}?t={self.token}")

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)

        # Check if we're in SMS verification mode
        sms_verify_mode = self.request.GET.get("sms_verify") == "1"
        sms_device_id = self.request.session.get("sms_enroll_device_id")

        # Generate a seed for TOTP enrollment (device will be created on enrollment)
        totp_seed = MFADevice.generate_secret()

        # Build provisioning URI for QR code (without saving device yet)
        issuer = getattr(settings, "MFA_ISSUER", "MyApp")
        account_name = self.user.email or self.user.username
        provisioning_uri = (
            f"otpauth://totp/{issuer}:{account_name}"
            f"?secret={totp_seed}"
            f"&issuer={issuer}"
            f"&algorithm=SHA1"
            f"&digits=6"
            f"&period=30"
        )

        # Build list of available device types for enrollment
        available_device_types = [
            {
                "type": "app",
                "name": "Authenticator App",
                "description": "Use an authenticator app like Google Authenticator or Authy",
                "seed": totp_seed,
                "provisioning_uri": provisioning_uri,
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

        context["available_device_types"] = available_device_types
        context["mfa_required"] = getattr(self.user, "mfa_required", True)
        context["email"] = self.user.email
        context["phone_number"] = getattr(self.user, "phone_number", "")
        context["auth_token"] = self.token
        context["sms_verify_mode"] = sms_verify_mode
        context["sms_device_id"] = sms_device_id
        return context
