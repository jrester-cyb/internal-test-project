from django.urls import path
from rest_framework.routers import DefaultRouter
from rest_framework_nested.routers import NestedDefaultRouter
from .views import (
    AssetTypeViewSet,
    AssetTypeAttributeViewSet,
    AssetTypeAttributeChoiceViewSet,
    AssetViewSet,
)

router = DefaultRouter()
router.register(r"asset-types", AssetTypeViewSet, basename="assettype")

# Top-level assets endpoint (can query all assets)
router.register(r"assets", AssetViewSet, basename="asset")

# Nested router for attributes under asset types
attributes_router = NestedDefaultRouter(router, r"asset-types", lookup="assettype")
attributes_router.register(
    r"attributes",
    AssetTypeAttributeViewSet,
    basename="assettype-attribute",
)

# Nested router for choices under attributes
choices_router = NestedDefaultRouter(
    attributes_router, r"attributes", lookup="attribute"
)
choices_router.register(
    r"choices",
    AssetTypeAttributeChoiceViewSet,
    basename="assettype-attribute-choice",
)

# Nested router for assets under asset types (filtered by type)
assets_router = NestedDefaultRouter(router, r"asset-types", lookup="assettype")
assets_router.register(r"assets", AssetViewSet, basename="assettype-asset")

urlpatterns = (
    router.urls + attributes_router.urls + choices_router.urls + assets_router.urls
)
