# django
from django.http import HttpRequest, HttpResponse
from django.shortcuts import redirect
from django.views import View

# local
from auth_manager.models.identity_provider_models import IdentityProvider
from auth_manager.views.shortcuts import login_error_page


class SAMLIdentityProviderAuthenticationCallbackView(View):

    def get_identity_provider(self, global_id: str) -> IdentityProvider | None:
        """
        Retrieve the Identity Provider based on the global ID.
        """
        try:
            return IdentityProvider.objects.get(global_id=global_id)
        except IdentityProvider.DoesNotExist:
            return None

    def get(self, request: HttpRequest, global_id: str) -> HttpResponse:
        idp = self.get_identity_provider(global_id)
        if not idp:
            return login_error_page(request, message="Identity provider not found.", status=404)
        return redirect(idp.generate_redirect_link(request))

    def post(self, request: HttpRequest, global_id: str) -> HttpResponse:
        idp = self.get_identity_provider(global_id)
        if not idp:
            return login_error_page(request, message="Identity provider not found.", status=404)
        try:
            idp.login(request, skip_mfa=True)
            return redirect("auth-manager:mfa")
        except Exception as e:
            return login_error_page(
                request,
                message=e.detail if hasattr(e, "detail") else "Bad request.",
                status=e.status_code if hasattr(e, "status_code") else 400,
            )
