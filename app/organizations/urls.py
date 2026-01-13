from rest_framework.routers import DefaultRouter
from rest_framework_nested.routers import NestedDefaultRouter
from .views import OrganizationViewSet, OrganizationMembershipViewSet
from assets.views import (
    AssetTypeViewSet,
    AssetTypeAttributeViewSet,
    AssetTypeAttributeChoiceViewSet,
)

router = DefaultRouter()
router.register(r"organizations", OrganizationViewSet, basename="organization")

# Nested router for members under organizations
members_router = NestedDefaultRouter(router, r"organizations", lookup="organization")
members_router.register(
    r"members",
    OrganizationMembershipViewSet,
    basename="organization-member",
)

# Nested router for asset-types under organizations
asset_types_router = NestedDefaultRouter(
    router, r"organizations", lookup="organization"
)
asset_types_router.register(
    r"asset-types",
    AssetTypeViewSet,
    basename="organization-assettype",
)

# Nested router for attributes under asset types
attributes_router = NestedDefaultRouter(
    asset_types_router, r"asset-types", lookup="assettype"
)
attributes_router.register(
    r"attributes",
    AssetTypeAttributeViewSet,
    basename="organization-assettype-attribute",
)

# Nested router for choices under attributes
choices_router = NestedDefaultRouter(
    attributes_router, r"attributes", lookup="attribute"
)
choices_router.register(
    r"choices",
    AssetTypeAttributeChoiceViewSet,
    basename="organization-assettype-attribute-choice",
)

urlpatterns = (
    router.urls
    + members_router.urls
    + asset_types_router.urls
    + attributes_router.urls
    + choices_router.urls
)
