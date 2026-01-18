# django
from django.contrib.auth import get_user_model
from django.http import HttpRequest, HttpResponse
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from django.views.generic import TemplateView

# local
from auth_manager.constants import NORMALIZED_EMAIL
from auth_manager.models import IdentityProvider, LocalIdentityProvider, SAMLIdentityProvider
from auth_manager.models.one_time_token import OneTimeToken
from auth_manager.views.shortcuts import identity_provider_disabled_page, login_error_page
from .local_auth_callback_view import LocalIdentityProviderAuthenticationCallbackView
from .saml_auth_callback_view import SAMLIdentityProviderAuthenticationCallbackView

User = get_user_model()


@method_decorator(csrf_exempt, name="dispatch")
class DynamicIdentityProviderAuthenticationCallbackView(TemplateView):
    """
    Routes to the correct callback view based on the IdentityProvider type.
    """

    def get_user_from_session(self, request: HttpRequest) -> User | None:
        user_id = request.session.get("user_id", None)
        user_email = request.session.get(NORMALIZED_EMAIL, None)
        if user_id:
            user_filter = {"id": user_id}
        elif user_email:
            user_filter = {"email": user_email}
        else:
            return None

        try:
            return User.objects.get(**user_filter)
        except User.DoesNotExist:
            return None

    def dispatch(self, request: HttpRequest, global_id: str, *args, **kwargs) -> HttpResponse:
        try:
            idp = IdentityProvider.objects.get(global_id=global_id)
        except IdentityProvider.DoesNotExist:
            return login_error_page(request, message="Identity provider not found.", status=404)

        if not idp.enabled:
            user = self.get_user_from_session(request)
            context = None
            if user and user.is_admin:
                context = {
                    "admin_user": True,
                    "request_token": OneTimeToken.objects.generate_token(user=user),
                }

            return identity_provider_disabled_page(
                request,
                context=context,
            )

        if isinstance(idp, LocalIdentityProvider):
            view = LocalIdentityProviderAuthenticationCallbackView.as_view()
        elif isinstance(idp, SAMLIdentityProvider):
            view = SAMLIdentityProviderAuthenticationCallbackView.as_view()
        else:
            return login_error_page(request, message="Unsupported identity provider type.", status=400)
        return view(request, global_id=global_id, *args, **kwargs)
