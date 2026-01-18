# django
from django.contrib.auth import get_user_model
from django_rest_passwordreset.views import ResetPasswordRequestToken

User = get_user_model()


def eligible_for_reset(user) -> bool:
    """
    Determines if the user is eligible for a password reset.
    Users linked to an identity provider cannot reset their password locally.
    """
    if user.identity_providers.exists():
        return False
    return True


class ResetPasswordRequestTokenOverride(ResetPasswordRequestToken):
    """
    This view overrides the `ResetPasswordRequestToken` in order to use the customized
    `eligible_for_set` function instead of the one built into the `django_rest_passwordreset` library.
    """

    def post(self, request, *args, **kwargs):
        User.add_to_class("eligible_for_reset", eligible_for_reset)
        return super().post(request, *args, **kwargs)
