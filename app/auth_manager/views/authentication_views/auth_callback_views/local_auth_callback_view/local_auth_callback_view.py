# django
from django.http import HttpRequest, HttpResponse
from django.shortcuts import redirect
from django.urls import reverse
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect
from django.views.generic import TemplateView

# local
from auth_manager.constants import PROVIDED_EMAIL
from auth_manager.exceptions.api_exceptions import (
    BadRequest,
    IncorrectCredentials,
    LockedAccount,
    UserAlreadyLinked,
)
from auth_manager.models import IdentityProvider, OneTimeToken


@method_decorator(csrf_protect, name="dispatch")
class LocalIdentityProviderAuthenticationCallbackView(TemplateView):
    template_name = "idp_provider_templates/local_idp_provider.html"

    def dispatch(self, request, *args, **kwargs):
        if request.session.get(PROVIDED_EMAIL) is None:
            return redirect("auth-manager:login")
        return super().dispatch(request, *args, **kwargs)

    def get_context_data(self, **kwargs):
        context_data = super().get_context_data(**kwargs)
        context_data["email"] = self.request.session.get(PROVIDED_EMAIL)
        # Retain password if present in POST (for re-rendering after error)
        if self.request.method == "POST":
            context_data["password"] = self.request.POST.get("password", "")
        return context_data

    def get(self, _request: HttpRequest, id: str) -> HttpResponse:
        context = self.get_context_data()
        context["id"] = id
        return self.render_to_response(context)

    def post(self, request: HttpRequest, id: str) -> HttpResponse:
        try:
            idp = IdentityProvider.objects.get(id=id, enabled=True)
            # Authenticate user (validates credentials) but don't create session
            user = idp.authenticate(request)
        except IdentityProvider.DoesNotExist:
            context = self.get_context_data()
            context["error_message"] = "Identity provider not found"
            return self.render_to_response(context, status=404)
        except (
            UserAlreadyLinked,
            BadRequest,
            IncorrectCredentials,
            LockedAccount,
        ) as err:
            context = self.get_context_data()
            context["error_message"] = err.detail
            return self.render_to_response(context, status=err.status_code)

        # Generate OneTimeToken for sessionless auth flow
        token = OneTimeToken.objects.generate_token(user)

        # Redirect to MFA with token in URL
        mfa_url = f"{reverse('auth-manager:mfa')}?t={token}"
        return redirect(mfa_url)
