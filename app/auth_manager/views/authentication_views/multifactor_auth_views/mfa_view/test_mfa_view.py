# django
from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.urls import reverse

# local
from auth_manager.test import Client as MFAClient

# thirdparty
from rest_framework import status


class MFAViewTestCase(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            email="admin@test.local", first_name="Admin", last_name="User", password=""
        )
        self.url = reverse("auth-manager:mfa")
        self.anonymous_client = Client()
        self.client = Client()
        self.mfa_client = MFAClient()
        self.client.force_login(self.user)
        self.mfa_client.force_login(self.user)

    def test__redirects_to_login_page_when_unauthenticated(self):
        # act
        response = self.anonymous_client.get(self.url)

        # assert
        self.assertRedirects(response, reverse("auth-manager:login"), fetch_redirect_response=False)

    def test__redirects_to_finalize_page_when_fully_authenticated(self):
        # act
        response = self.mfa_client.get(self.url)

        # assert
        self.assertRedirects(response, reverse("auth-manager:finalize"), fetch_redirect_response=False)

    def test__redirects_to_mfa_enroll_page_when_user_is_authenticated_with_no_enrolled_devices(self):
        # act
        response = self.client.get(self.url)

        # assert
        self.assertRedirects(response, reverse("auth-manager:mfa-enroll"), fetch_redirect_response=False)

    def test__renders_mfa_page_when_user_is_authenticated_with_enrolled_devices(self):
        # assign
        self.user.user_multifactor_auth_devices.filter(device_type="Email").update(verified=True)

        # act
        response = self.client.get(self.url)

        # assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTemplateUsed(response, "mfa_templates/mfa.html")
        self.assertTemplateUsed(response, "mfa_templates/mfa_email_card.html")
        self.assertTemplateNotUsed(response, "mfa_templates/mfa_totp_card.html")
        self.assertTemplateNotUsed(response, "mfa_templates/mfa_sms_card.html")

    def test__shows_a_card_for_each_verified_device(self):
        # assign
        self.user.user_multifactor_auth_devices.update(verified=True)

        # act
        response = self.client.get(self.url)

        # assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTemplateUsed(response, "mfa_templates/mfa.html")
        self.assertTemplateUsed(response, "mfa_templates/mfa.html")
        self.assertTemplateUsed(response, "mfa_templates/mfa_email_card.html")
        self.assertTemplateUsed(response, "mfa_templates/mfa_totp_card.html")
        self.assertTemplateUsed(response, "mfa_templates/mfa_sms_card.html")
