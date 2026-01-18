# stdlib
import logging

# django
from django.conf import settings
from django.core.mail import EmailMultiAlternatives

logger = logging.getLogger(__name__)


class PowerEmail:
    """
    Base class for Power-View emails.
    Provides common functionality for sending HTML emails.
    """

    def __init__(self, user_first_name: str, user_email: str, subject: str, preheader: str = "") -> None:
        self.user_first_name = user_first_name
        self.user_email = user_email
        self.subject = subject
        self.preheader = preheader
        self.html_message = ""

    def plaintext_message(self) -> str:
        """Override in subclasses to provide plain text version."""
        return ""

    def send(self) -> bool:
        """Send the email."""
        try:
            email = EmailMultiAlternatives(
                subject=self.subject,
                body=self.plaintext_message(),
                from_email=getattr(settings, "DEFAULT_FROM_EMAIL", None),
                to=[self.user_email],
            )
            if self.html_message:
                email.attach_alternative(self.html_message, "text/html")
            email.send(fail_silently=False)
            return True
        except Exception as e:
            logger.error(f"Failed to send email to {self.user_email}: {e}")
            return False
