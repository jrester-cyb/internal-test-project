# django
from django.contrib.auth import get_user_model
from django.test import Client, TestCase

# local
from auth_manager.models import LocalIdentityProvider, SAMLIdentityProvider
from django.urls import reverse

# thirdparty
from rest_framework import status

User = get_user_model()


class LoginInitViewTestCase(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(
            email="admin@test.local",
            first_name="Admin",
            last_name="User",
            password="Secure!",
        )
        self.local_idp = LocalIdentityProvider.objects.get()

    def test_get_login_page(self):
        response = self.client.get(reverse("auth-manager:login"))
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, "login.html")

    def test__login_with_local_user_redirects_to_local_idp(self):
        # assign

        # act
        response = self.client.post(
            reverse("auth-manager:login"), {"email": self.user.email}
        )

        # assert
        self.assertEqual(response.status_code, status.HTTP_302_FOUND)
        self.assertRedirects(
            response,
            reverse(
                "auth-manager:auth-callback",
                args=(self.local_idp.id,),
                request=response.wsgi_request,
            ),
        )

    def test__hitting_login_init_with_user_who_is_already_authenticated_redirects_to_mfa(
        self,
    ):
        # assign
        self.client.force_login(self.user)

        # act
        response = self.client.get(reverse("auth-manager:login"))
        response_2 = self.client.post(
            reverse("auth-manager:login"), {"email": self.user.email}
        )

        # assert
        self.assertRedirects(
            response,
            expected_url=reverse("auth-manager:mfa"),
            fetch_redirect_response=False,
        )
        self.assertRedirects(
            response_2,
            expected_url=reverse("auth-manager:mfa"),
            fetch_redirect_response=False,
        )

    def test__hitting_login_init_with_user_who_is_using_disabled_idp_redirects_to_callback_url(
        self,
    ):
        # assign
        saml_idp = SAMLIdentityProvider.objects.create(
            name="Test SAML IdP",
            entity_id="test-entity-id",
            sso_url="https://example.com/sso",
            x509_cert="-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----",
            enabled=False,
        )
        saml_idp.system_users.add(self.user)
        saml_idp.save()

        # act
        response = self.client.post(
            reverse("auth-manager:login"), {"email": self.user.email}
        )

        # assert
        self.assertRedirects(
            response,
            expected_url=reverse(
                "auth-manager:auth-callback",
                args=(saml_idp.id,),
                request=response.wsgi_request,
            ),
            fetch_redirect_response=False,
        )
