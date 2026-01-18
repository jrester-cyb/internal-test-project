# stdlib
import logging

# django
from django.conf import settings
from django.template.loader import render_to_string

# local
from users.emails import PowerEmail

# thirdparty
from humanfriendly import format_timespan

logger = logging.getLogger(__name__)

LOGIN_TO_POWER_VIEW = "Login to Power-View"


class MagicLinkRequestEmail(PowerEmail):
    def __init__(self, user_first_name, user_email, login_url) -> None:
        super().__init__(user_first_name, user_email, LOGIN_TO_POWER_VIEW, LOGIN_TO_POWER_VIEW)

        self.body_template = "emails/magic_link.html"
        self.button_text = LOGIN_TO_POWER_VIEW
        self.login_url = login_url
        self.render_message()

    # Renders the body of the message with a button
    def render_message(self):
        self.html_message = render_to_string(
            self.body_template,
            {
                "first_name": self.user_first_name,
                "button": {
                    "url": self.login_url,
                    "message": self.button_text,
                    "helper_text": f"This link will expire in {format_timespan(settings.MAGIC_LINK_TOKEN_EXPIRATION_TIME)}.",
                },
                "login_url": self.login_url,
            },
        )

    def plaintext_message(self):
        return f"Hi {self.user_first_name}, \n\nTo log in, click the link below:\n\n {self.login_url}.\n\n This link will expire in {format_timespan(settings.MAGIC_LINK_TOKEN_EXPIRATION_TIME)}.\n\nIf you did not request this email, you can safely ignore it.\n\nThanks,\nThe Power-View Team"
