# django
from django.urls import include, path

# local
from auth_manager.views import (
    APITokenInitView,
    IdentityProviderViewSet,
    ResetPasswordRequestTokenOverride,
    TokenLogoutView,
    TokenRefreshView,
    WhoAmIView,
)

# thirdparty
from rest_framework.routers import DefaultRouter

app_name = "auth-manager-api"

router = DefaultRouter()
router.register(r"", IdentityProviderViewSet, basename="identity-provider")

urlpatterns = [
    # DRF/SSO API only
    path("idp/", include(router.urls)),
    path("whoami/", WhoAmIView.as_view(), name="whoami"),
    # JWT Token endpoints
    path("token/login/", APITokenInitView.as_view(), name="token-login"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    path("token/logout/", TokenLogoutView.as_view(), name="token-logout"),
    # Password reset
    path("password/reset/", ResetPasswordRequestTokenOverride.as_view(), name="reset-password-request"),
]
