# django
from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.urls import reverse

User = get_user_model()


class LogoutViewTestCase(TestCase):

    def setUp(self):
        self.url = reverse("auth-manager:logout")
        self.user = User.objects.create_user(
            email="admin@test.local", first_name="Admin", last_name="User", password=""
        )
        self.client = Client()
        self.client.force_login(self.user)

    def test__post_to_logout_view_redirects_to_login_page(self):
        # act
        response = self.client.post(self.url)

        # assert
        self.assertRedirects(response, reverse("auth-manager:login"), fetch_redirect_response=False)
