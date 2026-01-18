# django
from django.conf import settings
from django.utils import timezone

# local
from auth_manager.models import MFADevice, TOTPDevice, SMSDevice
from auth_manager.permissions import IsMultiFactorAuthenticated

# thirdparty
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView


class MFADeviceSerializer(serializers.ModelSerializer):
    type = serializers.SerializerMethodField()
    masked_destination = serializers.SerializerMethodField()

    class Meta:
        model = MFADevice
        fields = [
            "id",
            "name",
            "type",
            "masked_destination",
            "confirmed_at",
            "last_used_at",
            "created_at",
        ]

    def get_type(self, obj) -> str:
        return obj.delivery_method

    def get_masked_destination(self, obj) -> str | None:
        return obj.get_masked_destination()


class UserMFADevicesView(APIView):
    """
    API view for listing the current user's MFA devices.
    """

    permission_classes = [IsMultiFactorAuthenticated]

    def get(self, request) -> Response:
        """
        Get all confirmed MFA devices for the authenticated user.
        """
        devices = MFADevice.objects.get_active_for_user(request.user)
        serializer = MFADeviceSerializer(devices, many=True)
        return Response(serializer.data)


class UserMFADeviceDetailView(APIView):
    """
    API view for managing a specific MFA device.
    """

    permission_classes = [IsMultiFactorAuthenticated]

    def delete(self, request, device_id) -> Response:
        """
        Delete (soft delete) an MFA device for the authenticated user.
        """
        try:
            device = MFADevice.objects.get(
                id=device_id,
                user=request.user,
                confirmed_at__isnull=False,
            )
        except MFADevice.DoesNotExist:
            return Response(
                {"detail": "Device not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Soft delete the device
        device.delete()

        return Response(status=status.HTTP_204_NO_CONTENT)


class MFAEnrollmentSetupView(APIView):
    """
    API view for getting TOTP enrollment setup data (seed and provisioning URI).
    """

    permission_classes = [IsMultiFactorAuthenticated]

    def get(self, request) -> Response:
        """
        Generate a new TOTP seed and provisioning URI for enrollment.
        """
        user = request.user
        totp_seed = MFADevice.generate_secret()

        issuer = getattr(settings, "MFA_ISSUER", "MyApp")
        account_name = user.email or user.username
        provisioning_uri = (
            f"otpauth://totp/{issuer}:{account_name}"
            f"?secret={totp_seed}"
            f"&issuer={issuer}"
            f"&algorithm=SHA1"
            f"&digits=6"
            f"&period=30"
        )

        return Response(
            {
                "seed": totp_seed,
                "provisioning_uri": provisioning_uri,
                "issuer": issuer,
                "account_name": account_name,
            }
        )


class MFAEnrollTOTPView(APIView):
    """
    API view for enrolling a TOTP device.
    """

    permission_classes = [IsMultiFactorAuthenticated]

    def post(self, request) -> Response:
        """
        Enroll a new TOTP device.

        Required fields:
        - seed: The TOTP secret key
        - code: The verification code from the authenticator app
        """
        seed = request.data.get("seed", "")
        code = request.data.get("code", "")

        if not seed:
            return Response(
                {"detail": "Seed is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not code:
            return Response(
                {"detail": "Verification code is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Create TOTP device with provided seed
        device = TOTPDevice(
            user=request.user,
            name="Authenticator App",
        )
        device.secret = seed
        device.save()

        # Verify the code
        if not device.verify_totp(code):
            device.delete()
            return Response(
                {"detail": "Invalid verification code."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Confirm the device
        device.confirmed_at = timezone.now()
        device.save(update_fields=["confirmed_at"])

        serializer = MFADeviceSerializer(device)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class MFAEnrollSMSInitiateView(APIView):
    """
    API view for initiating SMS device enrollment.
    """

    permission_classes = [IsMultiFactorAuthenticated]

    def post(self, request) -> Response:
        """
        Initiate SMS device enrollment - create device and send verification code.

        Required fields:
        - phone_number: The phone number for SMS delivery
        """
        phone_number = request.data.get("phone_number", "")

        if not phone_number:
            return Response(
                {"detail": "Phone number is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Delete any existing unconfirmed SMS devices for this user
        SMSDevice.objects.filter(user=request.user, confirmed_at__isnull=True).delete()

        # Create SMS device
        device = SMSDevice.objects.create(
            user=request.user,
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


class MFAEnrollSMSVerifyView(APIView):
    """
    API view for verifying SMS device enrollment.
    """

    permission_classes = [IsMultiFactorAuthenticated]

    def post(self, request) -> Response:
        """
        Verify and complete SMS device enrollment.

        Required fields:
        - device_id: The ID of the SMS device from initiate
        - code: The verification code sent to the phone
        """
        device_id = request.data.get("device_id", "")
        code = request.data.get("code", "")

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
                user=request.user,
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

        serializer = MFADeviceSerializer(device)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
