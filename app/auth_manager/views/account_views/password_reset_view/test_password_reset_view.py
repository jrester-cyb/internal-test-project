# django
from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django_rest_passwordreset.models import ResetPasswordToken

# local
from auth_manager.models import SAMLIdentityProvider
from mainapp.utils import reverse

User = get_user_model()


class PasswordResetViewTestCase(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(
            email="admin@test.local", first_name="Admin", last_name="User", password=""
        )
        self.token = ResetPasswordToken.objects.create(user=self.user)
        self.client = Client()

    def test__get_with_valid_token_displays_expected_fields(self):
        # act
        response = self.client.get(reverse("auth-manager:password-reset", args=[self.token.key]))

        # assert
        self.assertTemplateUsed(response, "password_update.html")
        self.assertContains(response, 'name="new_password1"')
        self.assertContains(response, 'name="new_password2"')

    def test__get_with_invalid_token_displays_expected_message(self):
        # act
        response = self.client.get(
            reverse("auth-manager:password-reset", args=["invalidtoken"]),
        )

        # assert
        self.assertTemplateUsed(response, "password_update.html")
        self.assertContains(response, "This token is invalid or has expired.")

    def test__post_with_invalid_token_displays_expected_message(self):
        # act
        response = self.client.post(
            reverse("auth-manager:password-reset", args=["invalidtoken"]),
            data={"new_password1": "Testing123!", "new_password2": "Testing123!"},
        )

        # assert
        self.assertTemplateUsed(response, "password_update.html")
        self.assertContains(response, "This token is invalid or has expired.")

    def test__post_with_non_matching_passwords_displays_expected_message(self):
        # act
        response = self.client.post(
            reverse("auth-manager:password-reset", args=[self.token.key]),
            data={"new_password1": "Testing123456!", "new_password2": "DifferentPassword!"},
        )

        # assert
        self.assertTemplateUsed(response, "password_update.html")
        self.assertContains(response, "Passwords do not match.")

    def test__post_with_weak_password_displays_expected_message(self):
        # act
        response = self.client.post(
            reverse("auth-manager:password-reset", args=[self.token.key]),
            data={"new_password1": "weak", "new_password2": "weak"},
        )

        # assert
        self.assertTemplateUsed(response, "password_update.html")
        self.assertContains(response, "This password is too short.")

    def test__post_with_valid_data_resets_password_and_redirects_to_mfa(self):
        # act
        response = self.client.post(
            reverse("auth-manager:password-reset", args=[self.token.key]),
            data={"new_password1": "StrongPassword123!", "new_password2": "StrongPassword123!"},
        )

        # assert
        self.assertTemplateUsed(response, "password_update.html")
        self.assertContains(
            response, "Your password has been reset successfully! You will be redirected to complete your login."
        )
        self.assertIn("Refresh", response)
        self.assertTrue(response["Refresh"].endswith(reverse("auth-manager:mfa", request=response.wsgi_request)))

        # verify password was changed
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("StrongPassword123!"))

    def test__get_with_authenticated_user_redirects_to_mfa(self):
        # assign
        self.client.force_login(self.user)

        # act
        response = self.client.get(reverse("auth-manager:password-reset", args=[self.token.key]))

        # assert
        self.assertEqual(response.status_code, 302)
        self.assertRedirects(response, reverse("auth-manager:mfa"), fetch_redirect_response=False)

    def test__get_with_user_linked_to_idp_redirects_to_login(self):
        # assign
        saml_idp = SAMLIdentityProvider.objects.create(
            name="Test SAML IdP",
            entity_id="http://test-idp.local/metadata",
            sso_url="http://test-idp.local/sso",
        )
        saml_idp.system_users.add(self.user)
        saml_idp.save()

        # act
        response = self.client.get(reverse("auth-manager:password-reset", args=[self.token.key]))

        # assert
        self.assertRedirects(response, reverse("auth-manager:login"), fetch_redirect_response=False)
        self.assertFalse(ResetPasswordToken.objects.filter(key=self.token.key).exists())
