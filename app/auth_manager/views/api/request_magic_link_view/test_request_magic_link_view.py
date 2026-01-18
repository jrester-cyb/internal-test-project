# stdlib
from unittest.mock import patch

# django
from django.contrib.auth import get_user_model

# local
from auth_manager.models import OneTimeToken
from mainapp.utils import reverse

# thirdparty
from rest_framework.test import APIClient, APITestCase

User = get_user_model()


class RequestMagicLinkAPIViewTestCase(APITestCase):
    def setUp(self):
        self.client = APIClient()
        user = User.objects.create_user(
            email="admin@test.local", first_name="Admin", last_name="User", password="Secure!"
        )
        self.token = OneTimeToken.objects.generate_token(user)

    @patch("auth_manager.emails.MagicLinkRequestEmail.send")
    def test_request_magic_link_with_valid_token_succeeds(self, mock_send_email):
        # act
        response = self.client.post(reverse("auth-manager:magic-link-request"), data={"token": self.token})

        # assert
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, "Ok")
        mock_send_email.assert_called_once()

    def test_request_magic_link_with_invalid_token_fails(self):
        # act
        response = self.client.post(reverse("auth-manager:magic-link-request"), data={"token": "invalidtoken"})

        # assert
        self.assertEqual(response.status_code, 403)
        self.assertIn("You do not have permission to perform this action.", response.data["detail"])
