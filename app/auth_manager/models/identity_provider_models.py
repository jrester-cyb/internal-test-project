from __future__ import annotations

import logging
import uuid
from datetime import timedelta
from typing import TYPE_CHECKING

from django.conf import settings
from django.contrib.auth import authenticate as sys_authenticate
from django.contrib.auth import get_user_model, login
from django.contrib.postgres.fields import ArrayField
from django.core.signing import BadSignature, Signer
from django.db import models, transaction
from django.http import HttpRequest
from django.urls import reverse
from django.utils import timezone
from onelogin.saml2.auth import OneLogin_Saml2_Auth
from onelogin.saml2.settings import OneLogin_Saml2_Settings
from polymorphic.models import PolymorphicModel
from rest_framework import serializers

from core.models.soft_delete import PolymorphicSoftDeleteMixin, SoftDeleteMixin

if TYPE_CHECKING:
    from django.contrib.auth.models import AbstractUser

User = get_user_model()

logger = logging.getLogger(__name__)

# Constants for session keys
AUTH_METHOD = "auth_method"
PROVIDED_EMAIL = "provided_email"
REDIRECT_URI = "redirect_uri"
MULTIFACTOR_SESSION_KEY = "multifactor_verified"


class BadRequest(Exception):
    """Raised when a bad request is made."""

    pass


class IncorrectCredentials(Exception):
    """Raised when credentials are incorrect."""

    pass


class LockedAccount(Exception):
    """Raised when an account is locked."""

    pass


class UserAlreadyLinked(Exception):
    """Raised when a user is already linked to an identity provider."""

    pass


def _prepare_django_request(request):
    return {
        "https": "on" if request.is_secure() else "off",
        "http_host": request.get_host(),
        "script_name": request.path,
        "get_data": request.GET.copy(),
        "post_data": request.POST.copy(),
    }


class IdentityProviderUserManager(models.Manager):
    def get_queryset(self):
        return super().get_queryset().filter(deleted_at__isnull=True)


class IdentityProviderUser(SoftDeleteMixin):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    identity_provider = models.ForeignKey(
        "auth_manager.IdentityProvider",
        on_delete=models.CASCADE,
        related_name="identity_provider_users",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="identity_provider_links",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    objects = IdentityProviderUserManager()

    class Meta(SoftDeleteMixin.Meta):
        constraints = [
            models.UniqueConstraint(
                fields=["identity_provider", "user"],
                name="unique_identity_provider_user",
                condition=models.Q(deleted_at__isnull=True),
            ),
        ]

    def clean(self):
        # Prevent linking a user to more than one IdentityProvider
        existing = IdentityProviderUser.objects.filter(user=self.user).exclude(
            identity_provider=self.identity_provider
        )
        if existing.exists():
            raise UserAlreadyLinked()

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.user} linked to {self.identity_provider}"


