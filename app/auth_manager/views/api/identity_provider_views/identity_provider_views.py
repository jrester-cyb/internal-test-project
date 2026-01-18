# django
from django.db import transaction

# local
from auth_manager.models import IdentityProvider, LocalIdentityProvider
from auth_manager.serializers import IdentityProviderSerializer

# thirdparty
from rest_framework import viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAdminUser


class IdentityProviderViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing Identity Providers (IdPs).
    Supports create, list, retrieve, update, and delete.
    """

    lookup_field = "id"
    queryset = IdentityProvider.objects.all()
    permission_classes = [IsAdminUser]
    serializer_class = IdentityProviderSerializer

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["detailed"] = True
        return context

    def perform_destroy(self, instance):
        """
        Prevents the user from deleting the LocalIdentityProvider.
        """
        if isinstance(instance, LocalIdentityProvider):
            raise ValidationError("You cannot delete this identity provider.")
        with transaction.atomic():
            super().perform_destroy(instance)
            if IdentityProvider.objects.filter(enabled=True).count() == 0:
                LocalIdentityProvider.objects.all().update(enabled=True)
