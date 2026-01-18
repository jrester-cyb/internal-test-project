# django
from django.contrib.auth import get_user_model
from django.test import Client, TestCase, override_settings
from django.urls import reverse

# thirdparty
from rest_framework import status

# local
from auth_manager.models import OneTimeToken, SAMLIdentityProvider

User = get_user_model()


class MagicLinkCallbackViewTestCase(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(
            email="admin@test.local", first_name="Admin", last_name="User", password="Secure!"
        )

    def test_valid_token_logs_in_user_and_redirects(self):
        # assign
        token = OneTimeToken.objects.generate_token(self.user)

        # act
        response = self.client.get(reverse("auth-manager:magic-link-callback", args=(token,)))

        # assert
        self.assertRedirects(response, "/", status_code=status.HTTP_302_FOUND, fetch_redirect_response=False)
        self.assertTrue("_auth_user_id" in self.client.session)
        self.assertEqual(int(self.client.session["_auth_user_id"]), self.user.pk)

    def test_token_is_only_valid_once(self):
        # assign
        token = OneTimeToken.objects.generate_token(self.user)

        # act
        response1 = self.client.get(reverse("auth-manager:magic-link-callback", args=(token,)))
        response2 = self.client.get(reverse("auth-manager:magic-link-callback", args=(token,)))

        # assert
        self.assertRedirects(response1, "/", status_code=status.HTTP_302_FOUND, fetch_redirect_response=False)
        self.assertEqual(response2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Invalid or missing token provided.", response2.content.decode())
        self.assertTrue("_auth_user_id" in self.client.session)
        self.assertEqual(int(self.client.session["_auth_user_id"]), self.user.pk)

    def test_invalid_token_returns_400(self):
        # act
        response = self.client.get(reverse("auth-manager:magic-link-callback", args=("invalidtoken",)))

        # assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Invalid or missing token provided.", response.content.decode())
        self.assertFalse("_auth_user_id" in self.client.session)

    @override_settings(MAGIC_LINK_TOKEN_EXPIRATION_TIME=-1)
    def test_expired_token_returns_400(self):
        # assign
        token = OneTimeToken.objects.generate_token(self.user)

        # act
        response = self.client.get(reverse("auth-manager:magic-link-callback", args=(token,)))

        # assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Invalid or missing token provided.", response.content.decode())
        self.assertFalse("_auth_user_id" in self.client.session)

    def test_when_user_linked_to_idp_login_works(self):
        # assign
        idp = SAMLIdentityProvider.objects.create(
            name="Test IdP",
            entity_id="http://test-idp.local/saml2/metadata/",
            sso_url="http://test-idp.local/saml2/sso/",
            x509_cert="MIIC...test...AB",  # Truncated for brevity
        )
        idp.system_users.add(self.user)
        token = OneTimeToken.objects.generate_token(self.user)

        # act
        response = self.client.get(reverse("auth-manager:magic-link-callback", args=(token,)))

        # assert
        self.assertRedirects(response, "/", status_code=status.HTTP_302_FOUND, fetch_redirect_response=False)
        self.assertTrue("_auth_user_id" in self.client.session)
        self.assertEqual(int(self.client.session["_auth_user_id"]), self.user.pk)
