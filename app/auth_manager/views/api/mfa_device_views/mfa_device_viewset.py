# django
from django.conf import settings
from django.urls import reverse
from django.utils import timezone

# local
from auth_manager.models import MFADevice, OneTimeToken, TOTPDevice, SMSDevice

# thirdparty
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet


class MFADeviceViewSet(GenericViewSet):
    """
    ViewSet for MFA device operations during the authentication flow.

    All endpoints require a valid auth token (passed in request body or header)
    to identify the user. This enables sessionless authentication.
    """

    permission_classes = [AllowAny]
    lookup_field = "id"

    def get_user_from_token(self, request):
        """
        Validate auth token and return the associated user.
        Does not consume the token.
        """
        token = request.data.get("auth_token") or request.headers.get("X-Auth-Token")
        if not token:
            return None, None

        is_valid, user = OneTimeToken.objects.validate_token(
            token,
            token_expiration_time=settings.SHORT_TOKEN_EXPIRATION,
            consume=False,
        )
        if not is_valid:
            return None, None

        return user, token

    def get_queryset(self):
        """Return empty queryset - we use token-based user lookup."""
        return MFADevice.objects.none()

    @action(detail=True, methods=["post"], url_path="request-notification")
    def request_device_notification(self, request, user_id=None, id=None):
        """
        Request a notification (SMS/Email code) for MFA verification.
        """
        user, token = self.get_user_from_token(request)
        if not user:
            return Response(
                {"detail": "Invalid or expired authentication token."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        try:
            device = MFADevice.objects.get(
                id=id,
                user=user,
            )
        except MFADevice.DoesNotExist:
            return Response(
                {"detail": "Device not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Send notification based on device type
        try:
            device.send_notification()
        except Exception as e:
            return Response(
                {"detail": f"Failed to send notification: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response({"detail": "Notification sent."}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="verify")
    def verify_device_code(self, request, user_id=None, id=None):
        """
        Verify MFA code for a device.

        On successful verification, returns the finalize URL with the same token.
        The token is consumed at the finalize step.
        """
        user, token = self.get_user_from_token(request)
        if not user:
            return Response(
                {"detail": "Invalid or expired authentication token."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        code = request.data.get("code", "")
        if not code:
            return Response(
                {"detail": "Verification code is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            device = MFADevice.objects.get(
                id=id,
                user=user,
                confirmed_at__isnull=False,  # Only confirmed devices can be used for auth
            )
        except MFADevice.DoesNotExist:
            return Response(
                {"detail": "Device not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Verify the code
        if not device.authenticate(code):
            return Response(
                {"detail": "Invalid verification code."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Build finalize URL with same token (consumed at finalize)
        finalize_url = f"{reverse('auth-manager:finalize')}?t={token}"

        return Response(
            {
                "detail": "Verification successful.",
                "finalize_url": finalize_url,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["post"], url_path="enroll")
    def enroll_device(self, request, user_id=None):
        """
        Enroll a new MFA device.

        Creates the device and confirms it in one step.

        Required fields:
        - type: Device type ('totp' or 'sms')
        - token: The verification code from the authenticator app

        For TOTP devices:
        - seed: The secret key used to generate the code

        For SMS devices:
        - phone_number: The phone number for SMS delivery

        On successful enrollment, returns the finalize URL with the same token.
        The token is consumed at the finalize step.
        """
        user, auth_token = self.get_user_from_token(request)
        if not user:
            return Response(
                {"detail": "Invalid or expired authentication token."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        device_type = request.data.get("type")
        code = request.data.get("token") or request.data.get("code", "")
        seed = request.data.get("seed")

        if not device_type:
            return Response(
                {"detail": "Device type is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not code:
            return Response(
                {"detail": "Verification code is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Create the device based on type
        if device_type == "totp":
            if not seed:
                return Response(
                    {"detail": "Seed is required for TOTP devices."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Create TOTP device with provided seed
            device = TOTPDevice(
                user=user,
                name="Authenticator App",
            )
            device.secret = seed
            device.save()

        elif device_type == "sms":
            phone_number = request.data.get("phone_number", "")
            if not phone_number:
                return Response(
                    {"detail": "Phone number is required for SMS devices."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Create SMS device with phone number
            device = SMSDevice.objects.create(
                user=user,
                name="SMS",
                phone_number=phone_number,
            )

        else:
            return Response(
                {"detail": f"Invalid device type: {device_type}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Verify the code against the device
        if not device.verify_totp(code):
            # Delete the device if verification fails
            device.delete()
            return Response(
                {"detail": "Invalid verification code."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Confirm the device
        device.confirmed_at = timezone.now()
        device.save(update_fields=["confirmed_at"])

        # Build finalize URL with same token (consumed at finalize)
        finalize_url = f"{reverse('auth-manager:finalize')}?t={auth_token}"

        return Response(
            {
                "detail": "Device enrolled successfully.",
                "finalize_url": finalize_url,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["post"], url_path="initiate-sms-enrollment")
    def initiate_sms_enrollment(self, request, user_id=None):
        """
        Initiate SMS device enrollment.

        Creates an unconfirmed SMS device and sends a verification code to the phone.

        Required fields:
        - phone_number: The phone number for SMS delivery

        Returns the device ID for use in the verify-sms-enrollment endpoint.
        """
        user, auth_token = self.get_user_from_token(request)
        if not user:
            return Response(
                {"detail": "Invalid or expired authentication token."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        phone_number = request.data.get("phone_number", "")
        if not phone_number:
            return Response(
                {"detail": "Phone number is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Delete any existing unconfirmed SMS devices for this user
        SMSDevice.objects.filter(user=user, confirmed_at__isnull=True).delete()

        # Create SMS device with phone number
        device = SMSDevice.objects.create(
            user=user,
            name="SMS",
            phone_number=phone_number,
        )

        # Send the verification code
        try:
            device.send_code()
        except Exception as e:
            device.delete()
            return Response(
                {"detail": f"Failed to send verification code: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response(
            {
                "detail": "Verification code sent.",
                "device_id": str(device.id),
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["post"], url_path="verify-sms-enrollment")
    def verify_sms_enrollment(self, request, user_id=None):
        """
        Verify and complete SMS device enrollment.

        Required fields:
        - device_id: The ID of the SMS device from initiate-sms-enrollment
        - code: The verification code sent to the phone

        On success, confirms the device and returns the finalize URL.
        """
        user, auth_token = self.get_user_from_token(request)
        if not user:
            return Response(
                {"detail": "Invalid or expired authentication token."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        device_id = request.data.get("device_id", "")
        code = request.data.get("code") or request.data.get("token", "")

        if not device_id:
            return Response(
                {"detail": "Device ID is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not code:
            return Response(
                {"detail": "Verification code is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            device = SMSDevice.objects.get(
                id=device_id,
                user=user,
                confirmed_at__isnull=True,
            )
        except SMSDevice.DoesNotExist:
            return Response(
                {"detail": "Device not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Verify the code
        if not device.verify_totp(code):
            return Response(
                {"detail": "Invalid verification code."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Confirm the device
        device.confirmed_at = timezone.now()
        device.save(update_fields=["confirmed_at"])

        # Build finalize URL with same token (consumed at finalize)
        finalize_url = f"{reverse('auth-manager:finalize')}?t={auth_token}"

        return Response(
            {
                "detail": "Device enrolled successfully.",
                "finalize_url": finalize_url,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["post"], url_path="skip")
    def skip_device_code(self, request, user_id=None):
        """
        Skip MFA enrollment (only allowed if MFA is not required for the user).

        Returns the finalize URL with the same token (consumed at finalize).
        """
        user, token = self.get_user_from_token(request)
        if not user:
            return Response(
                {"detail": "Invalid or expired authentication token."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # Check if user is allowed to skip MFA
        if getattr(user, "mfa_required", True):
            return Response(
                {"detail": "MFA is required for this account."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Build finalize URL with same token (consumed at finalize)
        finalize_url = f"{reverse('auth-manager:finalize')}?t={token}"

        return Response(
            {
                "detail": "MFA skipped.",
                "finalize_url": finalize_url,
            },
            status=status.HTTP_200_OK,
        )
