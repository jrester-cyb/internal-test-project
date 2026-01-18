# django
from django.contrib.auth import get_user_model
from django.test import Client, TestCase

# local
from auth_manager.models import LocalIdentityProvider
from django.urls import reverse
from auth_manager.test import Client as MFAClient

User = get_user_model()


class LoginFinalizeViewTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="admin@test.local", first_name="Admin", last_name="User", password="Secure!"
        )
        self.local_idp = LocalIdentityProvider.objects.get()
        self.client = Client()
        self.mfa_client = MFAClient()
        self.mfa_client.force_login(self.user)
        self.mfa_session = self.mfa_client.session

    def test__get_finalize_redirects_back_to_login_page_when_user_is_inauthenticated(self):
        # act
        response = self.client.get(reverse("auth-manager:finalize"))

        # assert
        self.assertRedirects(response, reverse("auth-manager:login"), fetch_redirect_response=False)

    def test__get_finalize_redirects_back_to_mfa_page_when_user_is_authenticated_but_not_mfa_confirmed(self):
        # assign
        self.client.force_login(self.user)

        # act
        response = self.client.get(reverse("auth-manager:finalize"))

        # assert
        self.assertRedirects(response, reverse("auth-manager:mfa"), fetch_redirect_response=False)

    def test__get_finalize_redirects_to_root_and_no_redirect_uri_is_provided_when_user_is_authenticated_and_mfa_confirmed(
        self,
    ):
        # assign
        self.mfa_client.force_login(self.user)

        # act
        response = self.mfa_client.get(reverse("auth-manager:finalize"))

        # assert
        self.assertRedirects(response, "/", fetch_redirect_response=False)

    def test__get_finalize_redirects_to_provided_redirect_uri_when_user_is_authenticated_and_mfa_confirmed(self):
        # assign
        redirect_uri = "http://test.local"
        self.mfa_session.update({"redirect_uri": redirect_uri})
        self.mfa_session.save()

        # act
        response = self.mfa_client.get(reverse("auth-manager:finalize"))

        # assert
        self.assertRedirects(response, redirect_uri, fetch_redirect_response=False)

    def test__get_finalize_redirects_to_provided_redirect_uri_with_token_when_user_is_authenticated_and_mfa_confirmed_and_method_is_token(
        self,
    ):
        # assign
        redirect_uri = "powerview://finalize_auth"
        self.mfa_session.update({"redirect_uri": redirect_uri, "auth_method": "t"})
        self.mfa_session.save()

        # act
        response = self.mfa_client.get(reverse("auth-manager:finalize"))

        # assert
        self.assertTrue(response.url.startswith(f"{redirect_uri}?t="))
