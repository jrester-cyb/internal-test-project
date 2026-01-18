# django
from django.contrib.auth import password_validation as validators

# thirdparty
from rest_framework import serializers


class CreatePasswordSerializer(serializers.Serializer):
    """
    Serializer for password create endpoint.
    """

    new_password1 = serializers.CharField(required=True)
    new_password2 = serializers.CharField(required=True)

    def validate_new_password1(self, value: str):
        """
        Validate that the password is not the same as the username.
        """
        validators.validate_password(value, self.context["user"])
        return value

    def validate_new_password2(self, value: str):
        """
        Validate that the new passwords match.
        """
        new_password1 = self.initial_data.get("new_password1")
        if new_password1 != value:
            raise serializers.ValidationError("Passwords do not match.")
        return value


class ChangePasswordSerializer(CreatePasswordSerializer):
    """
    Serializer for password change endpoint.
    """

    old_password = serializers.CharField(required=True)
    new_password1 = serializers.CharField(required=True)
    new_password2 = serializers.CharField(required=True)

    def validate_old_password(self, value: str):
        """
        Validate that the password is not the same as the username.
        """
        if not self.context["user"].check_password(value):
            raise serializers.ValidationError("The old password you provided is incorrect.")
        return value
