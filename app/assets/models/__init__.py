from .asset_type import AssetType, WorkspaceAssetType
from .asset_type_attribute import (
    BaseAssetTypeAttribute,
    GlobalAssetTypeAttribute,
    WorkspaceAttributeOverride,
    WorkspaceHiddenAttribute,
    WorkspaceExtensionAttribute,
    AssetCustomAttribute,
)

# Legacy alias for backwards compatibility
from .asset_type_attribute_choice import (
    # Base choices (on global attributes)
    AssetTypeAttributeChoice,
    TextAttributeChoice,
    NumberAttributeChoice,
    BooleanAttributeChoice,
    DateAttributeChoice,
    DateTimeAttributeChoice,
    JSONAttributeChoice,
    # Workspace choice modifications
    BaseWorkspaceChoice,
    WorkspaceChoiceOverride,
    WorkspaceHiddenChoice,
    # Workspace extension choices (typed)
    BaseWorkspaceExtensionChoice,
    TextExtensionChoice,
    NumberExtensionChoice,
    BooleanExtensionChoice,
    DateExtensionChoice,
    DateTimeExtensionChoice,
    JSONExtensionChoice,
)
from .asset import Asset, WorkspaceAsset
from .attribute_value import (
    BaseAttributeValue,
    TextAttributeValue,
    NumberAttributeValue,
    BooleanAttributeValue,
    DateAttributeValue,
    DateTimeAttributeValue,
    JSONAttributeValue,
    ChoiceAttributeValue,
)

__all__ = [
    "AssetType",
    "WorkspaceAssetType",
    "AssetTypeAttribute",
    "AssetTypeAttributeChoice",
    "TextAttributeChoice",
    "NumberAttributeChoice",
    "BooleanAttributeChoice",
    "DateAttributeChoice",
    "DateTimeAttributeChoice",
    "JSONAttributeChoice",
    "Asset",
    "WorkspaceAsset",
    "BaseAttributeValue",
    "TextAttributeValue",
    "NumberAttributeValue",
    "BooleanAttributeValue",
    "DateAttributeValue",
    "DateTimeAttributeValue",
    "JSONAttributeValue",
    "ChoiceAttributeValue",
]
