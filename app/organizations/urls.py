from rest_framework.routers import DefaultRouter
from rest_framework_nested.routers import NestedDefaultRouter
from .views import OrganizationViewSet, OrganizationMembershipViewSet

router = DefaultRouter()
router.register(r"organizations", OrganizationViewSet, basename="organization")

# Nested router for members under organizations
members_router = NestedDefaultRouter(router, r"organizations", lookup="organization")
members_router.register(
    r"members",
    OrganizationMembershipViewSet,
    basename="organization-member",
)

urlpatterns = router.urls + members_router.urls
