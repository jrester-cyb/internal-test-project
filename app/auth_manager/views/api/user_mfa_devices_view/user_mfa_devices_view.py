# local
from auth_manager.models import MFADevice
from auth_manager.permissions import IsMultiFactorAuthenticated

# thirdparty
from rest_framework import serializers
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
