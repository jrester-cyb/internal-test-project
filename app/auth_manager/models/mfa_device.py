from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import struct
import time
import uuid
from typing import TYPE_CHECKING

from django.conf import settings
from django.db import models
from polymorphic.models import PolymorphicModel

from core.models.soft_delete import PolymorphicSoftDeleteManager, PolymorphicSoftDeleteMixin
from core.utils.kms import decrypt_with_kms, encrypt_with_kms, is_kms_encrypted

if TYPE_CHECKING:
    from django.contrib.auth.models import AbstractUser

import logging

logger = logging.getLogger(__name__)


class MFADeviceManager(PolymorphicSoftDeleteManager):
    def get_active_for_user(self, user: "AbstractUser"):
        """Get all active (confirmed) MFA devices for a user."""
        return self.filter(user=user, confirmed_at__isnull=False)

    def user_has_mfa(self, user: "AbstractUser") -> bool:
        """Check if a user has at least one confirmed MFA device."""
        return self.get_active_for_user(user).exists()


class MFADevice(PolymorphicModel, PolymorphicSoftDeleteMixin):
    """
    Base TOTP-based MFA device for two-factor authentication.
    Subclasses handle different delivery methods.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="mfa_devices",
    )
    name = models.CharField(
        max_length=100,
        help_text="User-friendly name for this device",
    )
    _encrypted_secret = models.TextField(
        db_column="secret",
        help_text="KMS-encrypted TOTP secret key",
    )
    confirmed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the device was confirmed with a valid code",
    )
    last_used_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Last time this device was used for authentication",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    objects = MFADeviceManager()

    class Meta(PolymorphicSoftDeleteMixin.Meta):
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "name"],
                name="unique_mfa_device_name_per_user",
                condition=models.Q(deleted_at__isnull=True),
            ),
        ]

    def __str__(self):
        status = "confirmed" if self.confirmed_at else "pending"
        return f"MFA Device '{self.name}' for {self.user} ({status})"

    @property
    def delivery_method(self) -> str:
        """Return the delivery method identifier. Override in subclasses."""
        raise NotImplementedError

    @property
    def delivery_method_display(self) -> str:
        """Return human-readable delivery method. Override in subclasses."""
        raise NotImplementedError

    @property
    def requires_code_delivery(self) -> bool:
        """Check if this device requires sending the code (SMS/email vs app)."""
        return False

    def get_masked_destination(self) -> str | None:
        """Get a masked version of the delivery destination. Override in subclasses."""
        return None

    def _get_encryption_context(self) -> dict[str, str]:
        """
        Get the encryption context for KMS operations.
        Binds the encrypted data to the user and device, preventing decryption
        with a different context.
        """
        return {
            "user_id": str(self.user_id),
            "device_id": str(self.id),
            "purpose": "mfa_secret",
        }

    @property
    def secret(self) -> str:
        """
        Get the decrypted TOTP secret.
        Handles both KMS-encrypted and legacy plaintext secrets.
        """
        if not self._encrypted_secret:
            return ""

        # Check if this is a KMS-encrypted value
        if is_kms_encrypted(self._encrypted_secret):
            # Context is stored in envelope, but we verify it matches
            return decrypt_with_kms(self._encrypted_secret)

        # Legacy plaintext secret (for migration compatibility)
        return self._encrypted_secret

    @secret.setter
    def secret(self, value: str):
        """
        Set and encrypt the TOTP secret using KMS with user-bound context.
        If KMS is not configured, stores plaintext (for development).
        """
        if not value:
            self._encrypted_secret = ""
            return

        # Try to encrypt with KMS using user-specific context
        try:
            context = self._get_encryption_context()
            self._encrypted_secret = encrypt_with_kms(value, encryption_context=context)
        except Exception as e:
            # If KMS is not available (e.g., local dev), store plaintext
            # Log warning so this doesn't go unnoticed in production
            logger.warning(f"KMS encryption unavailable, storing secret in plaintext: {e}")
            self._encrypted_secret = value

    def save(self, *args, **kwargs):
        if not self._encrypted_secret:
            self.secret = self.generate_secret()
        super().save(*args, **kwargs)

    def send_code(self) -> str:
        """
        Generate and send a TOTP code via the configured delivery method.
        Returns the code. Override in subclasses that need to send codes.
        """
        return self.generate_totp()

    @staticmethod
    def generate_secret() -> str:
        """Generate a random base32-encoded secret for TOTP."""
        random_bytes = secrets.token_bytes(20)
        return base64.b32encode(random_bytes).decode("utf-8")

    def get_totp_uri(self, issuer: str = None) -> str:
        """
        Generate an otpauth:// URI for QR code generation.
        Can be scanned by authenticator apps.
        """
        issuer = issuer or getattr(settings, "MFA_ISSUER", "MyApp")
        account_name = self.user.email or self.user.username
        return (
            f"otpauth://totp/{issuer}:{account_name}"
            f"?secret={self.secret}"
            f"&issuer={issuer}"
            f"&algorithm=SHA1"
            f"&digits=6"
            f"&period=30"
        )

    def generate_totp(self, timestamp: int = None) -> str:
        """
        Generate a TOTP code for the current (or given) time.
        """
        if timestamp is None:
            timestamp = int(time.time())

        # TOTP uses 30-second intervals
        time_step = timestamp // 30

        # Decode the base32 secret
        key = base64.b32decode(self.secret, casefold=True)

        # Pack the time step as a big-endian 64-bit integer
        msg = struct.pack(">Q", time_step)

        # Generate HMAC-SHA1
        hmac_hash = hmac.new(key, msg, hashlib.sha1).digest()

        # Dynamic truncation
        offset = hmac_hash[-1] & 0x0F
        truncated = struct.unpack(">I", hmac_hash[offset : offset + 4])[0]
        truncated &= 0x7FFFFFFF

        # Get 6-digit code
        code = truncated % 1000000
        return f"{code:06d}"

    def verify_totp(self, code: str, tolerance: int = 1) -> bool:
        """
        Verify a TOTP code against the device's secret.

        Args:
            code: The 6-digit code to verify
            tolerance: Number of 30-second intervals to check before/after current time

        Returns:
            True if the code is valid, False otherwise
        """
        if not code or len(code) != 6 or not code.isdigit():
            return False

        current_time = int(time.time())

        # Check current time step and tolerance window
        for offset in range(-tolerance, tolerance + 1):
            check_time = current_time + (offset * 30)
            expected_code = self.generate_totp(check_time)
            if hmac.compare_digest(code, expected_code):
                return True

        return False

    def confirm(self, code: str) -> bool:
        """
        Confirm the device by verifying the initial code.
        """
        if self.confirmed_at:
            return True  # Already confirmed

        if self.verify_totp(code):
            from django.utils import timezone

            self.confirmed_at = timezone.now()
            self.save(update_fields=["confirmed_at"])
            return True
        return False

    def authenticate(self, code: str) -> bool:
        """
        Authenticate using this device.
        Only works for confirmed devices.
        Updates last_used_at on success.
        """
        if not self.confirmed_at:
            return False

        if self.verify_totp(code):
            from django.utils import timezone

            self.last_used_at = timezone.now()
            self.save(update_fields=["last_used_at"])
            return True
        return False

    @property
    def is_confirmed(self) -> bool:
        return self.confirmed_at is not None


class TOTPDevice(MFADevice):
    """
    Authenticator app-based MFA device.
    User scans QR code and generates codes in their app.
    """

    class Meta:
        verbose_name = "TOTP Device"
        verbose_name_plural = "TOTP Devices"

    def save(self, *args, **kwargs):
        if not self.name:
            self.name = "Authenticator App"
        super().save(*args, **kwargs)

    @property
    def delivery_method(self) -> str:
        return "app"

    @property
    def delivery_method_display(self) -> str:
        return "Authenticator App"


class SMSDevice(MFADevice):
    """
    SMS-based MFA device.
    Codes are sent via SMS to the configured phone number.
    """

    phone_number = models.CharField(
        max_length=20,
        help_text="Phone number for SMS delivery (E.164 format)",
    )

    class Meta:
        verbose_name = "SMS Device"
        verbose_name_plural = "SMS Devices"

    def save(self, *args, **kwargs):
        if not self.name:
            self.name = f"SMS ({self.get_masked_destination()})"
        super().save(*args, **kwargs)

    @property
    def delivery_method(self) -> str:
        return "sms"

    @property
    def delivery_method_display(self) -> str:
        return "SMS"

    @property
    def requires_code_delivery(self) -> bool:
        return True

    def get_masked_destination(self) -> str | None:
        """Show last 4 digits: ***-***-1234"""
        if self.phone_number and len(self.phone_number) >= 4:
            return f"***-***-{self.phone_number[-4:]}"
        return "***"

    def send_code(self) -> str:
        """Generate and send a TOTP code via SMS."""
        code = self.generate_totp()
        self._send_sms(code)
        return code

    def _send_sms(self, code: str):
        """Send the code via SMS. Configure SMS provider as needed."""
        # TODO: Integrate with SMS provider (Twilio, AWS SNS, etc.)
        import logging

        logger = logging.getLogger(__name__)
        logger.info(f"MFA code {code} would be sent to {self.phone_number}")


class BackupCode(models.Model):
    """
    Single-use backup codes for MFA recovery.
    Generated when MFA is enabled, can be used if the user loses their device.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="mfa_backup_codes",
    )
    code_hash = models.CharField(
        max_length=64,
        help_text="SHA-256 hash of the backup code",
    )
    used_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When this code was used",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        status = "used" if self.used_at else "available"
        return f"Backup code for {self.user} ({status})"

    @staticmethod
    def generate_code() -> str:
        """Generate a random 8-character alphanumeric backup code."""
        return secrets.token_hex(4).upper()  # 8 hex characters

    @staticmethod
    def hash_code(code: str) -> str:
        """Hash a backup code for secure storage."""
        return hashlib.sha256(code.encode()).hexdigest()

    @classmethod
    def generate_codes_for_user(cls, user: "AbstractUser", count: int = 10) -> list[str]:
        """
        Generate a set of backup codes for a user.
        Returns the plaintext codes (only time they're visible).
        Deletes any existing unused codes first.
        """
        # Delete existing unused codes
        cls.objects.filter(user=user, used_at__isnull=True).delete()

        plaintext_codes = []
        for _ in range(count):
            code = cls.generate_code()
            plaintext_codes.append(code)
            cls.objects.create(user=user, code_hash=cls.hash_code(code))

        return plaintext_codes

    @classmethod
    def verify_code(cls, user: "AbstractUser", code: str) -> bool:
        """
        Verify and consume a backup code.
        Returns True if valid, False otherwise.
        """
        code_hash = cls.hash_code(code.upper().replace("-", "").replace(" ", ""))

        try:
            backup_code = cls.objects.get(
                user=user, code_hash=code_hash, used_at__isnull=True
            )
        except cls.DoesNotExist:
            return False

        from django.utils import timezone

        backup_code.used_at = timezone.now()
        backup_code.save(update_fields=["used_at"])
        return True

    @classmethod
    def get_remaining_count(cls, user: "AbstractUser") -> int:
        """Get the number of unused backup codes for a user."""
        return cls.objects.filter(user=user, used_at__isnull=True).count()
