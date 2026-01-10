from django.urls import path
from rest_framework.routers import DefaultRouter
from rest_framework_nested.routers import NestedDefaultRouter
from .views import AssetTypeViewSet, AssetAttributeDefinitionViewSet, AssetViewSet

router = DefaultRouter()
router.register(r"asset-types", AssetTypeViewSet, basename="assettype")

# Top-level assets endpoint (can query all assets)
router.register(r"assets", AssetViewSet, basename="asset")

# Nested router for field definitions under asset types
field_defs_router = NestedDefaultRouter(router, r"asset-types", lookup="assettype")
field_defs_router.register(
    r"field-definitions",
    AssetAttributeDefinitionViewSet,
    basename="assettype-fielddefinition",
)

# Nested router for assets under asset types (filtered by type)
assets_router = NestedDefaultRouter(router, r"asset-types", lookup="assettype")
assets_router.register(r"assets", AssetViewSet, basename="assettype-asset")

urlpatterns = router.urls + field_defs_router.urls + assets_router.urls
