from django.db import models
import uuid
import pgtrigger
from polymorphic.models import PolymorphicModel
from core.models.soft_delete import SoftDeleteMixin, PolymorphicSoftDeleteMixin


class BaseAssetTypeAttribute(PolymorphicSoftDeleteMixin, PolymorphicModel):
    """
    Base polymorphic model for all asset type attributes.
    Subclasses: GlobalAssetTypeAttribute, WorkspaceOverrideAssetTypeAttribute,
                WorkspaceHiddenAttribute, WorkspaceLocalAssetTypeAttribute
    """

    FIELD_TYPES = [
        ("text", "Text"),
        ("number", "Number"),
        ("boolean", "Boolean"),
        ("date", "Date"),
        ("datetime", "DateTime"),
        ("json", "JSON"),
        ("link", "Link"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    asset_type = models.ForeignKey(
        "assets.AssetType", on_delete=models.CASCADE, related_name="attributes"
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
    unit = models.CharField(
        max_length=50,
        blank=True,
        help_text="Unit for number attributes (e.g., 'kg', 'm', 'degC'). Uses Pint unit syntax.",
    )
    cannot_override = models.BooleanField(
        default=False,
        help_text="If true, this attribute cannot be overridden by workspaces",
    )
    locked_to_global = models.BooleanField(
        default=False,
        help_text="If true, attribute values are locked to the global defaults and cannot be modified per workspace",
    )

    class Meta:
        ordering = ["order", "name"]
        # NOTE: Unique constraints involving asset_type or deleted_at must be enforced
        # at the database level via pgtrigger since Django doesn't support constraints
        # on child models that reference parent fields in multi-table inheritance.
        triggers = [
            pgtrigger.Trigger(
                name="unique_global_api_key_per_asset_type",
                operation=pgtrigger.Insert | pgtrigger.Update,
                when=pgtrigger.Before,
                func="""
                    IF EXISTS (
                        SELECT 1 
                        FROM public.assets_globalassettypeattribute gata
                        JOIN public.assets_baseassettypeattribute base ON gata.baseassettypeattribute_ptr_id = base.id
                        WHERE base.asset_type_id = (
                            SELECT asset_type_id FROM public.assets_baseassettypeattribute 
                            WHERE id = NEW.baseassettypeattribute_ptr_id
                        )
                        AND gata.api_key = NEW.api_key
                        AND gata.baseassettypeattribute_ptr_id != NEW.baseassettypeattribute_ptr_id
                        AND base.deleted_at IS NULL
                    ) THEN
                        RAISE EXCEPTION 'Duplicate api_key "%" for asset_type', NEW.api_key;
                    END IF;
                    RETURN NEW;
                """,
            ),
            pgtrigger.Trigger(
                name="unique_global_name_per_asset_type",
                operation=pgtrigger.Insert | pgtrigger.Update,
                when=pgtrigger.Before,
                func="""
                    IF EXISTS (
                        SELECT 1 
                        FROM public.assets_globalassettypeattribute gata
                        JOIN public.assets_baseassettypeattribute base ON gata.baseassettypeattribute_ptr_id = base.id
                        WHERE base.asset_type_id = (
                            SELECT asset_type_id FROM public.assets_baseassettypeattribute 
                            WHERE id = NEW.baseassettypeattribute_ptr_id
                        )
                        AND gata.name = NEW.name
                        AND gata.baseassettypeattribute_ptr_id != NEW.baseassettypeattribute_ptr_id
                        AND base.deleted_at IS NULL
                    ) THEN
                        RAISE EXCEPTION 'Duplicate name "%" for asset_type', NEW.name;
                    END IF;
                    RETURN NEW;
                """,
            ),
            pgtrigger.Trigger(
                name="01_update_base_attr_orders_after_delete",
                operation=pgtrigger.Delete,
                when=pgtrigger.After,
                func="""
                    UPDATE public.assets_assettypeattribute 
                    SET "order" = -("order" + 1000)
                    WHERE asset_type_id = OLD.asset_type_id 
                    AND "order" > OLD."order";
                    
                    UPDATE public.assets_assettypeattribute 
                    SET "order" = -("order" + 1000) - 1
                    WHERE asset_type_id = OLD.asset_type_id 
                    AND "order" < -1000;
                    
                    RETURN OLD;
                """,
            ),
        ]

    def __str__(self):
        return f"{self.asset_type.name}.{self.name}"


class WorkspaceOverrideAssetTypeAttribute(BaseAssetTypeAttribute):
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
    api_key = models.CharField(
        max_length=100, help_text="Key used in API serialization"
    )
    attribute_type = models.CharField(
        max_length=20, choices=BaseAssetTypeAttribute.FIELD_TYPES, null=True, blank=True
    )
    is_required = models.BooleanField(null=True, blank=True)
    default_value = models.JSONField(null=True, blank=True)
    description = models.TextField(null=True, blank=True)
    tags = models.JSONField(null=True, blank=True)
    order = models.IntegerField(null=True, blank=True)
    unit = models.CharField(
        max_length=50,
        null=True,
        blank=True,
        help_text="Override unit for number attributes. Null means use base value.",
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["base_attribute", "workspace"],
                name="unique_override_per_workspace",
            ),
        ]
        triggers = [
            pgtrigger.Trigger(
                name="unique_override_name_vs_extensions",
                operation=pgtrigger.Insert | pgtrigger.Update,
                when=pgtrigger.Before,
                func="""
                    -- Only check if name is being set
                    IF NEW.name IS NOT NULL THEN
                        -- Check against extension names in same workspace
                        IF EXISTS (
                            SELECT 1 
                            FROM public.assets_workspacelocalassettypeattribute wea
                            JOIN public.assets_baseassettypeattribute base ON wea.baseassettypeattribute_ptr_id = base.id
                            WHERE wea.workspace_id = NEW.workspace_id
                            AND base.asset_type_id = (
                                SELECT asset_type_id FROM public.assets_baseassettypeattribute 
                                WHERE id = NEW.baseassettypeattribute_ptr_id
                            )
                            AND wea.name = NEW.name
                            AND base.deleted_at IS NULL
                        ) THEN
                            RAISE EXCEPTION 'Name "%" conflicts with an extension in this workspace', NEW.name;
                        END IF;
                        
                        -- Check against other override names in same workspace
                        IF EXISTS (
                            SELECT 1 
                            FROM public.assets_workspaceoverrideassettypeattribute wao
                            JOIN public.assets_baseassettypeattribute base ON wao.baseassettypeattribute_ptr_id = base.id
                            WHERE wao.workspace_id = NEW.workspace_id
                            AND base.asset_type_id = (
                                SELECT asset_type_id FROM public.assets_baseassettypeattribute 
                                WHERE id = NEW.baseassettypeattribute_ptr_id
                            )
                            AND wao.name = NEW.name
                            AND wao.baseassettypeattribute_ptr_id != NEW.baseassettypeattribute_ptr_id
                            AND base.deleted_at IS NULL
                        ) THEN
                            RAISE EXCEPTION 'Name "%" conflicts with another override in this workspace', NEW.name;
                        END IF;
                    END IF;
                    RETURN NEW;
                """,
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


class WorkspaceHiddenAttribute(BaseAssetTypeAttribute):
    """
    Tracks which attributes are hidden in a specific workspace.
    Can hide both GlobalAssetTypeAttribute and WorkspaceLocalAssetTypeAttribute.
    Simple join - no field overrides, just hiding.
    """

    hidden_attribute = models.ForeignKey(
        BaseAssetTypeAttribute,
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
                fields=["hidden_attribute", "workspace"],
                name="unique_hidden_per_workspace",
            ),
        ]

    def __str__(self):
        return f"Hidden: {self.hidden_attribute} in {self.workspace.name}"

    # Flatten hidden_attribute fields for serialization compatibility
    @property
    def name(self):
        """Get name from the hidden attribute."""
        return getattr(self.hidden_attribute, "name", None)

    @property
    def api_key(self):
        """Get api_key from the hidden attribute."""
        return getattr(self.hidden_attribute, "api_key", None)

    @property
    def attribute_type(self):
        """Get attribute_type from the hidden attribute."""
        return getattr(self.hidden_attribute, "attribute_type", None)

    @property
    def is_required(self):
        """Get is_required from the hidden attribute."""
        return getattr(self.hidden_attribute, "is_required", False)

    @property
    def default_value(self):
        """Get default_value from the hidden attribute."""
        return getattr(self.hidden_attribute, "default_value", None)

    @property
    def description(self):
        """Get description from the hidden attribute."""
        return getattr(self.hidden_attribute, "description", "")

    @property
    def tags(self):
        """Get tags from the hidden attribute."""
        return getattr(self.hidden_attribute, "tags", [])

    @property
    def order(self):
        """Get order from the hidden attribute."""
        return getattr(self.hidden_attribute, "order", 0)


class WorkspaceLocalAssetTypeAttribute(BaseAssetTypeAttribute):
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
    default_value = models.JSONField(null=True, blank=True)
    description = models.TextField(blank=True)
    tags = models.JSONField(
        default=list, blank=True, help_text="List of tags for grouping attributes"
    )
    order = models.IntegerField(default=0)
    unit = models.CharField(
        max_length=50,
        blank=True,
        help_text="Unit for number attributes (e.g., 'kg', 'm', 'degC'). Uses Pint unit syntax.",
    )

    class Meta:
        ordering = ["workspace", "order", "name"]
        triggers = [
            pgtrigger.Trigger(
                name="unique_extension_api_key_per_workspace",
                operation=pgtrigger.Insert | pgtrigger.Update,
                when=pgtrigger.Before,
                func="""
                    -- Check against other extensions
                    IF EXISTS (
                        SELECT 1 
                        FROM public.assets_workspacelocalassettypeattribute wea
                        JOIN public.assets_baseassettypeattribute base ON wea.baseassettypeattribute_ptr_id = base.id
                        WHERE wea.workspace_id = NEW.workspace_id
                        AND base.asset_type_id = (
                            SELECT asset_type_id FROM public.assets_baseassettypeattribute 
                            WHERE id = NEW.baseassettypeattribute_ptr_id
                        )
                        AND wea.api_key = NEW.api_key
                        AND wea.baseassettypeattribute_ptr_id != NEW.baseassettypeattribute_ptr_id
                        AND base.deleted_at IS NULL
                    ) THEN
                        RAISE EXCEPTION 'Duplicate api_key "%" for workspace and asset_type', NEW.api_key;
                    END IF;
                    
                    -- Check against global attributes for same asset_type
                    IF EXISTS (
                        SELECT 1 
                        FROM public.assets_globalassettypeattribute gata
                        JOIN public.assets_baseassettypeattribute base ON gata.baseassettypeattribute_ptr_id = base.id
                        WHERE base.asset_type_id = (
                            SELECT asset_type_id FROM public.assets_baseassettypeattribute 
                            WHERE id = NEW.baseassettypeattribute_ptr_id
                        )
                        AND gata.api_key = NEW.api_key
                        AND base.deleted_at IS NULL
                    ) THEN
                        RAISE EXCEPTION 'api_key "%" conflicts with a global attribute', NEW.api_key;
                    END IF;
                    RETURN NEW;
                """,
            ),
            pgtrigger.Trigger(
                name="unique_extension_name_per_workspace",
                operation=pgtrigger.Insert | pgtrigger.Update,
                when=pgtrigger.Before,
                func="""
                    -- Check against other extensions
                    IF EXISTS (
                        SELECT 1 
                        FROM public.assets_workspacelocalassettypeattribute wea
                        JOIN public.assets_baseassettypeattribute base ON wea.baseassettypeattribute_ptr_id = base.id
                        WHERE wea.workspace_id = NEW.workspace_id
                        AND base.asset_type_id = (
                            SELECT asset_type_id FROM public.assets_baseassettypeattribute 
                            WHERE id = NEW.baseassettypeattribute_ptr_id
                        )
                        AND wea.name = NEW.name
                        AND wea.baseassettypeattribute_ptr_id != NEW.baseassettypeattribute_ptr_id
                        AND base.deleted_at IS NULL
                    ) THEN
                        RAISE EXCEPTION 'Duplicate name "%" for workspace and asset_type', NEW.name;
                    END IF;
                    
                    -- Check against override names in same workspace
                    IF EXISTS (
                        SELECT 1 
                        FROM public.assets_workspaceoverrideassettypeattribute wao
                        JOIN public.assets_baseassettypeattribute base ON wao.baseassettypeattribute_ptr_id = base.id
                        WHERE wao.workspace_id = NEW.workspace_id
                        AND base.asset_type_id = (
                            SELECT asset_type_id FROM public.assets_baseassettypeattribute 
                            WHERE id = NEW.baseassettypeattribute_ptr_id
                        )
                        AND wao.name = NEW.name
                        AND wao.name IS NOT NULL
                        AND base.deleted_at IS NULL
                    ) THEN
                        RAISE EXCEPTION 'Name "%" conflicts with an override in this workspace', NEW.name;
                    END IF;
                    
                    -- Check against global attributes for same asset_type
                    IF EXISTS (
                        SELECT 1 
                        FROM public.assets_globalassettypeattribute gata
                        JOIN public.assets_baseassettypeattribute base ON gata.baseassettypeattribute_ptr_id = base.id
                        WHERE base.asset_type_id = (
                            SELECT asset_type_id FROM public.assets_baseassettypeattribute 
                            WHERE id = NEW.baseassettypeattribute_ptr_id
                        )
                        AND gata.name = NEW.name
                        AND base.deleted_at IS NULL
                    ) THEN
                        RAISE EXCEPTION 'Name "%" conflicts with a global attribute', NEW.name;
                    END IF;
                    RETURN NEW;
                """,
            ),
        ]

    def __str__(self):
        return f"{self.asset_type.name}.{self.name} [{self.workspace.name}]"


class WorkspaceAssetTypeConfig(models.Model):
    """
    Workspace-specific configuration for an asset type.
    Stores the custom attribute ordering for this workspace.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        "workspaces.Workspace",
        on_delete=models.CASCADE,
        related_name="asset_type_configs",
    )
    asset_type = models.ForeignKey(
        "assets.AssetType",
        on_delete=models.CASCADE,
        related_name="workspace_configs",
    )
    attribute_order = models.JSONField(
        default=list,
        blank=True,
        help_text="Ordered list of attribute UUIDs (GlobalAssetTypeAttribute and WorkspaceLocalAssetTypeAttribute)",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "asset_type"],
                name="unique_workspace_asset_type_config",
            ),
        ]
        verbose_name = "Workspace Asset Type Config"
        verbose_name_plural = "Workspace Asset Type Configs"

    def __str__(self):
        return f"{self.workspace.name} - {self.asset_type.name} config"


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
