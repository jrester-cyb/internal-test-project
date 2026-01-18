# django
from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.urls import reverse

# local
from multifactor_auth.test import Client as MFAClient


class MFAEnrollViewTestCase(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            email="admin@test.local", first_name="Admin", last_name="User", password=""
        )
        self.url = reverse("auth-manager:mfa-enroll")
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

    def test__redirects_to_mfa_page_when_user_is_authenticated_with_enrolled_devices(self):
        # assign
        self.user.user_multifactor_auth_devices.filter(device_type="Email").update(verified=True)

        # act
        response = self.client.get(self.url)

        # assert
        self.assertRedirects(response, reverse("auth-manager:mfa"), fetch_redirect_response=False)

    def test__shows_card_for_skipping_if_mfa_is_not_required(self):
        # assign
        self.user.mfa_required = False
        self.user.save(update_fields=["mfa_required"])

        # act
        response = self.client.get(self.url)

        # assert
        self.assertTemplateUsed(response, "mfa_enrollment_templates/mfa_enroll.html")
        self.assertTemplateUsed(response, "mfa_enrollment_templates/mfa_enroll_skip_card.html")

    def test__shows_a_card_for_each_unverified_device(self):
        # act
        response = self.client.get(self.url)

        # assert
        self.assertTemplateUsed(response, "mfa_enrollment_templates/mfa_enroll.html")
        self.assertTemplateUsed(response, "mfa_enrollment_templates/mfa_enroll_totp_card.html")
        self.assertTemplateUsed(response, "mfa_enrollment_templates/mfa_enroll_sms_card.html")
        self.assertTemplateUsed(response, "mfa_templates/mfa_email_card.html")

    def test__does_not_show_skip_card_if_mfa_is_required(self):
        # assign
        self.user.mfa_required = True
        self.user.save(update_fields=["mfa_required"])

        # act
        response = self.client.get(self.url)

        # assert
        self.assertTemplateUsed(response, "mfa_enrollment_templates/mfa_enroll.html")
        self.assertTemplateUsed(response, "mfa_enrollment_templates/mfa_enroll_totp_card.html")
        self.assertTemplateUsed(response, "mfa_enrollment_templates/mfa_enroll_sms_card.html")
        self.assertTemplateUsed(response, "mfa_templates/mfa_email_card.html")
        self.assertTemplateNotUsed(response, "mfa_enrollment_templates/mfa_enroll_skip_card.html")
