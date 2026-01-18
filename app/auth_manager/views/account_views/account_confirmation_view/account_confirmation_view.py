# django
from django.conf import settings
from django.contrib.auth import get_user_model, login
from django.core import signing
from django.core.signing import BadSignature, SignatureExpired
from django.shortcuts import get_object_or_404, render
from django.views.generic import TemplateView

# local
from auth_manager.views.account_views.serializer import CreatePasswordSerializer
from django.urls import reverse

User = get_user_model()


class AccountConfirmationView(TemplateView):
    template_name = "account_confirmation.html"

    def validate_user_token(self, token):
        """
        This method validates the token and returns the user object. If the token is invalid,
        it raises an error.

        :param token: The token to validate.
        :return: The user object.
        """
        # decode token find user
        try:
            userid = signing.loads(token, max_age=settings.EXPIRATION_DAYS_ACCOUNT_CONFIRMATION)  # Valid for 2 days
            user_pk = userid.get("pk", None)
            if user_pk is None:
                user = get_object_or_404(User, global_id=userid.get("global_id"))
            return user
        except (SignatureExpired, BadSignature):
            return None

    def get_context_data(self, token, **kwargs):
        context = super().get_context_data(**kwargs)
        context["user"] = self.validate_user_token(token)
        return context

    def get(self, request, *args, **kwargs):
        return self.render_to_response(self.get_context_data(token=kwargs.get("uidb64")))

    def post(self, request, *args, **kwargs):
        token = kwargs.get("uidb64")
        context = self.get_context_data(token=token)
        user = context.get("user", None)
        if not user:
            context["error"] = "The confirmation link is invalid or has expired."
            return self.render_to_response(context)

        serializer = CreatePasswordSerializer(data=request.POST, context={"user": user})
        if not serializer.is_valid():
            context["error"] = (
                serializer.errors.get("non_field_errors", [None])[0] or next(iter(serializer.errors.values()))[0]
            )
            return self.render_to_response(context)

        user.set_password(serializer.validated_data["new_password1"])
        user.is_active = True
        user.is_confirmed = True
        user.save()
        login(request, user)
        response = render(request, self.template_name, {**context, "account_confirmed": True})
        response["Refresh"] = f'2; url={reverse("auth-manager:mfa", request=request)}'
        return response
