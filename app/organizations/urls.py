from rest_framework.routers import DefaultRouter
from rest_framework_nested.routers import NestedDefaultRouter
from .views import OrganizationViewSet, OrganizationMembershipViewSet
from workspaces.views import WorkspaceViewSet
from assets.views import (
    AssetTypeViewSet,
    AssetTypeAttributeViewSet,
    AssetTypeAttributeChoiceViewSet,
    AssetViewSet,
)
from files_manager.views import FileNodeViewSet

router = DefaultRouter()
router.register(r"organizations", OrganizationViewSet, basename="organization")

# Nested router for members under organizations
members_router = NestedDefaultRouter(router, r"organizations", lookup="organization")
members_router.register(
    r"members",
    OrganizationMembershipViewSet,
    basename="organization-member",
)

# Nested router for workspaces under organizations
workspaces_router = NestedDefaultRouter(router, r"organizations", lookup="organization")
workspaces_router.register(
    r"workspaces",
    WorkspaceViewSet,
    basename="organization-workspace",
)

# Nested router for asset-types under workspaces
workspace_asset_types_router = NestedDefaultRouter(
    workspaces_router, r"workspaces", lookup="workspace"
)
workspace_asset_types_router.register(
    r"asset-types",
    AssetTypeViewSet,
    basename="organization-workspace-assettype",
)

# Nested router for attributes under asset types (workspace-scoped)
workspace_attributes_router = NestedDefaultRouter(
    workspace_asset_types_router, r"asset-types", lookup="assettype"
)
workspace_attributes_router.register(
    r"attributes",
    AssetTypeAttributeViewSet,
    basename="organization-workspace-assettype-attribute",
)

# Nested router for choices under attributes (workspace-scoped)
workspace_choices_router = NestedDefaultRouter(
    workspace_attributes_router, r"attributes", lookup="attribute"
)
workspace_choices_router.register(
    r"choices",
    AssetTypeAttributeChoiceViewSet,
    basename="organization-workspace-assettype-attribute-choice",
)

# Nested router for assets under workspaces
workspace_assets_router = NestedDefaultRouter(
    workspaces_router, r"workspaces", lookup="workspace"
)
workspace_assets_router.register(
    r"assets",
    AssetViewSet,
    basename="organization-workspace-asset",
)

# Nested router for files under workspaces
workspace_files_router = NestedDefaultRouter(
    workspaces_router, r"workspaces", lookup="workspace"
)
workspace_files_router.register(
    r"files",
    FileNodeViewSet,
    basename="organization-workspace-file",
)

# Nested router for assets under asset types (workspace-scoped)
workspace_assettype_assets_router = NestedDefaultRouter(
    workspace_asset_types_router, r"asset-types", lookup="assettype"
)
workspace_assettype_assets_router.register(
    r"assets",
    AssetViewSet,
    basename="organization-workspace-assettype-asset",
)

# Nested router for asset-types under organizations (organization-level, not workspace-scoped)
asset_types_router = NestedDefaultRouter(
    router, r"organizations", lookup="organization"
)
asset_types_router.register(
    r"asset-types",
    AssetTypeViewSet,
    basename="organization-assettype",
)

# Nested router for assets under organizations (organization-level, aggregates all workspaces)
org_assets_router = NestedDefaultRouter(
    router, r"organizations", lookup="organization"
)
org_assets_router.register(
    r"assets",
    AssetViewSet,
    basename="organization-asset",
)

# Nested router for attributes under asset types (organization-level)
attributes_router = NestedDefaultRouter(
    asset_types_router, r"asset-types", lookup="assettype"
)
attributes_router.register(
    r"attributes",
    AssetTypeAttributeViewSet,
    basename="organization-assettype-attribute",
)

# Nested router for choices under attributes (organization-level)
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
    + workspaces_router.urls
    + workspace_asset_types_router.urls
    + workspace_attributes_router.urls
    + workspace_choices_router.urls
    + workspace_assets_router.urls
    + workspace_files_router.urls
    + workspace_assettype_assets_router.urls
    + asset_types_router.urls
    + attributes_router.urls
    + choices_router.urls
    + org_assets_router.urls
)
