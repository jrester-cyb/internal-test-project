"""
AWS KMS encryption utilities for sensitive data storage.

Provides envelope encryption for database fields:
- Uses KMS to encrypt a data key
- Uses the data key to encrypt the actual data (AES-256-GCM)
- Stores the encrypted data key alongside the ciphertext

This approach is more efficient than encrypting data directly with KMS,
which has a 4KB limit and requires a network call for each operation.
"""

from __future__ import annotations

import base64
import json
import logging
import os
import secrets
from functools import lru_cache
from typing import TYPE_CHECKING

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.conf import settings

if TYPE_CHECKING:
    from mypy_boto3_kms import KMSClient

logger = logging.getLogger(__name__)


class KMSEncryptionError(Exception):
    """Raised when KMS encryption/decryption fails."""

    pass


@lru_cache(maxsize=1)
def get_kms_client() -> "KMSClient":
    """Get a cached KMS client."""
    import boto3

    endpoint_url = getattr(settings, "AWS_KMS_ENDPOINT_URL", None)
    region = getattr(settings, "AWS_REGION", "us-east-1")

    return boto3.client(
        "kms",
        region_name=region,
        endpoint_url=endpoint_url,
    )


def get_kms_key_id() -> str:
    """Get the KMS key ID from settings."""
    key_id = getattr(settings, "AWS_KMS_KEY_ID", None)
    if not key_id:
        raise KMSEncryptionError(
            "AWS_KMS_KEY_ID is not configured in Django settings"
        )
    return key_id


def encrypt_with_kms(plaintext: str, encryption_context: dict[str, str] | None = None) -> str:
    """
    Encrypt plaintext using envelope encryption with AWS KMS.

    Args:
        plaintext: The string to encrypt
        encryption_context: Optional dict of key-value pairs that KMS binds
            cryptographically to the ciphertext. The same context must be
            provided for decryption. Use for per-user or per-tenant isolation.
            Example: {"user_id": "123", "purpose": "mfa_secret"}

    Returns:
        A base64-encoded JSON string containing:
        - encrypted_data_key: The KMS-encrypted data key
        - ciphertext: The AES-GCM encrypted data
        - nonce: The nonce used for AES-GCM
        - context: The encryption context (if provided)

    Raises:
        KMSEncryptionError: If encryption fails
    """
    try:
        kms_client = get_kms_client()
        key_id = get_kms_key_id()

        # Build KMS request
        kms_kwargs = {
            "KeyId": key_id,
            "KeySpec": "AES_256",
        }
        if encryption_context:
            kms_kwargs["EncryptionContext"] = encryption_context

        # Generate a data key using KMS
        response = kms_client.generate_data_key(**kms_kwargs)

        plaintext_key = response["Plaintext"]
        encrypted_key = response["CiphertextBlob"]

        # Use AES-256-GCM to encrypt the data with the plaintext key
        aesgcm = AESGCM(plaintext_key)
        nonce = secrets.token_bytes(12)  # 96-bit nonce for GCM
        ciphertext = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)

        # Get the key ARN from the response (resolved from alias/ID)
        key_arn = response.get("KeyId", key_id)

        # Package everything together
        envelope = {
            "key_id": key_arn,
            "encrypted_data_key": base64.b64encode(encrypted_key).decode("utf-8"),
            "ciphertext": base64.b64encode(ciphertext).decode("utf-8"),
            "nonce": base64.b64encode(nonce).decode("utf-8"),
            "version": 1,
        }

        # Store context in envelope so we know what's needed for decryption
        if encryption_context:
            envelope["context"] = encryption_context

        return base64.b64encode(json.dumps(envelope).encode("utf-8")).decode("utf-8")

    except Exception as e:
        logger.error(f"KMS encryption failed: {e}")
        raise KMSEncryptionError(f"Failed to encrypt data: {e}") from e


def decrypt_with_kms(encrypted_data: str, encryption_context: dict[str, str] | None = None) -> str:
    """
    Decrypt data that was encrypted with encrypt_with_kms.

    Args:
        encrypted_data: The base64-encoded envelope from encrypt_with_kms
        encryption_context: Optional encryption context. If provided, overrides
            the context stored in the envelope. If not provided, uses the
            context from the envelope (if any). Must match exactly what was
            used during encryption or decryption will fail.

    Returns:
        The original plaintext string

    Raises:
        KMSEncryptionError: If decryption fails (including context mismatch)
    """
    try:
        # Unpack the envelope
        envelope = json.loads(base64.b64decode(encrypted_data))

        if envelope.get("version") != 1:
            raise KMSEncryptionError(f"Unknown envelope version: {envelope.get('version')}")

        encrypted_key = base64.b64decode(envelope["encrypted_data_key"])
        ciphertext = base64.b64decode(envelope["ciphertext"])
        nonce = base64.b64decode(envelope["nonce"])
        key_id = envelope.get("key_id")  # May be None for older envelopes

        # Use provided context, or fall back to stored context
        context = encryption_context if encryption_context is not None else envelope.get("context")

        # Decrypt the data key using KMS
        kms_client = get_kms_client()
        decrypt_kwargs = {"CiphertextBlob": encrypted_key}
        if key_id:
            # Passing KeyId is optional but provides extra validation
            # and is required for cross-account decryption
            decrypt_kwargs["KeyId"] = key_id
        if context:
            # Context must match exactly what was used during encryption
            decrypt_kwargs["EncryptionContext"] = context
        response = kms_client.decrypt(**decrypt_kwargs)
        plaintext_key = response["Plaintext"]

        # Decrypt the data using AES-GCM
        aesgcm = AESGCM(plaintext_key)
        plaintext = aesgcm.decrypt(nonce, ciphertext, None)

        return plaintext.decode("utf-8")

    except KMSEncryptionError:
        raise
    except Exception as e:
        logger.error(f"KMS decryption failed: {e}")
        raise KMSEncryptionError(f"Failed to decrypt data: {e}") from e


def is_kms_encrypted(value: str) -> bool:
    """
    Check if a value appears to be KMS-encrypted.

    This is a heuristic check - it tries to decode the envelope structure.
    """
    try:
        envelope = json.loads(base64.b64decode(value))
        return (
            isinstance(envelope, dict)
            and "encrypted_data_key" in envelope
            and "ciphertext" in envelope
            and "nonce" in envelope
            and envelope.get("version") == 1
        )
    except Exception:
        return False
