from rest_framework.routers import DefaultRouter
from rest_framework_nested.routers import NestedDefaultRouter
from .views import WorkspaceViewSet
from assets.views import (
    AssetTypeViewSet,
    AssetTypeAttributeViewSet,
    AssetTypeAttributeChoiceViewSet,
    AssetViewSet,
)
from files_manager.views import FileNodeViewSet

router = DefaultRouter()
router.register(r"workspaces", WorkspaceViewSet, basename="workspace")

# Nested router for asset-types under workspaces
asset_types_router = NestedDefaultRouter(router, r"workspaces", lookup="workspace")
asset_types_router.register(
    r"asset-types",
    AssetTypeViewSet,
    basename="workspace-assettype",
)

# Nested router for attributes under asset types
attributes_router = NestedDefaultRouter(
    asset_types_router, r"asset-types", lookup="assettype"
)
attributes_router.register(
    r"attributes",
    AssetTypeAttributeViewSet,
    basename="workspace-assettype-attribute",
)

# Nested router for choices under attributes
choices_router = NestedDefaultRouter(
    attributes_router, r"attributes", lookup="attribute"
)
choices_router.register(
    r"choices",
    AssetTypeAttributeChoiceViewSet,
    basename="workspace-assettype-attribute-choice",
)

# Nested router for assets under workspaces
assets_router = NestedDefaultRouter(router, r"workspaces", lookup="workspace")
assets_router.register(
    r"assets",
    AssetViewSet,
    basename="workspace-asset",
)

# Nested router for files under workspaces
files_router = NestedDefaultRouter(router, r"workspaces", lookup="workspace")
files_router.register(
    r"files",
    FileNodeViewSet,
    basename="workspace-file",
)

# Nested router for assets under asset types
assettype_assets_router = NestedDefaultRouter(
    asset_types_router, r"asset-types", lookup="assettype"
)
assettype_assets_router.register(
    r"assets",
    AssetViewSet,
    basename="workspace-assettype-asset",
)

urlpatterns = (
    router.urls
    + asset_types_router.urls
    + attributes_router.urls
    + choices_router.urls
    + assets_router.urls
    + files_router.urls
    + assettype_assets_router.urls
)
