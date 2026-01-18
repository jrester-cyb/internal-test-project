# stdlib
from unittest import mock
from uuid import uuid4

# django
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

# local
from auth_manager.models.one_time_token import OneTimeToken

# thirdparty
from knox.models import AuthToken
from rest_framework import status

User = get_user_model()


class APITokenInitViewTests(TestCase):
    def setUp(self):
        super().setUp()
        self.user = User.objects.create_user(
            email="test@example.com",
            password="testpass",
            first_name="test",
            last_name="user",
        )
        # No need for signer, use OneTimeToken for token generation
        self.url = reverse("auth-manager-api:token-login")

    def test_invalid_token_string(self):
        response = self.client.post(
            self.url, {"token": "notavalidtoken"}, content_type="application/json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_expired_token(self):
        # Patch settings to a very short expiration
        token = OneTimeToken.objects.generate_token(self.user)
        with mock.patch("django.conf.settings.SHORT_TOKEN_EXPIRATION", 0):
            response = self.client.post(
                self.url, {"token": token}, content_type="application/json"
            )
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_token_with_invalid_user(self):
        # Generate a token for a non-existent OneTimeToken id
        fake_code = str(uuid4())
        # django
        from django.core.signing import TimestampSigner

        signer = TimestampSigner()
        token = signer.sign_object({"code": fake_code})
        response = self.client.post(
            self.url, {"token": token}, content_type="application/json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_valid_token_returns_auth_token(self):
        token = OneTimeToken.objects.generate_token(self.user)
        response = self.client.post(
            self.url, {"token": token}, content_type="application/json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("token", response.json())
        self.assertTrue(AuthToken.objects.filter(user=self.user).exists())

    def test__attempting_to_reuse_token_returns_expected_error(self):
        token = OneTimeToken.objects.generate_token(self.user)
        response = self.client.post(
            self.url, {"token": token}, content_type="application/json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("token", response.json())
        self.assertTrue(AuthToken.objects.filter(user=self.user).exists())
        response_2 = self.client.post(
            self.url, {"token": token}, content_type="application/json"
        )
        self.assertEqual(response_2.status_code, status.HTTP_403_FORBIDDEN)
