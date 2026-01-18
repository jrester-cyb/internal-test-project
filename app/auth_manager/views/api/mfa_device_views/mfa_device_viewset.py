# django
from django.conf import settings
from django.urls import reverse

# local
from auth_manager.models import MFADevice, OneTimeToken

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

        On successful verification:
        1. Consumes the current auth token
        2. Generates a new token for the finalize step
        3. Returns the new token in the response
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
                verified=True,  # Only verified devices can be used for auth
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

        # Consume the current token
        OneTimeToken.objects.validate_token(
            token,
            token_expiration_time=settings.SHORT_TOKEN_EXPIRATION,
            consume=True,
        )

        # Generate a new token for finalize
        new_token = OneTimeToken.objects.generate_token(user)

        # Build finalize URL with new token
        finalize_url = f"{reverse('auth-manager:finalize')}?t={new_token}"

        return Response(
            {
                "detail": "Verification successful.",
                "finalize_url": finalize_url,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="enroll")
    def enroll_device(self, request, user_id=None, id=None):
        """
        Enroll (verify) a new MFA device.

        On successful enrollment:
        1. Marks the device as verified
        2. Consumes the current auth token
        3. Generates a new token for the finalize step
        4. Returns the new token in the response
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
                verified=False,  # Only unverified devices can be enrolled
            )
        except MFADevice.DoesNotExist:
            return Response(
                {"detail": "Device not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Verify the code for enrollment
        if not device.verify_totp(code):
            return Response(
                {"detail": "Invalid verification code."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Mark device as verified
        device.verified = True
        device.save(update_fields=["verified"])

        # Consume the current token
        OneTimeToken.objects.validate_token(
            token,
            token_expiration_time=settings.SHORT_TOKEN_EXPIRATION,
            consume=True,
        )

        # Generate a new token for finalize
        new_token = OneTimeToken.objects.generate_token(user)

        # Build finalize URL with new token
        finalize_url = f"{reverse('auth-manager:finalize')}?t={new_token}"

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

        Consumes the current token and generates a new one for finalize.
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

        # Consume the current token
        OneTimeToken.objects.validate_token(
            token,
            token_expiration_time=settings.SHORT_TOKEN_EXPIRATION,
            consume=True,
        )

        # Generate a new token for finalize
        new_token = OneTimeToken.objects.generate_token(user)

        # Build finalize URL with new token
        finalize_url = f"{reverse('auth-manager:finalize')}?t={new_token}"

        return Response(
            {
                "detail": "MFA skipped.",
                "finalize_url": finalize_url,
            },
            status=status.HTTP_200_OK,
        )
