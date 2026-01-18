# django
from django.http import HttpRequest, HttpResponse
from django.shortcuts import redirect
from django.urls import reverse
from django.views import View

# local
from auth_manager.models.identity_provider_models import IdentityProvider
from auth_manager.models.one_time_token import OneTimeToken
from auth_manager.views.shortcuts import login_error_page


class SAMLIdentityProviderAuthenticationCallbackView(View):

    def get_identity_provider(self, id: str) -> IdentityProvider | None:
        """
        Retrieve the Identity Provider based on the global ID.
        """
        try:
            return IdentityProvider.objects.get(id=id)
        except IdentityProvider.DoesNotExist:
            return None

    def get(self, request: HttpRequest, id: str) -> HttpResponse:
        idp = self.get_identity_provider(id)
        if not idp:
            return login_error_page(
                request, message="Identity provider not found.", status=404
            )
        return redirect(idp.generate_redirect_link(request))

    def post(self, request: HttpRequest, id: str) -> HttpResponse:
        idp = self.get_identity_provider(id)
        if not idp:
            return login_error_page(
                request, message="Identity provider not found.", status=404
            )
        try:
            # Authenticate user via SAML (validates SAML response) but don't create session
            user = idp.authenticate(request)

            # Generate OneTimeToken for sessionless auth flow
            token = OneTimeToken.objects.generate_token(user)

            # SAML users skip MFA (already verified by their corporate IdP)
            # Redirect directly to finalize with token
            finalize_url = f"{reverse('auth-manager:finalize')}?t={token}"
            return redirect(finalize_url)
        except Exception as e:
            return login_error_page(
                request,
                message=e.detail if hasattr(e, "detail") else "Bad request.",
                status=e.status_code if hasattr(e, "status_code") else 400,
            )
