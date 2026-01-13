from django.db import models
import uuid
import pgtrigger
from polymorphic.models import PolymorphicModel
from core.models.soft_delete import SoftDeleteMixin, PolymorphicSoftDeleteMixin


class BaseAssetTypeAttribute(PolymorphicSoftDeleteMixin, PolymorphicModel):
    """
    Base polymorphic model for all asset type attributes.
    Subclasses: GlobalAssetTypeAttribute, WorkspaceAttributeOverride,
                WorkspaceHiddenAttribute, WorkspaceExtensionAttribute
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
        "assets.AssetType", on_delete=models.CASCADE, related_name="all_attributes"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta(PolymorphicSoftDeleteMixin.Meta):
        ordering = ["asset_type", "created_at"]


class GlobalAssetTypeAttribute(BaseAssetTypeAttribute):
    """
    A global attribute visible to all workspaces with access to the asset type.
    """

    name = models.CharField(max_length=100)
    api_key = models.CharField(
        max_length=100, help_text="Key used in API serialization"
    )
    attribute_type = models.CharField(
        max_length=20, choices=BaseAssetTypeAttribute.FIELD_TYPES
    )
    is_required = models.BooleanField(default=False)
    default_value = models.JSONField(null=True, blank=True)
    description = models.TextField(blank=True)
    tags = models.JSONField(
        default=list, blank=True, help_text="List of tags for grouping attributes"
    )
    order = models.IntegerField(default=0)

    class Meta:
        ordering = ["asset_type", "order", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["asset_type", "name"],
                name="unique_base_attr_name",
                condition=models.Q(deleted_at__isnull=True),
            ),
            models.UniqueConstraint(
                fields=["asset_type", "api_key"],
                name="unique_base_attr_api_key",
                condition=models.Q(deleted_at__isnull=True),
            ),
            models.UniqueConstraint(
                fields=["asset_type", "order"],
                name="unique_base_attr_order",
                condition=models.Q(deleted_at__isnull=True),
            ),
        ]
        triggers = [
            pgtrigger.Trigger(
                name="01_update_base_attr_orders_after_delete",
                operation=pgtrigger.Delete,
                when=pgtrigger.After,
                func="""
                    UPDATE assets_assettypeattribute 
                    SET "order" = -("order" + 1000)
                    WHERE asset_type_id = OLD.asset_type_id 
                    AND "order" > OLD."order";
                    
                    UPDATE assets_assettypeattribute 
                    SET "order" = -("order" + 1000) - 1
                    WHERE asset_type_id = OLD.asset_type_id 
                    AND "order" < -1000;
                    
                    RETURN OLD;
                """,
            ),
        ]

    def __str__(self):
        return f"{self.asset_type.name}.{self.name}"


class WorkspaceAttributeOverride(BaseAssetTypeAttribute):
    """
    A workspace-specific override of a GlobalAssetTypeAttribute.
    Only stores fields that can be customized per workspace.
    """

    base_attribute = models.ForeignKey(
        GlobalAssetTypeAttribute,
        on_delete=models.CASCADE,
        related_name="overrides",
        help_text="The base attribute this overrides",
    )
    workspace = models.ForeignKey(
        "workspaces.Workspace",
        on_delete=models.CASCADE,
        related_name="attribute_overrides",
    )
    # Overridable fields - null means "use base value"
    name = models.CharField(max_length=100, null=True, blank=True)
    is_required = models.BooleanField(null=True, blank=True)
    default_value = models.JSONField(null=True, blank=True)
    description = models.TextField(null=True, blank=True)
    tags = models.JSONField(null=True, blank=True)
    order = models.IntegerField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["base_attribute", "workspace"],
                name="unique_override_per_workspace",
                condition=models.Q(deleted_at__isnull=True),
            ),
        ]

    def __str__(self):
        return f"Override: {self.base_attribute} in {self.workspace.name}"

    def get_effective_value(self, field_name):
        """Get the effective value for a field, falling back to base attribute."""
        override_value = getattr(self, field_name)
        if override_value is not None:
            return override_value
        return getattr(self.base_attribute, field_name)

    @property
    def api_key(self):
        """API key comes from base attribute (cannot be overridden)."""
        return self.base_attribute.api_key

    @property
    def attribute_type(self):
        """Attribute type comes from base attribute (cannot be overridden)."""
        return self.base_attribute.attribute_type


class WorkspaceHiddenAttribute(BaseAssetTypeAttribute):
    """
    Tracks which global attributes are hidden in a specific workspace.
    Simple join - no field overrides, just hiding.
    """

    base_attribute = models.ForeignKey(
        GlobalAssetTypeAttribute,
        on_delete=models.CASCADE,
        related_name="hidden_in_workspaces",
    )
    workspace = models.ForeignKey(
        "workspaces.Workspace",
        on_delete=models.CASCADE,
        related_name="hidden_attributes",
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["base_attribute", "workspace"],
                name="unique_hidden_per_workspace",
                condition=models.Q(deleted_at__isnull=True),
            ),
        ]

    def __str__(self):
        return f"Hidden: {self.base_attribute} in {self.workspace.name}"


class WorkspaceExtensionAttribute(BaseAssetTypeAttribute):
    """
    A workspace-specific extension attribute that doesn't exist in the base asset type.
    """

    workspace = models.ForeignKey(
        "workspaces.Workspace",
        on_delete=models.CASCADE,
        related_name="extension_attributes",
    )
    name = models.CharField(max_length=100)
    api_key = models.CharField(
        max_length=100, help_text="Key used in API serialization"
    )
    attribute_type = models.CharField(
        max_length=20, choices=BaseAssetTypeAttribute.FIELD_TYPES
    )
    is_required = models.BooleanField(default=False)
    is_hidden = models.BooleanField(default=False)
    default_value = models.JSONField(null=True, blank=True)
    description = models.TextField(blank=True)
    tags = models.JSONField(
        default=list, blank=True, help_text="List of tags for grouping attributes"
    )
    order = models.IntegerField(default=0)

    class Meta:
        ordering = ["workspace", "asset_type", "order", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["asset_type", "workspace", "name"],
                name="unique_extension_attr_name",
                condition=models.Q(deleted_at__isnull=True),
            ),
            models.UniqueConstraint(
                fields=["asset_type", "workspace", "api_key"],
                name="unique_extension_attr_api_key",
                condition=models.Q(deleted_at__isnull=True),
            ),
        ]

    def __str__(self):
        return f"{self.asset_type.name}.{self.name} [{self.workspace.name}]"


class AssetCustomAttribute(SoftDeleteMixin):
    """
    A one-off custom attribute on a specific asset, not linked to the asset type schema.
    Stores both the field definition and the value together.

    If workspace is NULL, this is visible globally (anywhere the asset is visible).
    If workspace is set, this is only visible in that workspace.
    """

    FIELD_TYPES = BaseAssetTypeAttribute.FIELD_TYPES

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    asset = models.ForeignKey(
        "assets.Asset",
        on_delete=models.CASCADE,
        related_name="custom_attributes",
    )
    workspace = models.ForeignKey(
        "workspaces.Workspace",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="asset_custom_attributes",
        help_text="If set, this custom attribute is only visible in this workspace",
    )
    name = models.CharField(max_length=100)
    api_key = models.CharField(
        max_length=100, help_text="Key used in API serialization"
    )
    attribute_type = models.CharField(max_length=20, choices=FIELD_TYPES)
    value = models.JSONField(
        null=True, blank=True, help_text="The actual value of this custom attribute"
    )
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta(SoftDeleteMixin.Meta):
        ordering = ["asset", "workspace", "name"]
        constraints = [
            # Unique name per asset + workspace (NULL workspace = global)
            models.UniqueConstraint(
                fields=["asset", "workspace", "name"],
                name="unique_custom_attr_name",
                condition=models.Q(deleted_at__isnull=True),
            ),
            # Unique api_key per asset + workspace
            models.UniqueConstraint(
                fields=["asset", "workspace", "api_key"],
                name="unique_custom_attr_api_key",
                condition=models.Q(deleted_at__isnull=True),
            ),
        ]

    def __str__(self):
        workspace_str = f" [{self.workspace.name}]" if self.workspace else ""
        return f"{self.asset}.{self.name}{workspace_str}"
