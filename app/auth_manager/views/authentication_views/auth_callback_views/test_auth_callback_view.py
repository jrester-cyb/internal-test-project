# stdlib
from uuid import uuid4

# django
from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.urls import reverse

# local
from auth_manager.models.identity_provider_models import (
    LocalIdentityProvider,
    SAMLIdentityProvider,
)

User = get_user_model()


class DynamicIdentityProviderAuthenticationCallbackViewTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="admin@test.local", password="", first_name="Admin", last_name="User"
        )
        self.client = Client()
        self.local_idp = LocalIdentityProvider.objects.get()
        self.saml_idp = SAMLIdentityProvider.objects.create(
            name="Test SAML IdP",
            id=str(uuid4()),
            entity_id="test-entity-id",
            sso_url="https://example.com/sso",
            x509_cert="-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----",
            enabled=True,
        )

    def test__shows_login_error_page_when_invalid_idp_id_provided(self):
        # act
        response = self.client.get(
            reverse("auth-manager:auth-callback", args=(str(uuid4()),))
        )

        # assert
        self.assertContains(response, "Identity provider not found.", status_code=404)

    def test__shows_error_page_with_button_when_idp_is_disabled_and_user_is_admin(self):
        # arrange
        self.user.is_superuser = True
        self.user.save()
        self.saml_idp.enabled = False
        self.saml_idp.save()
        self.saml_idp.system_users.add(self.user)

        # act
        login_init_response = self.client.post(
            reverse("auth-manager:login"), data={"email": self.user.email}
        )
        self.assertEqual(login_init_response.status_code, 302)
        response = self.client.get(
            reverse("auth-manager:auth-callback", args=(self.saml_idp.id,))
        )

        # assert
        self.assertContains(
            response,
            "This identity provider is disabled. As an administrator, you can re-enable it in the admin panel. Click the button below to send a login link to your registered email address.",
            status_code=200,
        )

    def test__shows_error_page_without_button_when_idp_is_disabled_and_user_is_not_admin(
        self,
    ):
        # arrange
        self.saml_idp.enabled = False
        self.saml_idp.save()

        # act
        response = self.client.get(
            reverse("auth-manager:auth-callback", args=(self.saml_idp.id,))
        )

        # assert
        self.assertContains(
            response,
            "This identity provider is disabled. Please contact an administrator for assistance.",
            status_code=200,
        )
