# django
from django.contrib.auth import get_user_model

# local
from auth_manager.models import LocalIdentityProvider, SAMLIdentityProvider
from mainapp.tests.base import BaseTests
from mainapp.utils import reverse

# thirdparty
from rest_framework import status

User = get_user_model()


class IdentityProviderViewSetTests(BaseTests.ApiClientTestBase):
    list_url = reverse("auth-manager-api:identity-provider-list")

    def test_cannot_delete_only_enabled_local_idp(self):
        # Use the LocalIdentityProvider created by migrations
        local = LocalIdentityProvider.objects.first()
        self.assertIsNotNone(local, "Expected a LocalIdentityProvider to exist from migrations.")
        delete_url = reverse("auth-manager-api:identity-provider-detail", args=(local.global_id,))
        response = self.admin_client.delete(delete_url)
        # Should not allow deletion if it's the only enabled IdP
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("You cannot delete this identity provider.", str(response.data))

    def test_create_saml_idp_works_as_expected(self):
        data = {
            "type": "saml",
            "name": "SAML Provider",
            "description": "SAML login",
            "enabled": True,
            "domains": ["saml.com"],
            "entity_id": "https://idp.example.com/entity",
            "sso_url": "https://idp.example.com/sso",
            "x509_cert": "CERTDATA",
            "metadata_url": "https://idp.example.com/metadata",
            "attribute_mappings": {"email": "EmailAddress"},
        }
        response = self.admin_client.post(self.list_url, data, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["type"], "saml")
        self.assertEqual(response.data["name"], "SAML Provider")
        self.assertEqual(response.data["entity_id"], "https://idp.example.com/entity")
        self.assertEqual(response.data["sso_url"], "https://idp.example.com/sso")
        self.assertEqual(response.data["x509_cert"], "CERTDATA")
        self.assertEqual(response.data["metadata_url"], "https://idp.example.com/metadata")
        self.assertEqual(response.data["attribute_mappings"], {"email": "EmailAddress"})

    def test_can_disable_local_idp_if_another_enabled(self):
        # Use the LocalIdentityProvider created by migrations
        local = LocalIdentityProvider.objects.first()
        self.assertIsNotNone(local, "Expected a LocalIdentityProvider to exist from migrations.")
        # Create a SAML IdP
        saml_data = {
            "type": "saml",
            "name": "SAML Provider",
            "description": "SAML login",
            "enabled": True,
            "domains": ["saml.com"],
            "entity_id": "https://idp.example.com/entity",
            "sso_url": "https://idp.example.com/sso",
            "x509_cert": "CERTDATA",
            "metadata_url": "https://idp.example.com/metadata",
            "attribute_mappings": {"email": "EmailAddress"},
        }
        saml_response = self.admin_client.post(self.list_url, saml_data, format="json")
        self.assertEqual(saml_response.status_code, status.HTTP_201_CREATED)
        # Now disable the local IdP
        patch_url = reverse("auth-manager-api:identity-provider-detail", args=(local.global_id,))
        patch_response = self.admin_client.patch(patch_url, {"enabled": False}, format="json")
        self.assertEqual(patch_response.status_code, status.HTTP_200_OK)
        self.assertFalse(patch_response.data["enabled"])

    def test_cannot_create_multiple_local_idps(self):
        # Attempt to create a second LocalIdentityProvider
        data2 = {
            "type": "local",
            "name": "Local Provider 2",
            "description": "Local login 2",
            "enabled": True,
            "domains": ["test2.com"],
        }
        response2 = self.admin_client.post(self.list_url, data2, format="json")
        self.assertEqual(response2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Only one LocalIdentityProvider instance is allowed.", str(response2.data))

    def test_attempting_to_disable_local_idp_does_not_work_without_another_idp(self):
        local_idp = LocalIdentityProvider.objects.first()
        response = self.admin_client.patch(
            reverse(
                "auth-manager-api:identity-provider-detail",
                args=(local_idp.global_id,),
            ),
            {"enabled": False},
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn(
            "You cannot disable this identity provider unless another identity provider is enabled.",
            response.data["non_field_errors"],
        )

    def test_attempt_to_disable_any_idp_does_not_work_without_another_idp(self):
        # assign
        saml_idp = SAMLIdentityProvider.objects.create(
            name="SAML Provider",
            entity_id="https://idp.example.com/entity",
            sso_url="https://idp.example.com/sso",
            x509_cert="CERTDATA",
            enabled=True,
        )
        SAMLIdentityProvider.objects.create(
            name="SAML2 Provider",
            entity_id="https://idp2.example.com/entity",
            sso_url="https://idp2.example.com/sso",
            x509_cert="CERTDATA2",
            enabled=False,
        )
        local_idp = LocalIdentityProvider.objects.first()
        local_idp.enabled = False
        local_idp.save()

        # act
        response = self.admin_client.patch(
            reverse(
                "auth-manager-api:identity-provider-detail",
                args=(saml_idp.global_id,),
            ),
            {"enabled": False},
        )

        # assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_deleting_an_idp_reenables_local_idp_if_no_other_enabled_idps(self):
        # assign
        saml_idp = SAMLIdentityProvider.objects.create(
            name="SAML Provider",
            entity_id="https://idp.example.com/entity",
            sso_url="https://idp.example.com/sso",
            x509_cert="CERTDATA",
            enabled=True,
        )
        local_idp = LocalIdentityProvider.objects.first()
        local_idp.enabled = False
        local_idp.save()

        # act
        response = self.admin_client.delete(
            reverse(
                "auth-manager-api:identity-provider-detail",
                args=(saml_idp.global_id,),
            )
        )
        local_idp.refresh_from_db()

        # assert
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertTrue(local_idp.enabled)

    def test_create_of_saml_always_requires_specific_fields(self):
        """
        Note: This is a regression test to prevent a bug where users can
        create a SAML IdP without the required fields on the first try.
        """

        # act
        response = self.admin_client.post(
            reverse("auth-manager-api:identity-provider-list"),
            {
                "type": "saml",
                "name": "SAML Provider",
                "description": "SAML login",
                "domains": [],
                "enabled": True,
            },
            format="json",
        )
        response_2 = self.admin_client.post(
            reverse("auth-manager-api:identity-provider-list"),
            {
                "type": "saml",
                "name": "SAML Provider2",
                "description": "SAML login",
                "domains": [],
                "enabled": True,
            },
            format="json",
        )

        # assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response_2.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cannot_create_saml_with_same_domain_as_existing_idp(self):
        # assign
        SAMLIdentityProvider.objects.create(
            name="SAML Provider",
            entity_id="https://idp.example.com/entity",
            sso_url="https://idp.example.com/sso",
            x509_cert="CERTDATA",
            enabled=True,
            domains=["example.com"],
        )

        # act
        response = self.admin_client.post(
            reverse("auth-manager-api:identity-provider-list"),
            {
                "type": "saml",
                "name": "SAML Provider 2",
                "description": "SAML login 2",
                "domains": ["example.com"],
                "entity_id": "https://idp2.example.com/entity",
                "sso_url": "https://idp2.example.com/sso",
                "x509_cert": "CERTDATA2",
                "enabled": True,
            },
            format="json",
        )

        # assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["domains"][0], "One or more domains are already in use by another identity provider."
        )

    def test_cannot_update_idp_to_have_same_domain_as_existing_idp(self):
        # assign
        idp1 = SAMLIdentityProvider.objects.create(
            name="SAML Provider",
            entity_id="https://idp.example.com/entity",
            sso_url="https://idp.example.com/sso",
            x509_cert="CERTDATA",
            enabled=True,
            domains=["example.com"],
        )
        idp2 = SAMLIdentityProvider.objects.create(
            name="SAML Provider 2",
            entity_id="https://idp2.example.com/entity",
            sso_url="https://idp2.example.com/sso",
            x509_cert="CERTDATA2",
            enabled=True,
            domains=["example2.com"],
        )

        # act
        response = self.admin_client.patch(
            reverse("auth-manager-api:identity-provider-detail", args=(idp2.global_id,)),
            {"domains": ["example.com"]},
            format="json",
        )

        # assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["domains"][0], "One or more domains are already in use by another identity provider."
        )

    def test_cannot_send_dupliate_domains_in_idp_create(self):
        response = self.admin_client.post(
            reverse("auth-manager-api:identity-provider-list"),
            {
                "type": "saml",
                "name": "SAML Provider",
                "description": "SAML login",
                "domains": ["example.com", "example.com"],
                "entity_id": "https://idp.example.com/entity",
                "sso_url": "https://idp.example.com/sso",
                "x509_cert": "CERTDATA",
                "enabled": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Duplicate domain found: example.com", str(response.data))

    def test_update_idp_with_duplicate_domains_fails(self):
        # assign
        idp = SAMLIdentityProvider.objects.create(
            name="SAML Provider",
            entity_id="https://idp.example.com/entity",
            sso_url="https://idp.example.com/sso",
            x509_cert="CERTDATA",
            enabled=True,
            domains=["example.com"],
        )

        # act
        response = self.admin_client.patch(
            reverse("auth-manager-api:identity-provider-detail", args=(idp.global_id,)),
            {"domains": ["example.com", "example.com"]},
            format="json",
        )

        # assert
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Duplicate domain found: example.com", str(response.data))

    def test_non_admin_cannot_access_idp_endpoints(self):
        # assign
        local = LocalIdentityProvider.objects.first()
        detail_url = reverse("auth-manager-api:identity-provider-detail", args=(local.global_id,))

        # act
        list_response = self.client.get(self.list_url)
        list_create_response = self.client.post(self.list_url, {}, format="json")
        detail_response = self.client.get(detail_url)
        detail_patch_response = self.client.patch(detail_url, {}, format="json")
        detail_delete_response = self.client.delete(detail_url)

        # assert
        self.assertEqual(list_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(list_create_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(detail_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(detail_patch_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(detail_delete_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_update_saml_idp_with_new_attributes(self):
        # assign
        idp = SAMLIdentityProvider.objects.create(
            name="SAML Provider",
            entity_id="https://idp.example.com/entity",
            sso_url="https://idp.example.com/sso",
            x509_cert="CERTDATA",
            enabled=True,
            domains=["example.com"],
            attribute_mappings={"email": "EmailAddress"},
        )

        # act
        response = self.admin_client.patch(
            reverse("auth-manager-api:identity-provider-detail", args=(idp.global_id,)),
            {"attribute_mappings": {"email": "EmailAddress", "first_name": "FirstName"}},
            format="json",
        )

        # assert
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["attribute_mappings"]["email"], "EmailAddress")
        self.assertEqual(response.data["attribute_mappings"]["first_name"], "FirstName")
