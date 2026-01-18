# stdlib
from unittest.mock import patch

# django
from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.urls import reverse

# local
from auth_manager.constants import PROVIDED_EMAIL
from auth_manager.models import SAMLIdentityProvider

# thirdparty
from rest_framework import status

User = get_user_model()


class SAMLIdentityProviderAuthenticationCallbackViewTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="admin@test.local", password="", first_name="Admin", last_name="User"
        )
        self.client = Client()
        self.session = self.client.session
        self.saml_idp, _ = SAMLIdentityProvider.objects.get_or_create()

    def test__get_returns_redirect_link_to_user(self):
        # assign
        self.saml_idp.entity_id = "urn:powerview:myidp"
        self.saml_idp.sso_url = "http://example.com/saml/sso"
        self.saml_idp.x509_cert = """-----BEGIN CERTIFICATE-----"""
        self.saml_idp.save(update_fields=["entity_id", "sso_url", "x509_cert"])

        # Patch mainapp.utils.reverse to always return a valid ACS URL
        with patch(
            "auth_manager.models.identity_provider_models.reverse", return_value="http://testserver.com/saml/acs"
        ), patch("onelogin.saml2.auth.OneLogin_Saml2_Auth.login", return_value="http://redirected.url"):
            response = self.client.get(reverse("auth-manager:auth-callback", args=(self.saml_idp.global_id_str,)))

        # assert
        self.assertRedirects(response, "http://redirected.url", fetch_redirect_response=False)

    def test__post_returns_redirect_to_mfa_when_user_finalizes_their_mfa(self):
        # assign
        self.saml_idp.entity_id = "urn:powerview:myidp"
        self.saml_idp.sso_url = "http://example.com/saml/sso"
        self.saml_idp.x509_cert = """-----BEGIN CERTIFICATE-----"""
        self.saml_idp.attribute_mappings = {"email": "email", "first_name": "first_name", "last_name": "last_name"}
        self.saml_idp.save(update_fields=["entity_id", "sso_url", "x509_cert", "attribute_mappings"])

        # act
        with patch(
            "auth_manager.models.identity_provider_models.reverse", return_value="http://testserver.com/saml/acs"
        ), patch("onelogin.saml2.auth.OneLogin_Saml2_Auth.process_response", return_value=None), patch(
            "onelogin.saml2.auth.OneLogin_Saml2_Auth.get_errors", return_value=None
        ), patch(
            "onelogin.saml2.auth.OneLogin_Saml2_Auth.is_authenticated", return_value=True
        ), patch(
            "onelogin.saml2.auth.OneLogin_Saml2_Auth.get_attributes",
            return_value={"email": ["admin2@test.local"], "first_name": ["Admin"], "last_name": ["User"]},
        ):
            response = self.client.post(
                reverse("auth-manager:auth-callback", args=(self.saml_idp.global_id_str,)),
                data={"SAMLResponse": "dummy-response"},
            )

        # assert
        self.assertRedirects(response, reverse("auth-manager:mfa"), fetch_redirect_response=False)

    def test__post_shows_error_when_user_does_not_exist_and_not_allowed_to_auto_enroll(self):
        # assign
        self.saml_idp.entity_id = "urn:powerview:myidp"
        self.saml_idp.sso_url = "http://example.com/saml/sso"
        self.saml_idp.x509_cert = """-----BEGIN CERTIFICATE-----"""
        self.saml_idp.attribute_mappings = {"email": "email", "first_name": "first_name", "last_name": "last_name"}
        self.saml_idp.allow_autoenrollment = False
        self.saml_idp.save(
            update_fields=["entity_id", "sso_url", "x509_cert", "attribute_mappings", "allow_autoenrollment"]
        )

        # act
        with patch(
            "auth_manager.models.identity_provider_models.reverse", return_value="http://testserver.com/saml/acs"
        ), patch("onelogin.saml2.auth.OneLogin_Saml2_Auth.process_response", return_value=None), patch(
            "onelogin.saml2.auth.OneLogin_Saml2_Auth.get_errors", return_value=None
        ), patch(
            "onelogin.saml2.auth.OneLogin_Saml2_Auth.is_authenticated", return_value=True
        ), patch(
            "onelogin.saml2.auth.OneLogin_Saml2_Auth.get_attributes",
            return_value={"email": ["admin2@test.local"], "first_name": ["Admin"], "last_name": ["User"]},
        ):
            response = self.client.post(
                reverse("auth-manager:auth-callback", args=(self.saml_idp.global_id_str,)),
                {"SAMLResponse": "dummy-response"},
            )

        # assert
        self.assertContains(
            response,
            "User is not allowed to access Power-View.",
            status_code=400,
        )

    def test__post_shows_error_when_user_already_linked_to_another_idp(self):
        # assign
        idp = SAMLIdentityProvider.objects.create(
            name="Other SAML IdP",
            entity_id="other-entity-id",
            sso_url="https://idp2.example.com/sso",
            x509_cert="dummy-cert2",
            attribute_mappings={"email": "EmailAddress", "first_name": "FirstName"},
            allow_autoenrollment=True,
        )
        self.saml_idp.entity_id = "urn:powerview:myidp"
        self.saml_idp.sso_url = "http://example.com/saml/sso"
        self.saml_idp.x509_cert = """-----BEGIN CERTIFICATE-----"""
        self.saml_idp.attribute_mappings = {"email": "email", "first_name": "first_name", "last_name": "last_name"}
        self.saml_idp.allow_autoenrollment = False
        self.saml_idp.save(
            update_fields=["entity_id", "sso_url", "x509_cert", "attribute_mappings", "allow_autoenrollment"]
        )
        idp.system_users.add(self.user)

        # act
        with patch(
            "auth_manager.models.identity_provider_models.reverse", return_value="http://testserver.com/saml/acs"
        ), patch("onelogin.saml2.auth.OneLogin_Saml2_Auth.process_response", return_value=None), patch(
            "onelogin.saml2.auth.OneLogin_Saml2_Auth.get_errors", return_value=None
        ), patch(
            "onelogin.saml2.auth.OneLogin_Saml2_Auth.is_authenticated", return_value=True
        ), patch(
            "onelogin.saml2.auth.OneLogin_Saml2_Auth.get_attributes",
            return_value={"email": ["admin@test.local"], "first_name": ["Admin"], "last_name": ["User"]},
        ):
            response = self.client.post(
                reverse("auth-manager:auth-callback", args=(self.saml_idp.global_id_str,)),
                {"SAMLResponse": "dummy-response"},
            )

        # assert
        self.assertContains(response, "User already linked to another identity provider", status_code=400)

    def test__post_shows_error_when_saml_response_missing_required_attribute(self):
        # assign
        self.saml_idp.entity_id = "urn:powerview:myidp"
        self.saml_idp.sso_url = "http://example.com/saml/sso"
        self.saml_idp.x509_cert = """-----BEGIN CERTIFICATE-----"""
        self.saml_idp.attribute_mappings = {"email": "email", "first_name": "first_name", "last_name": "last_name"}
        self.saml_idp.save(update_fields=["entity_id", "sso_url", "x509_cert", "attribute_mappings"])

        # act
        with patch(
            "auth_manager.models.identity_provider_models.reverse", return_value="http://testserver.com/saml/acs"
        ), patch("onelogin.saml2.auth.OneLogin_Saml2_Auth.process_response", return_value=None), patch(
            "onelogin.saml2.auth.OneLogin_Saml2_Auth.get_errors", return_value=None
        ), patch(
            "onelogin.saml2.auth.OneLogin_Saml2_Auth.is_authenticated", return_value=True
        ), patch(
            "onelogin.saml2.auth.OneLogin_Saml2_Auth.get_attributes",
            return_value={"firstname": ["Admin"], "lastname": ["User"], "Email": ["admin@test.local"]},
        ):
            response = self.client.post(
                reverse("auth-manager:auth-callback", args=(self.saml_idp.global_id_str,)),
                {"SAMLResponse": "dummy-response"},
            )

        # assert
        self.assertContains(response, "A valid email address is required.", status_code=400)
        self.assertContains(response, "First name is required.", status_code=400)
        self.assertContains(response, "Last name is required.", status_code=400)

    def test__post_with_user_who_already_exist_in_another_idp_raises_an_error(self):
        # assign
        self.saml_idp.entity_id = "urn:powerview:myidp"
        self.saml_idp.sso_url = "http://example.com/saml/sso"
        self.saml_idp.x509_cert = """-----BEGIN CERTIFICATE-----"""
        self.saml_idp.attribute_mappings = {"email": "email", "first_name": "first_name", "last_name": "last_name"}
        self.saml_idp.save(update_fields=["entity_id", "sso_url", "x509_cert", "attribute_mappings"])
        other_idp = SAMLIdentityProvider.objects.create(
            name="Other SAML IdP",
            entity_id="other-entity-id",
            sso_url="https://idp2.example.com/sso",
            x509_cert="dummy-cert2",
            attribute_mappings={"email": "EmailAddress", "first_name": "FirstName"},
            allow_autoenrollment=True,
        )
        other_idp.system_users.add(self.user)

        # act
        with patch(
            "auth_manager.models.identity_provider_models.reverse", return_value="http://testserver.com/saml/acs"
        ), patch("onelogin.saml2.auth.OneLogin_Saml2_Auth.process_response", return_value=None), patch(
            "onelogin.saml2.auth.OneLogin_Saml2_Auth.get_errors", return_value=None
        ), patch(
            "onelogin.saml2.auth.OneLogin_Saml2_Auth.is_authenticated", return_value=True
        ), patch(
            "onelogin.saml2.auth.OneLogin_Saml2_Auth.get_attributes",
            return_value={"email": [self.user.email], "first_name": ["Admin"], "last_name": ["User"]},
        ):
            response = self.client.post(
                reverse("auth-manager:auth-callback", args=(self.saml_idp.global_id_str,)),
                data={"SAMLResponse": "dummy-response"},
            )

        # assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertContains(
            response, "User already linked to another identity provider", status_code=status.HTTP_400_BAD_REQUEST
        )

    def test__response_from_idp_with_email_that_does_not_match_provided_email_in_session_raises_error(self):
        # assign
        self.saml_idp.entity_id = "urn:powerview:myidp"
        self.saml_idp.sso_url = "http://example.com/saml/sso"
        self.saml_idp.x509_cert = """-----BEGIN CERTIFICATE-----"""
        self.saml_idp.attribute_mappings = {"email": "email", "first_name": "first_name", "last_name": "last_name"}
        self.saml_idp.save(update_fields=["entity_id", "sso_url", "x509_cert", "attribute_mappings"])
        self.session[PROVIDED_EMAIL] = "admin@test.local"
        self.session.save()

        # django
        from django.core.signing import Signer

        signer = Signer()
        signed_object = signer.sign_object({"requesting_email": "admin@test.local"})

        # act
        with patch(
            "auth_manager.models.identity_provider_models.reverse", return_value="http://testserver.com/saml/acs"
        ), patch("onelogin.saml2.auth.OneLogin_Saml2_Auth.process_response", return_value=None), patch(
            "onelogin.saml2.auth.OneLogin_Saml2_Auth.get_errors", return_value=None
        ), patch(
            "onelogin.saml2.auth.OneLogin_Saml2_Auth.is_authenticated", return_value=True
        ), patch(
            "onelogin.saml2.auth.OneLogin_Saml2_Auth.get_attributes",
            return_value={"email": ["admin2@test.local"], "first_name": ["Admin"], "last_name": ["User"]},
        ):
            response = self.client.post(
                reverse(
                    "auth-manager:auth-callback",
                    args=(self.saml_idp.global_id_str,),
                ),
                data={"SAMLResponse": "dummy-response", "RelayState": signed_object},
            )

        # assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertContains(
            response,
            "The email provided from your identity provider does not match the email you provided.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )
