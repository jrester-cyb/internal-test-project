from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone

from core.models import SoftDeleteMixin


class UserSessionManager(models.Manager):
    def get_queryset(self):
        return super().get_queryset().filter(deleted_at__isnull=True)

    def create_from_request(self, user, request) -> "UserSession":
        """
        Create a new session record from a Django request object.
        Extracts IP address, user agent, and other metadata.
        """
        ip_address = self._get_client_ip(request)
        user_agent = request.META.get("HTTP_USER_AGENT", "")[:500]

        return self.create(
            user=user,
            session_key=request.session.session_key,
            ip_address=ip_address,
            user_agent=user_agent,
        )

    def _get_client_ip(self, request) -> str | None:
        """Extract the client IP address from the request."""
        x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
        if x_forwarded_for:
            # X-Forwarded-For can contain multiple IPs; the first is the client
            return x_forwarded_for.split(",")[0].strip()
        return request.META.get("REMOTE_ADDR")

    def get_active_sessions(self, user):
        """Get all active (non-expired, non-logged-out) sessions for a user."""
        return self.filter(user=user, logged_out_at__isnull=True)


class UserSession(SoftDeleteMixin):
    """
    Tracks user login sessions with metadata for security auditing.
    Each successful login creates a session record.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="sessions",
    )

    # Session identification
    session_key = models.CharField(
        max_length=40,
        blank=True,
        null=True,
        help_text="Django session key, if available",
    )

    # Network information
    ip_address = models.GenericIPAddressField(
        null=True,
        blank=True,
        help_text="Client IP address at login",
    )

    # Geolocation (populated asynchronously if geo lookup is enabled)
    city = models.CharField(max_length=100, blank=True)
    region = models.CharField(max_length=100, blank=True, help_text="State/Province")
    country = models.CharField(max_length=100, blank=True)
    country_code = models.CharField(max_length=10, blank=True)
    latitude = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True
    )
    longitude = models.DecimalField(
        max_digits=9, decimal_places=6, null=True, blank=True
    )

    # Device information (parsed from user agent)
    user_agent = models.CharField(
        max_length=500,
        blank=True,
        help_text="Raw user agent string",
    )
    device_type = models.CharField(
        max_length=50,
        blank=True,
        help_text="e.g., desktop, mobile, tablet",
    )
    browser = models.CharField(
        max_length=100,
        blank=True,
        help_text="Browser name and version",
    )
    operating_system = models.CharField(
        max_length=100,
        blank=True,
        help_text="OS name and version",
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    last_activity_at = models.DateTimeField(
        auto_now_add=True,
        help_text="Last time this session was active",
    )
    logged_out_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the user explicitly logged out",
    )

    objects = UserSessionManager()

    class Meta(SoftDeleteMixin.Meta):
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "-created_at"]),
            models.Index(fields=["session_key"]),
        ]

    def __str__(self):
        location = self.location_display or "Unknown location"
        return f"Session for {self.user} from {location} at {self.created_at}"

    @property
    def location_display(self) -> str | None:
        """Return a human-readable location string."""
        parts = [p for p in [self.city, self.region, self.country] if p]
        return ", ".join(parts) if parts else None

    @property
    def device_display(self) -> str | None:
        """Return a human-readable device string."""
        parts = [p for p in [self.browser, self.operating_system] if p]
        return " on ".join(parts) if parts else self.user_agent[:100] if self.user_agent else None

    @property
    def is_current_session(self) -> bool:
        """Check if this is likely the current active session (not logged out)."""
        return self.logged_out_at is None

    def update_activity(self):
        """Update the last activity timestamp."""
        self.last_activity_at = timezone.now()
        self.save(update_fields=["last_activity_at"])

    def logout(self):
        """Mark this session as logged out."""
        self.logged_out_at = timezone.now()
        self.save(update_fields=["logged_out_at"])

    def populate_geolocation(self, geo_data: dict):
        """
        Populate geolocation fields from a geo lookup response.
        Expected keys: city, region, country, country_code, latitude, longitude
        """
        self.city = geo_data.get("city", "")[:100]
        self.region = geo_data.get("region", "")[:100]
        self.country = geo_data.get("country", "")[:100]
        self.country_code = geo_data.get("country_code", "")[:10]
        self.latitude = geo_data.get("latitude")
        self.longitude = geo_data.get("longitude")
        self.save(
            update_fields=[
                "city",
                "region",
                "country",
                "country_code",
                "latitude",
                "longitude",
            ]
        )

    def populate_device_info(self, device_data: dict):
        """
        Populate device fields from a user agent parser response.
        Expected keys: device_type, browser, operating_system
        """
        self.device_type = device_data.get("device_type", "")[:50]
        self.browser = device_data.get("browser", "")[:100]
        self.operating_system = device_data.get("operating_system", "")[:100]
        self.save(update_fields=["device_type", "browser", "operating_system"])
