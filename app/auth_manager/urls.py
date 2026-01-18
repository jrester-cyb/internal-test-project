# django
from django.urls import include, path

# local
from auth_manager.views import (
    APITokenInitView,
    IdentityProviderViewSet,
    MFADeviceViewSet,
    ResetPasswordRequestTokenOverride,
    TokenLogoutView,
    TokenRefreshView,
    UserMFADevicesView,
    UserSessionsViewSet,
    WhoAmIView,
)

# thirdparty
from rest_framework.routers import DefaultRouter
from rest_framework_nested import routers as nested_routers

app_name = "auth-manager-api"

router = DefaultRouter()
router.register(r"", IdentityProviderViewSet, basename="identity-provider")

# Nested router for MFA devices under users
# Creates URLs like: /api/auth/users/{user_id}/mfa-devices/{device_id}/verify/
mfa_router = nested_routers.SimpleRouter()
mfa_router.register(
    r"users/(?P<user_id>[^/.]+)/mfa-devices",
    MFADeviceViewSet,
    basename="multifactor-auth-devices",
)

# Nested router for sessions under users
# Creates URLs like: /api/auth/v2/users/{user_id}/sessions/
sessions_router = nested_routers.SimpleRouter()
sessions_router.register(
    r"users/(?P<user_id>[^/.]+)/sessions",
    UserSessionsViewSet,
    basename="user-sessions",
)

urlpatterns = [
    # DRF/SSO API only
    path("idp/", include(router.urls)),
    path("whoami/", WhoAmIView.as_view(), name="whoami"),
    # JWT Token endpoints
    path("token/login/", APITokenInitView.as_view(), name="token-login"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    path("token/logout/", TokenLogoutView.as_view(), name="token-logout"),
    # MFA device endpoints
    path("", include(mfa_router.urls)),
    path("mfa-devices/", UserMFADevicesView.as_view(), name="user-mfa-devices"),
    # User sessions endpoints
    path("", include(sessions_router.urls)),
    # Password reset
    path(
        "password/reset/",
        ResetPasswordRequestTokenOverride.as_view(),
        name="reset-password-request",
    ),
]
