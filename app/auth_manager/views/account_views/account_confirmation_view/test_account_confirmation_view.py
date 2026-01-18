# django
from django.contrib.auth import get_user_model
from django.core import signing
from django.test import Client, TestCase

# local
from mainapp.utils import reverse

User = get_user_model()


class AccountConfirmationViewTestCase(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(
            email="admin@test.local", first_name="Admin", last_name="User", password=""
        )
        self.token = signing.dumps({"global_id": self.user.global_id_str})
        self.client = Client()

    def test__get_with_valid_token_displays_expected_fields(self):
        # act
        response = self.client.get(reverse("auth-manager:account-confirmation", args=[self.token]))

        # assert
        self.assertTemplateUsed(response, "account_confirmation.html")
        self.assertContains(response, 'name="new_password1"')
        self.assertContains(response, 'name="new_password2"')

    def test__get_with_invalid_token_shows_error_message(self):
        # act
        response = self.client.get(reverse("auth-manager:account-confirmation", args=["invalidtoken:t"]))

        # assert
        self.assertTemplateUsed(response, "account_confirmation.html")
        self.assertContains(response, "This token is invalid or has expired.")

    def test__post_with_valid_token_and_matching_passwords_sets_password_and_logs_in_user(self):
        # act
        response = self.client.post(
            reverse("auth-manager:account-confirmation", args=[self.token]),
            {"new_password1": "Newpassword123!", "new_password2": "Newpassword123!"},
        )

        # assert
        self.assertIn("Refresh", response)
        self.assertTrue(response["Refresh"].endswith(reverse("auth-manager:mfa", request=response.wsgi_request)))
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("Newpassword123!"))

    def test__post_with_mismatch_shows_expected_errors(self):
        # act
        response = self.client.post(
            reverse("auth-manager:account-confirmation", args=[self.token]),
            {"new_password1": "Newpassword123!", "new_password2": "Newpassworaaaaaaa!"},
        )

        # assert
        self.assertContains(response, "Passwords do not match.")

    def test__post_with_short_password_shows_expected_errors(self):
        # act
        response = self.client.post(
            reverse("auth-manager:account-confirmation", args=[self.token]),
            {"new_password1": "short", "new_password2": "short"},
        )

        # assert
        self.assertContains(response, "This password is too short. It must contain at least 12 characters.")

    def test__post_with_missing_characters_shows_expected_errors(self):
        # act
        response = self.client.post(
            reverse("auth-manager:account-confirmation", args=[self.token]),
            {"new_password1": "shorting1234", "new_password2": "shorting1234"},
        )

        # assert
        self.assertContains(response, "The password must contain at least 1 uppercase character.")