class IdentityProvider(PolymorphicModel, PolymorphicSoftDeleteMixin):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    system_users = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        through="auth_manager.IdentityProviderUser",
        related_name="identity_providers",
        blank=True,
        help_text="System users associated with this identity provider.",
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, help_text="Optional description for this IdP")
    enabled = models.BooleanField(default=True)
    domains = ArrayField(
        base_field=models.CharField(max_length=255),
        default=list,
        help_text="List of email domains (e.g. ['example.com', 'test.com'])",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta(PolymorphicSoftDeleteMixin.Meta):
        constraints = [
            models.UniqueConstraint(
                fields=["name"],
                name="unique_identity_provider_name",
                condition=models.Q(deleted_at__isnull=True),
            ),
        ]
        ordering = ["name"]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        # Prevent disabling if no other enabled IdP exists
        if self.pk and not self.enabled:
            other_enabled = (
                IdentityProvider.objects.exclude(pk=self.pk).filter(enabled=True).exists()
            )
            if not other_enabled:
                raise ValueError(
                    "You cannot disable this identity provider unless another identity provider is enabled."
                )

        # Confirm that the domains in this IdP do not overlap with other IdPs
        if self.domains:
            overlapping_idps = IdentityProvider.objects.exclude(pk=self.pk).filter(
                domains__overlap=self.domains
            )
            if overlapping_idps.exists():
                raise ValueError(
                    "One or more domains are already in use by another identity provider."
                )

        super().save(*args, **kwargs)

    def authenticate(self, _: HttpRequest) -> AbstractUser:
        raise NotImplementedError("This method should be implemented by subclasses.")

    def login(self, request, skip_mfa=False):
        from .user_session import UserSession

        user = self.authenticate(request)
        login(request, user)

        # Create session record with request metadata
        UserSession.objects.create_from_request(user, request)

        if skip_mfa:
            request.session[MULTIFACTOR_SESSION_KEY] = True

    def generate_redirect_link(self, _request: HttpRequest) -> str:
        return reverse("auth-manager:login")


class FailedLoginAttempt(SoftDeleteMixin):
    """Tracks failed login attempts for rate limiting."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="failed_login_attempts",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta(SoftDeleteMixin.Meta):
        ordering = ["-created_at"]

    def __str__(self):
        return f"Failed login for {self.user} at {self.created_at}"


class LocalIdentityProvider(IdentityProvider):
    def _log_failed_login_attempt(self, *, user: AbstractUser):
        """Save a failed login attempt and raise an exception if locked."""
        FailedLoginAttempt.objects.create(user=user)

        # Check if the user should be locked out (5 failed attempts in 5 minutes)
        recent_failures = FailedLoginAttempt.objects.filter(
            user=user, created_at__gte=timezone.now() - timedelta(minutes=5)
        ).count()

        if recent_failures >= 5:
            user.lock_expiration = timezone.now() + timedelta(minutes=5)
            user.save(update_fields=["lock_expiration"])

            if not user.identity_providers.exists():
                # TODO: Send account lock email
                pass
            raise LockedAccount()
        else:
            raise IncorrectCredentials()

    def save(self, *args, **kwargs):
        # Enforce singleton instance for LocalIdentityProvider
        if not self.pk and LocalIdentityProvider.objects.exists():
            raise ValueError("Only one LocalIdentityProvider instance is allowed.")
        super().save(*args, **kwargs)

    def authenticate(self, request: HttpRequest) -> AbstractUser:
        email = request.POST.get("email")
        password = request.POST.get("password")

        try:
            existing_user = User.objects.get(email=email)
        except User.DoesNotExist:
            raise IncorrectCredentials()

        # Check if existing user is locked
        if (
            existing_user.lock_expiration is not None
            and existing_user.lock_expiration > timezone.now()
        ):
            raise LockedAccount()

        user = sys_authenticate(email=email, password=password)

        if user is None:
            self._log_failed_login_attempt(user=existing_user)

        # Clear lock expiration on successful login
        user.lock_expiration = None
        user.save(update_fields=["lock_expiration"])

        return user


class SAMLResponseSerializer(serializers.Serializer):
    SAMLResponse = serializers.CharField(required=True)


class SAMLAttributeSerializer(serializers.Serializer):
    email = serializers.EmailField(
        required=True,
        error_messages={"required": "A valid email address is required."},
    )
    first_name = serializers.CharField(
        required=True,
        error_messages={
            "required": "First name is required.",
            "blank": "First name cannot be blank.",
        },
    )
    last_name = serializers.CharField(
        required=True,
        error_messages={
            "required": "Last name is required.",
            "blank": "Last name cannot be blank.",
        },
    )


class SAMLIdentityProvider(IdentityProvider):
    allow_autoenrollment = models.BooleanField(
        default=True,
        help_text="If true, users can be automatically created from SAML assertions.",
    )
    entity_id = models.CharField(max_length=512)
    sso_url = models.URLField()
    x509_cert = models.TextField()
    metadata_url = models.URLField(blank=True)
    attribute_mappings = models.JSONField(
        default=dict,
        blank=True,
        help_text="Mapping of IdP attributes to user fields.",
    )

    def get_saml_settings(self, request=None) -> OneLogin_Saml2_Settings:
        callback_url = reverse("auth-manager:auth-callback", args=(str(self.id),))
        if request:
            callback_url = request.build_absolute_uri(callback_url)

        return OneLogin_Saml2_Settings(
            settings={
                "strict": True,
                "sp": {
                    "entityId": self.entity_id,
                    "assertionConsumerService": {
                        "url": callback_url,
                        "binding": "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
                    },
                    "NameIDFormat": "urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified",
                },
                "idp": {
                    "entityId": self.sso_url,
                    "singleSignOnService": {
                        "url": self.sso_url,
                        "binding": "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
                    },
                    "x509cert": self.x509_cert,
                },
                "security": {
                    "requestedAuthnContext": False,
                    "signatureAlgorithm": "https://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
                    "digestAlgorithm": "https://www.w3.org/2001/04/xmlenc#sha256",
                },
            },
            custom_base_path=None,
        )

    def get_relay_state(self, request: HttpRequest) -> dict | None:
        relay_state = request.POST.get("RelayState")
        if not relay_state:
            return None
        signer = Signer()
        try:
            return signer.unsign_object(relay_state)
        except BadSignature:
            return None

    def set_session_relay_state(self, relay_state: dict | None, request: HttpRequest):
        if relay_state:
            request.session[REDIRECT_URI] = relay_state.get("redirect_uri", "/")
            request.session[AUTH_METHOD] = relay_state.get("auth_method", "c")
            request.session[PROVIDED_EMAIL] = relay_state.get("requesting_email", None)

    def authenticate(self, request: HttpRequest) -> AbstractUser:
        serializer = SAMLResponseSerializer(data=request.POST)
        serializer.is_valid(raise_exception=True)

        saml_settings = self.get_saml_settings(request)
        saml_auth = OneLogin_Saml2_Auth(_prepare_django_request(request), saml_settings)

        try:
            saml_auth.process_response()
        except Exception as e:
            raise IncorrectCredentials(f"SAML authentication failed: {str(e)}")

        errors = saml_auth.get_errors()
        if errors:
            raise BadRequest(f"SAML authentication errors: {errors}")

        if not saml_auth.is_authenticated():
            raise IncorrectCredentials("SAML authentication failed.")

        saml_attrs = saml_auth.get_attributes()
        if not saml_attrs:
            raise BadRequest("No SAML attributes returned.")

        attribute_mappings = {
            "email": "Email",
            "first_name": "FirstName",
            "last_name": "LastName",
            **self.attribute_mappings,
        }
        user_data = {}
        for user_field, saml_field in attribute_mappings.items():
            values = saml_attrs.get(saml_field)
            if values:
                user_data[user_field] = values[0]

        attribute_serializer = SAMLAttributeSerializer(data=user_data)
        attribute_serializer.is_valid(raise_exception=True)
        validated_data = attribute_serializer.validated_data
        relay_state = self.get_relay_state(request)

        with transaction.atomic():
            provided_email = relay_state.get("requesting_email") if relay_state else None
            if (
                provided_email
                and provided_email.lower().strip() != validated_data["email"].lower().strip()
            ):
                raise BadRequest(
                    "The email provided from your identity provider does not match the email you provided."
                )

            try:
                user = User.objects.get(email=validated_data["email"])
            except User.DoesNotExist:
                if not self.allow_autoenrollment:
                    raise BadRequest("User is not allowed to access the system.")
                user = User.objects.create(**validated_data)

            _, created = IdentityProviderUser.objects.get_or_create(
                identity_provider=self, user=user
            )

            user.lock_expiration = None
            update_fields = ["lock_expiration"]

            if created:
                user.set_unusable_password()
                update_fields.append("password")
            user.save(update_fields=update_fields)

        self.set_session_relay_state(relay_state, request)
        return user

    def generate_redirect_link(self, request: HttpRequest) -> str:
        saml_settings = self.get_saml_settings(request)
        saml_request_dict = _prepare_django_request(request)
        saml_auth = OneLogin_Saml2_Auth(saml_request_dict, old_settings=saml_settings)

        return_to_payload = {
            "redirect_uri": request.session.get(REDIRECT_URI, "/"),
            "auth_method": request.session.get(AUTH_METHOD, "c"),
            "requesting_email": request.session.get(PROVIDED_EMAIL),
        }
        signer = Signer()
        signed_obj = signer.sign_object(return_to_payload)
        redirect_url = saml_auth.login(return_to=signed_obj)

        return redirect_url
