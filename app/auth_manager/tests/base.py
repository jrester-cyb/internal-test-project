# django
from django.contrib.auth import get_user_model
from django.test import TestCase

# thirdparty
from rest_framework.test import APIClient

User = get_user_model()


class ApiClientTestBase(TestCase):
    """Base test class providing authenticated API clients for testing."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        # Create admin user
        cls.admin_user = User.objects.create_superuser(
            email="admin@test.local",
            first_name="Admin",
            last_name="User",
            password="AdminPassword123!",
        )
        # Create regular user
        cls.user = User.objects.create_user(
            email="user@test.local",
            first_name="Regular",
            last_name="User",
            password="UserPassword123!",
        )

    def setUp(self):
        super().setUp()
        # Admin authenticated client
        self.admin_client = APIClient()
        self.admin_client.force_authenticate(user=self.admin_user)

        # Regular user authenticated client
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        # Anonymous/unauthenticated client
        self.anonymous_client = APIClient()
