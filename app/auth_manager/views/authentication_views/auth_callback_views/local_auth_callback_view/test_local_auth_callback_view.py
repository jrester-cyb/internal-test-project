# stdlib
from unittest.mock import patch

# django
from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.urls import reverse
from django.utils import timezone

# local
from auth_manager.constants import PROVIDED_EMAIL
from auth_manager.models.identity_provider_models import LocalIdentityProvider

User = get_user_model()


class LocalIdentityProviderAuthenticationCallbackViewTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="admin@test.local", password="", first_name="Admin", last_name="User"
        )
        self.client = Client()
        self.session = self.client.session
        self.local_idp = LocalIdentityProvider.objects.get()

    def test__shows_local_idp_page_when_idp_is_localidentityprovider(self):
        # assign
        self.session.update({PROVIDED_EMAIL: self.user.email})
        self.session.save()

        # act
        response = self.client.get(reverse("auth-manager:auth-callback", args=(self.local_idp.global_id_str,)))

        # assert
        self.assertContains(response, "Login", status_code=200)
        self.assertTemplateUsed(response, "idp_provider_templates/local_idp_provider.html")

    def test__redirects_back_to_login_when_provided_email_is_not_provided(self):
        # act
        response = self.client.get(reverse("auth-manager:auth-callback", args=(self.local_idp.global_id_str,)))

        # assert
        self.assertRedirects(response, reverse("auth-manager:login"))

    def test__successful_login_redirects_to_mfa(self):
        # assign
        self.session.update({PROVIDED_EMAIL: self.user.email})
        self.session.save()
        self.user.set_password("NonSecurePass")
        self.user.save()

        # act
        response = self.client.post(
            reverse("auth-manager:auth-callback", args=(self.local_idp.global_id_str,)),
            {"email": self.user.email, "password": "NonSecurePass"},
        )

        # assert
        self.assertRedirects(response, reverse("auth-manager:mfa"), fetch_redirect_response=False)

    def test__shows_invalid_credentials_msg_when_user_passes_incorrect_password(self):
        # assign
        self.session.update({PROVIDED_EMAIL: self.user.email})
        self.session.save()

        # act
        response = self.client.post(
            reverse("auth-manager:auth-callback", args=(self.local_idp.global_id_str,)),
            {"email": self.user.email, "password": "WrongPass"},
        )

        # assert
        self.assertContains(response, "Invalid username or password", status_code=400)
        self.assertTemplateUsed(response, "idp_provider_templates/local_idp_provider.html")

    def test__shows_locked_account_msg_when_user_is_locked(self):
        # assign
        self.session.update({PROVIDED_EMAIL: self.user.email})
        self.session.save()
        self.user.set_password("NonSecurePass")
        self.user.lock_expiration = timezone.now() + timezone.timedelta(minutes=5)
        self.user.save()

        # act
        response = self.client.post(
            reverse("auth-manager:auth-callback", args=(self.local_idp.global_id_str,)),
            {"email": self.user.email, "password": "NonSecurePass"},
        )

        # assert
        self.assertContains(
            response,
            "This account is locked. Please contact your administrator or try again in 5 minutes.",
            status_code=400,
        )
        self.assertTemplateUsed(response, "idp_provider_templates/local_idp_provider.html")

    @patch("auth_manager.models.identity_provider_models.send_account_lock_email.delay")
    def test__shows_locked_account_msg_when_user_exceeds_failed_login_attempts(self, mock_send_email):
        # assign
        self.session.update({PROVIDED_EMAIL: self.user.email})
        self.session.save()
        self.user.set_password("NonSecurePass")
        self.user.save()

        # act
        for _ in range(5):
            response = self.client.post(
                reverse("auth-manager:auth-callback", args=(self.local_idp.global_id_str,)),
                {"email": self.user.email, "password": "WrongPass"},
            )

        # assert
        self.assertContains(
            response,
            "This account is locked. Please contact your administrator or try again in 5 minutes.",
            status_code=400,
        )
        self.assertTemplateUsed(response, "idp_provider_templates/local_idp_provider.html")
        mock_send_email.assert_called_once_with("Admin", "admin@test.local")
        self.user.refresh_from_db()
        self.assertIsNotNone(self.user.lock_expiration)
