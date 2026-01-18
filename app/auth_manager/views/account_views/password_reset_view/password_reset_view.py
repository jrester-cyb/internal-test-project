# django
from django.contrib.auth import get_user_model, login
from django.shortcuts import redirect, render
from django.views.generic import TemplateView
from django_rest_passwordreset.models import ResetPasswordToken

# local
from auth_manager.views.account_views.serializer import CreatePasswordSerializer
from mainapp.utils.url_utils import reverse

User = get_user_model()


class PasswordResetView(TemplateView):
    template_name = "password_update.html"

    def dispatch(self, request, *args, **kwargs):
        # If the user is already authenticated, redirect to MFA
        if request.user.is_authenticated:
            return redirect("auth-manager:mfa")

        # If the token is linked to a user who is linked to an idp, redirect to login
        token = kwargs.get("uidb64")
        user = self.get_reset_user(token)
        if user and hasattr(user, "identity_providers") and user.identity_providers.exists():
            ResetPasswordToken.objects.filter(key=token).delete()
            return redirect("auth-manager:login")
        self.request.user = user
        return super().dispatch(request, *args, **kwargs)

    def get_reset_user(self, token):
        try:
            token = ResetPasswordToken.objects.get(key=token)
            return token.user
        except (ResetPasswordToken.DoesNotExist, User.DoesNotExist):
            return None

    def get(self, request, *args, **kwargs):
        # Get the user based on the token
        token = kwargs.get("uidb64")
        user = self.get_reset_user(token)
        context = self.get_context_data(user=user)
        context["user"] = user
        if not user:
            context["error"] = "The confirmation link is invalid or has expired."
        return self.render_to_response(context)

    def post(self, request, *args, **kwargs):
        token = kwargs.get("uidb64")
        user = self.get_reset_user(token)
        context = self.get_context_data(user=user)
        context["user"] = user
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
        user.save()
        # Delete the token to prevent reuse
        ResetPasswordToken.objects.filter(key=token).delete()
        login(request, user)
        response = render(request, self.template_name, {**context, "password_reset": True})
        response["Refresh"] = f'2; url={reverse("auth-manager:mfa", request=request)}'
        return response
