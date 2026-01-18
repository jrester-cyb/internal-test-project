from __future__ import annotations

import logging
import uuid
from typing import TYPE_CHECKING

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.signing import BadSignature, SignatureExpired, TimestampSigner
from django.db import models

from core.models import SoftDeleteMixin

if TYPE_CHECKING:
    from django.contrib.auth.models import AbstractUser

User = get_user_model()

logger = logging.getLogger(__name__)


class OneTimeTokenQueryset(models.QuerySet):
    def validate_token(
        self, token: str, token_expiration_time=None, consume: bool = True
    ) -> tuple[bool, AbstractUser | None]:
        """
        Validate a one-time token and optionally consume it.

        Args:
            token: The signed token string to validate
            token_expiration_time: Optional custom expiration time in seconds
            consume: If True, delete the token after validation (default).
                     If False, keep the token for subsequent validations.

        Returns:
            tuple: (is_valid, user) where is_valid is a boolean and user is the
                   associated user or None
        """
        signer = TimestampSigner()
        try:
            unsigned_obj = signer.unsign_object(
                token, max_age=token_expiration_time or settings.SHORT_TOKEN_EXPIRATION
            )
            token_id = unsigned_obj.get("code", None)
            try:
                existing_instance = self.get(id=token_id)
            except self.model.DoesNotExist:
                return False, None
            user = existing_instance.user
            if consume:
                existing_instance.delete()  # Invalidate the token after use
            return True, user
        except (BadSignature, SignatureExpired):
            return False, None

    def generate_token(self, user: AbstractUser) -> str:
        signer = TimestampSigner()
        instance = self.model.objects.create(user=user)
        token = signer.sign_object({"code": str(instance.id)})
        return token


class OneTimeTokenManager(models.Manager):
    def get_queryset(self):
        return OneTimeTokenQueryset(self.model, using=self._db).filter(
            deleted_at__isnull=True
        )

    def validate_token(self, token: str, token_expiration_time=None, consume: bool = True):
        return self.get_queryset().validate_token(token, token_expiration_time, consume)

    def generate_token(self, user: AbstractUser) -> str:
        return self.get_queryset().generate_token(user)


class OneTimeToken(SoftDeleteMixin):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="one_time_tokens",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    objects = OneTimeTokenManager()

    class Meta(SoftDeleteMixin.Meta):
        ordering = ["-created_at"]

    def __str__(self):
        return f"OneTimeToken for {self.user} created at {self.created_at}"
