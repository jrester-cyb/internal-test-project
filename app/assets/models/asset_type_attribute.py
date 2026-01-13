from django.db import models
import uuid
import pgtrigger
from core.models.soft_delete import SoftDeleteMixin


class AssetTypeAttribute(SoftDeleteMixin):
    """
    Defines a custom field for an asset type.
    If workspace is NULL, this is a base field visible to all workspaces with access.
    If workspace is set, this is an extension field only visible to that workspace.
    """

    FIELD_TYPES = [
        ("text", "Text"),
        ("number", "Number"),
        ("boolean", "Boolean"),
        ("date", "Date"),
        ("datetime", "DateTime"),
        ("json", "JSON"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    asset_type = models.ForeignKey(
        "assets.AssetType", on_delete=models.CASCADE, related_name="attributes"
    )
    workspace = models.ForeignKey(
        "workspaces.Workspace",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="asset_type_attribute_extensions",
        help_text="If set, this is a workspace-specific extension field",
    )
    name = models.CharField(max_length=100)
    api_key = models.CharField(
        max_length=100, help_text="Key used in API serialization"
    )
    attribute_type = models.CharField(max_length=20, choices=FIELD_TYPES)
    is_required = models.BooleanField(default=False)
    is_hidden = models.BooleanField(
        default=False, help_text="If true, this attribute is hidden in this workspace"
    )
    default_value = models.JSONField(null=True, blank=True)
    description = models.TextField(blank=True)
    tags = models.JSONField(
        default=list, blank=True, help_text="List of tags for grouping attributes"
    )
    order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta(SoftDeleteMixin.Meta):
        ordering = ["asset_type", "workspace", "order", "name"]
        constraints = [
            # Unique name per asset_type + workspace (NULL workspace = base fields)
            models.UniqueConstraint(
                fields=["asset_type", "workspace", "name"],
                name="unique_asset_type_workspace_name",
                condition=models.Q(deleted_at__isnull=True),
            ),
            # Unique api_key per asset_type + workspace
            models.UniqueConstraint(
                fields=["asset_type", "workspace", "api_key"],
                name="unique_asset_type_workspace_api_key",
                condition=models.Q(deleted_at__isnull=True),
            ),
            # Unique order per asset_type + workspace
            models.UniqueConstraint(
                fields=["asset_type", "workspace", "order"],
                name="unique_asset_type_workspace_order",
                condition=models.Q(deleted_at__isnull=True),
            ),
        ]
        triggers = [
            pgtrigger.Trigger(
                name="01_update_attribute_orders_after_delete",
                operation=pgtrigger.Delete,
                when=pgtrigger.After,
                func="""
                    -- Use negative temporary values to avoid unique constraint violations
                    UPDATE assets_assettypeattribute 
                    SET "order" = -("order" + 1000)
                    WHERE asset_type_id = OLD.asset_type_id 
                    AND (workspace_id = OLD.workspace_id OR (workspace_id IS NULL AND OLD.workspace_id IS NULL))
                    AND "order" > OLD."order";
                    
                    -- Now update to final values (decrement by 1)
                    UPDATE assets_assettypeattribute 
                    SET "order" = -("order" + 1000) - 1
                    WHERE asset_type_id = OLD.asset_type_id 
                    AND (workspace_id = OLD.workspace_id OR (workspace_id IS NULL AND OLD.workspace_id IS NULL))
                    AND "order" < -1000;
                    
                    RETURN OLD;
                """,
            ),
        ]

    def __str__(self):
        workspace_str = f" [{self.workspace.name}]" if self.workspace else ""
        return f"{self.asset_type.name}.{self.name}{workspace_str}"
