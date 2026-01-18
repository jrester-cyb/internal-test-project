# stdlib
from unittest.mock import patch

# django
from django.contrib.auth import get_user_model
from django.test import TestCase

# local
from auth_manager.models.identity_provider_models import SAMLIdentityProvider
from mainapp.utils import reverse

# thirdparty
from rest_framework import status
from rest_framework.test import APIClient

User = get_user_model()


class ResetPasswordRequestTokenOverrideTestCase(TestCase):

    def setUp(self):
        self.url = reverse("auth-manager-api:reset-password-request")
        self.client = APIClient()

    def test__request_password_reset_calls_signal_reset_password_token_created(self):
        # assign
        user = User.objects.create_user(
            email="admin@test.local", first_name="Admin", last_name="User", password="NonSecurePass"
        )

        # act / assert
        with patch("django_rest_passwordreset.signals.reset_password_token_created.send") as mock_signal:
            response = self.client.post(self.url, {"email": user.email}, format="json")
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            mock_signal.assert_called()

    def test__request_password_reset__does_not_call_signal_reset_password_token_created_when_user_linked_to_idp(self):
        # assign
        user = User.objects.create_user(
            email="admin@test.local", first_name="Admin", last_name="User", password="NonSecurePass"
        )
        idp = SAMLIdentityProvider.objects.create(name="test")
        idp.system_users.add(user)

        # act / assert
        with patch("django_rest_passwordreset.signals.reset_password_token_created.send") as mock_signal:
            response = self.client.post(self.url, {"email": user.email}, format="json")
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            mock_signal.assert_not_called()

    def test__request_password_reset__does_not_call_signal_reset_password_token_created_when_user_is_robotic(self):
        # assign
        User.objects.create(email="", first_name="Robotic", last_name="User", password="NonSecurePass", user_type=1)

        # act/assert
        with patch("django_rest_passwordreset.signals.reset_password_token_created.send") as mock_signal:
            response = self.client.post(self.url, {"email": "admin@test.local"}, format="json")
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            mock_signal.assert_not_called()
