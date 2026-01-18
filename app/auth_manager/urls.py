# django
from django.urls import include, path

# local
from auth_manager.views import (
    APITokenInitView,
    IdentityProviderViewSet,
    MFADeviceViewSet,
    MFAEnrollmentSetupView,
    MFAEnrollSMSInitiateView,
    MFAEnrollSMSVerifyView,
    MFAEnrollTOTPView,
    ResetPasswordRequestTokenOverride,
    TokenLogoutView,
    TokenRefreshView,
    UserMFADeviceDetailView,
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
    path(
        "mfa-devices/<uuid:device_id>/",
        UserMFADeviceDetailView.as_view(),
        name="user-mfa-device-detail",
    ),
    # MFA enrollment endpoints (for authenticated users)
    path(
        "mfa-devices/enroll/setup/",
        MFAEnrollmentSetupView.as_view(),
        name="mfa-enroll-setup",
    ),
    path(
        "mfa-devices/enroll/totp/",
        MFAEnrollTOTPView.as_view(),
        name="mfa-enroll-totp",
    ),
    path(
        "mfa-devices/enroll/sms/initiate/",
        MFAEnrollSMSInitiateView.as_view(),
        name="mfa-enroll-sms-initiate",
    ),
    path(
        "mfa-devices/enroll/sms/verify/",
        MFAEnrollSMSVerifyView.as_view(),
        name="mfa-enroll-sms-verify",
    ),
    # User sessions endpoints
    path("", include(sessions_router.urls)),
    # Password reset
    path(
        "password/reset/",
        ResetPasswordRequestTokenOverride.as_view(),
        name="reset-password-request",
    ),
]
