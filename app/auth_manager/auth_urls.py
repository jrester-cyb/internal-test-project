# django
from django.urls import path

# local
from auth_manager.views import (
    AccountConfirmationView,
    DynamicIdentityProviderAuthenticationCallbackView,
    ForgottenPasswordView,
    LoginFinalizeView,
    LoginInitView,
    LogoutView,
    MagicLinkCallbackView,
    MFAEnrollView,
    MFAView,
    PasswordResetView,
    RequestMagicLinkAPIView,
)

app_name = "auth-manager"


urlpatterns = [
    path("login/", LoginInitView.as_view(), name="login"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("finalize/", LoginFinalizeView.as_view(), name="finalize"),
    path("mfa/", MFAView.as_view(), name="mfa"),
    path("mfa/enroll/", MFAEnrollView.as_view(), name="mfa-enroll"),
    path(
        "<uuid:global_id>/callback/", DynamicIdentityProviderAuthenticationCallbackView.as_view(), name="auth-callback"
    ),
    path("link/request/", RequestMagicLinkAPIView.as_view(), name="magic-link-request"),
    path("link/callback/<uidb64>/", MagicLinkCallbackView.as_view(), name="magic-link-callback"),
    path("forgot-password/", ForgottenPasswordView.as_view(), name="forgotten-password"),
    path("password-reset/<uidb64>/", PasswordResetView.as_view(), name="password-reset"),
    path("account-confirm/<uidb64>/", AccountConfirmationView.as_view(), name="account-confirmation"),
]
