# django
from django.shortcuts import redirect
from django.views.generic import TemplateView

# local
from auth_manager.constants import NORMALIZED_EMAIL, PROVIDED_EMAIL
from auth_manager.models.identity_provider_models import (
    IdentityProvider,
    IdentityProviderUser,
    LocalIdentityProvider,
    SAMLIdentityProvider,
)
from auth_manager.views.shortcuts import login_error_page
from django.urls import reverse


class LoginInitView(TemplateView):
    template_name = "login.html"

    def dispatch(self, request, *args, **kwargs):
        # Pull the queryparameter redirect_uri and set on the session
        redirect_uri = request.GET.get("redirect_uri")
        if redirect_uri:
            request.session["redirect_uri"] = redirect_uri

        # Pull the queryparameter method and set on the session
        auth_method = request.GET.get("method")
        if auth_method:
            request.session["auth_method"] = auth_method

        if request.user.is_authenticated:
            return redirect("auth-manager:mfa")
        self.request.session.pop(PROVIDED_EMAIL, None)

        return super().dispatch(request, *args, **kwargs)

    def get_identity_provider(self, email: str) -> IdentityProvider | None:
        """
        This function retrieves the Identity Provider associated with the given email or
        email domain.
        :param email: The email address to look up.
        :return: The associated Identity Provider, or None if not found.
        """
        # Normalize the email string
        # Use django email normalization
        normalized_email = email.strip().lower()

        # Store the provided and normalized email in the session
        self.request.session[PROVIDED_EMAIL] = email
        self.request.session[NORMALIZED_EMAIL] = normalized_email

        # Attempt to find a user who is linked to an identity provider
        # If found, return that identity provider
        # If not found, check for a domain match
        # If no domain match, return the local identity provider
        try:
            idp_user = IdentityProviderUser.objects.get(user__email=normalized_email)
            self.request.session["user_id"] = idp_user.user.pk
            return idp_user.identity_provider
        except IdentityProviderUser.DoesNotExist:
            # If no exact match is found, check for a domain match
            domain = normalized_email.split("@")[-1]
            try:
                return IdentityProvider.objects.exclude(enabled=False).get(domains__icontains=domain)
            except IdentityProvider.DoesNotExist:
                # Get the local identity provider as a fallback
                # If the local identity provider is not found, return None
                # Note: There should always be a local identity provider
                try:
                    return LocalIdentityProvider.objects.get()
                except LocalIdentityProvider.DoesNotExist:
                    return None

    def post(self, request, *args, **kwargs):
        email = request.POST.get("email")

        # If password is not provided, this is the first step (email submission)
        if email:
            identity_provider = self.get_identity_provider(email)
            if isinstance(identity_provider, LocalIdentityProvider) or not getattr(identity_provider, "enabled", False):
                return redirect(
                    reverse("auth-manager:auth-callback", args=(identity_provider.global_id_str,), request=request)
                )
            elif isinstance(identity_provider, SAMLIdentityProvider):
                # Start login process
                return redirect(identity_provider.generate_redirect_link(request))
            else:
                return login_error_page(
                    request,
                    message="No identity provider found for this domain. Please contact your administrator.",
                    status=403,
                )

        # Default: render with no context
        return self.render_to_response(self.get_context_data())
