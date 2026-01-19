from django.db import models
import uuid
from core.models.soft_delete import SoftDeleteMixin


class AssetType(SoftDeleteMixin):
    """Defines a type of asset with its field schema. Owned by organization."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="asset_types",
    )
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    min_render_zoom = models.PositiveSmallIntegerField(
        default=0,
        help_text="Minimum zoom level at which assets of this type are visible (0-22)",
    )
    max_render_zoom = models.PositiveSmallIntegerField(
        default=22,
        help_text="Maximum zoom level at which assets of this type are visible (0-22)",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def get_attributes_for_workspace(self, workspace=None):
        """
        Returns a list of AssetTypeAttribute objects for this asset type, merging global and workspace-specific attributes.
        If a workspace-specific attribute exists for the same api_key, it overrides the global one.
        """
        from .asset_type_attribute import (
            GlobalAssetTypeAttribute,
            WorkspaceLocalAssetTypeAttribute,
            WorkspaceOverrideAssetTypeAttribute,
        )

        # Get global attributes (no workspace field on these)
        base_qs = GlobalAssetTypeAttribute.objects.filter(
            asset_type=self, deleted_at__isnull=True
        )
        if workspace is None:
            return list(base_qs)

        # Get workspace-specific attributes (local + overrides)
        local_qs = WorkspaceLocalAssetTypeAttribute.objects.filter(
            asset_type=self, workspace=workspace, deleted_at__isnull=True
        )
        override_qs = WorkspaceOverrideAssetTypeAttribute.objects.filter(
            asset_type=self, workspace=workspace, deleted_at__isnull=True
        )

        # Build dict by api_key - global first, then override with workspace-specific
        attr_map = {a.api_key: a for a in base_qs}
        for ext in local_qs:
            attr_map[ext.api_key] = ext
        for override in override_qs:
            attr_map[override.api_key] = override
        return list(attr_map.values())

    class Meta(SoftDeleteMixin.Meta):
        # No unique constraint on name - duplicates allowed, handled via UI prompt
        ordering = ["organization", "name"]
        indexes = [
            models.Index(
                fields=["min_render_zoom", "max_render_zoom"],
                name="idx_assettype_render_zoom",
            ),
        ]

    def __str__(self):
        return self.name


class WorkspaceAssetType(SoftDeleteMixin):
    """
    Join table linking workspaces to asset types.
    Controls visibility and ownership of asset types per workspace.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        "workspaces.Workspace",
        on_delete=models.CASCADE,
        related_name="workspace_asset_types",
    )
    asset_type = models.ForeignKey(
        "assets.AssetType",
        on_delete=models.CASCADE,
        related_name="workspace_asset_types",
    )
    is_owner = models.BooleanField(
        default=False,
        help_text="If true, this workspace owns the asset type and can modify it",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta(SoftDeleteMixin.Meta):
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "asset_type"],
                name="unique_workspace_asset_type",
                condition=models.Q(deleted_at__isnull=True),
            ),
        ]
        ordering = ["workspace", "asset_type"]

    def __str__(self):
        owner_str = " (owner)" if self.is_owner else ""
        return f"{self.workspace.name} - {self.asset_type.name}{owner_str}"
