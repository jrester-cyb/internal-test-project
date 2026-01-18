# stdlib
import re

# django
from django import template

register = template.Library()


@register.filter
def phone_format(value):
    """Format a 10-digit US phone number as (###) ###-####."""
    digits = re.sub(r"\D", "", str(value))

    # take the last 10 digits in case of country code
    digits = digits[-10:]
    if len(digits) == 10:
        return f"({digits[:3]}) {digits[3:6]}-{digits[6:]}"
    return value
