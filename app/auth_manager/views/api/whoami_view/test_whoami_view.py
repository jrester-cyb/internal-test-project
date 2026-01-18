# django
from django.urls import reverse

# local
from auth_manager.tests.base import ApiClientTestBase

# thirdparty
from rest_framework import status


class WhoAmIViewTestCase(ApiClientTestBase):

    def test__whoami_view_returns_expected_user_when_authenticated(self):
        # act
        response = self.admin_client.get(reverse("auth-manager-api:whoami"))

        # assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["global_id"], self.admin_user.global_id_str)

    def test__whoami_view_returns_expected_response_when_not_authenticated(self):
        # act
        response = self.anonymous_client.get(reverse("auth-manager-api:whoami"))

        # assert
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
