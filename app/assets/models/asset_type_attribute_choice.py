from django.db import models
from polymorphic.models import PolymorphicModel
import uuid
import pgtrigger
from core.models.soft_delete import PolymorphicSoftDeleteMixin


class AssetTypeAttributeChoice(PolymorphicSoftDeleteMixin, PolymorphicModel):
    """Base polymorphic model for attribute choices - value type matches the attribute's type"""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    asset_type_attribute = models.ForeignKey(
        "assets.BaseAssetTypeAttribute",
        on_delete=models.CASCADE,
        related_name="choices",
    )
    icon = models.CharField(
        max_length=100,
        blank=True,
        help_text="Icon identifier (e.g., 'mdi:check', 'fa:star', or URL to icon)",
    )
    color = models.CharField(
        max_length=50,
        blank=True,
        help_text="Color for the choice (e.g., '#FF5733', 'red', 'rgb(255,87,51)')",
    )
    order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta(PolymorphicSoftDeleteMixin.Meta):
        ordering = ["asset_type_attribute", "order"]
        constraints = [
            models.UniqueConstraint(
                fields=["asset_type_attribute", "order"],
                name="unique_ata_choice_order",
                condition=models.Q(deleted_at__isnull=True),
            ),
        ]
        triggers = [
            pgtrigger.Trigger(
                name="prevent_boolean_attribute_choices",
                operation=pgtrigger.Insert,
                when=pgtrigger.Before,
                func="""
                    -- Check GlobalAssetTypeAttribute
                    IF EXISTS (
                        SELECT 1
                        FROM public.assets_globalassettypeattribute gata
                        WHERE gata.baseassettypeattribute_ptr_id = NEW.asset_type_attribute_id
                        AND gata.attribute_type = 'boolean'
                    ) THEN
                        RAISE EXCEPTION 'Boolean attributes cannot have choices';
                    END IF;
                    -- Check WorkspaceLocalAssetTypeAttribute
                    IF EXISTS (
                        SELECT 1
                        FROM public.assets_workspacelocalassettypeattribute wla
                        WHERE wla.baseassettypeattribute_ptr_id = NEW.asset_type_attribute_id
                        AND wla.attribute_type = 'boolean'
                    ) THEN
                        RAISE EXCEPTION 'Boolean attributes cannot have choices';
                    END IF;
                    RETURN NEW;
                """,
            ),
        ]

    def __str__(self):
        value = getattr(self, "value", None)
        return f"{self.asset_type_attribute.name}: {value}"


class TextAttributeChoice(AssetTypeAttributeChoice):
    """Text choice value"""

    value = models.TextField()

    class Meta:
        triggers = [
            pgtrigger.Trigger(
                name="prevent_duplicate_text_choice",
                operation=pgtrigger.Insert | pgtrigger.Update,
                when=pgtrigger.Before,
                func="""
                    IF EXISTS (
                        SELECT 1
                        FROM public.assets_textattributechoice tc
                        JOIN public.assets_assettypeattributechoice base ON tc.assettypeattributechoice_ptr_id = base.id
                        WHERE base.asset_type_attribute_id = (
                            SELECT asset_type_attribute_id FROM public.assets_assettypeattributechoice WHERE id = NEW.assettypeattributechoice_ptr_id
                        )
                        AND tc.value = NEW.value
                        AND tc.assettypeattributechoice_ptr_id != NEW.assettypeattributechoice_ptr_id
                        AND base.deleted_at IS NULL
                    ) THEN
                        RAISE EXCEPTION 'A choice with this value already exists for this attribute';
                    END IF;
                    RETURN NEW;
                """,
            ),
        ]


class NumberAttributeChoice(AssetTypeAttributeChoice):
    """Number choice value"""

    value = models.FloatField()

    class Meta:
        triggers = [
            pgtrigger.Trigger(
                name="prevent_duplicate_number_choice",
                operation=pgtrigger.Insert | pgtrigger.Update,
                when=pgtrigger.Before,
                func="""
                    IF EXISTS (
                        SELECT 1
                        FROM public.assets_numberattributechoice nc
                        JOIN public.assets_assettypeattributechoice base ON nc.assettypeattributechoice_ptr_id = base.id
                        WHERE base.asset_type_attribute_id = (
                            SELECT asset_type_attribute_id FROM public.assets_assettypeattributechoice WHERE id = NEW.assettypeattributechoice_ptr_id
                        )
                        AND nc.value = NEW.value
                        AND nc.assettypeattributechoice_ptr_id != NEW.assettypeattributechoice_ptr_id
                        AND base.deleted_at IS NULL
                    ) THEN
                        RAISE EXCEPTION 'A choice with this value already exists for this attribute';
                    END IF;
                    RETURN NEW;
                """,
            ),
        ]


class DateAttributeChoice(AssetTypeAttributeChoice):
    """Date choice value"""

    value = models.DateField()

    class Meta:
        triggers = [
            pgtrigger.Trigger(
                name="prevent_duplicate_date_choice",
                operation=pgtrigger.Insert | pgtrigger.Update,
                when=pgtrigger.Before,
                func="""
                    IF EXISTS (
                        SELECT 1
                        FROM public.assets_dateattributechoice dc
                        JOIN public.assets_assettypeattributechoice base ON dc.assettypeattributechoice_ptr_id = base.id
                        WHERE base.asset_type_attribute_id = (
                            SELECT asset_type_attribute_id FROM public.assets_assettypeattributechoice WHERE id = NEW.assettypeattributechoice_ptr_id
                        )
                        AND dc.value = NEW.value
                        AND dc.assettypeattributechoice_ptr_id != NEW.assettypeattributechoice_ptr_id
                        AND base.deleted_at IS NULL
                    ) THEN
                        RAISE EXCEPTION 'A choice with this value already exists for this attribute';
                    END IF;
                    RETURN NEW;
                """,
            ),
        ]


class DateTimeAttributeChoice(AssetTypeAttributeChoice):
    """DateTime choice value"""

    value = models.DateTimeField()

    class Meta:
        triggers = [
            pgtrigger.Trigger(
                name="prevent_duplicate_datetime_choice",
                operation=pgtrigger.Insert | pgtrigger.Update,
                when=pgtrigger.Before,
                func="""
                    IF EXISTS (
                        SELECT 1
                        FROM public.assets_datetimeattributechoice dtc
                        JOIN public.assets_assettypeattributechoice base ON dtc.assettypeattributechoice_ptr_id = base.id
                        WHERE base.asset_type_attribute_id = (
                            SELECT asset_type_attribute_id FROM public.assets_assettypeattributechoice WHERE id = NEW.assettypeattributechoice_ptr_id
                        )
                        AND dtc.value = NEW.value
                        AND dtc.assettypeattributechoice_ptr_id != NEW.assettypeattributechoice_ptr_id
                        AND base.deleted_at IS NULL
                    ) THEN
                        RAISE EXCEPTION 'A choice with this value already exists for this attribute';
                    END IF;
                    RETURN NEW;
                """,
            ),
        ]


class JSONAttributeChoice(AssetTypeAttributeChoice):
    """JSON choice value"""

    value = models.JSONField()

    class Meta:
        triggers = [
            pgtrigger.Trigger(
                name="prevent_duplicate_json_choice",
                operation=pgtrigger.Insert | pgtrigger.Update,
                when=pgtrigger.Before,
                func="""
                    IF EXISTS (
                        SELECT 1
                        FROM public.assets_jsonattributechoice jc
                        JOIN public.assets_assettypeattributechoice base ON jc.assettypeattributechoice_ptr_id = base.id
                        WHERE base.asset_type_attribute_id = (
                            SELECT asset_type_attribute_id FROM public.assets_assettypeattributechoice WHERE id = NEW.assettypeattributechoice_ptr_id
                        )
                        AND jc.value = NEW.value
                        AND jc.assettypeattributechoice_ptr_id != NEW.assettypeattributechoice_ptr_id
                        AND base.deleted_at IS NULL
                    ) THEN
                        RAISE EXCEPTION 'A choice with this value already exists for this attribute';
                    END IF;
                    RETURN NEW;
                """,
            ),
        ]


class LinkAttributeChoice(AssetTypeAttributeChoice):
    """Link/URL choice value with optional display text"""

    url = models.URLField(max_length=2000)
    display_text = models.CharField(max_length=500, blank=True)

    class Meta:
        triggers = [
            pgtrigger.Trigger(
                name="prevent_duplicate_link_choice",
                operation=pgtrigger.Insert | pgtrigger.Update,
                when=pgtrigger.Before,
                func="""
                    IF EXISTS (
                        SELECT 1
                        FROM public.assets_linkattributechoice lc
                        JOIN public.assets_assettypeattributechoice base ON lc.assettypeattributechoice_ptr_id = base.id
                        WHERE base.asset_type_attribute_id = (
                            SELECT asset_type_attribute_id FROM public.assets_assettypeattributechoice WHERE id = NEW.assettypeattributechoice_ptr_id
                        )
                        AND lc.url = NEW.url
                        AND lc.assettypeattributechoice_ptr_id != NEW.assettypeattributechoice_ptr_id
                        AND base.deleted_at IS NULL
                    ) THEN
                        RAISE EXCEPTION 'A choice with this URL already exists for this attribute';
                    END IF;
                    RETURN NEW;
                """,
            ),
        ]

    @property
    def value(self):
        """Return link data as a dict"""
        return {
            "url": self.url,
            "text": self.display_text or self.url,
        }

    @value.setter
    def value(self, val):
        """Accept either a string URL or a dict with url/text"""
        if isinstance(val, dict):
            self.url = val.get("url", "")
            self.display_text = val.get("text", "")
        else:
            self.url = val or ""
            self.display_text = ""


# =============================================================================
# Workspace Choice Models (Override, Hidden, Extension)
# =============================================================================


class BaseWorkspaceChoice(PolymorphicSoftDeleteMixin, PolymorphicModel):
    """
    Base polymorphic model for workspace-specific choice modifications.
    Subclasses: WorkspaceChoiceOverride, WorkspaceHiddenChoice, WorkspaceExtensionChoice
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        "workspaces.Workspace",
        on_delete=models.CASCADE,
        related_name="choice_modifications",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta(PolymorphicSoftDeleteMixin.Meta):
        pass


class WorkspaceChoiceOverride(BaseWorkspaceChoice):
    """
    Override properties of a base choice for a specific workspace.
    Null fields mean "use base value".
    """

    base_choice = models.ForeignKey(
        AssetTypeAttributeChoice,
        on_delete=models.CASCADE,
        related_name="overrides",
        help_text="The base choice this overrides",
    )
    # Overridable fields - null means "use base value"
    icon = models.CharField(max_length=100, null=True, blank=True)
    color = models.CharField(max_length=50, null=True, blank=True)
    order = models.IntegerField(null=True, blank=True)

    class Meta:
        # NOTE: Uniqueness enforced at application level
        pass

    def __str__(self):
        return f"Override: {self.base_choice} in {self.workspace.name}"

    def get_effective_value(self, field_name):
        """Get the effective value for a field, falling back to base choice."""
        override_value = getattr(self, field_name)
        if override_value is not None:
            return override_value
        return getattr(self.base_choice, field_name)

    @property
    def value(self):
        """Value comes from base choice (cannot be overridden)."""
        return self.base_choice.value


class WorkspaceHiddenChoice(BaseWorkspaceChoice):
    """
    Hide a base choice in a specific workspace.
    Simple join table - no field overrides, just hiding.
    """

    base_choice = models.ForeignKey(
        AssetTypeAttributeChoice,
        on_delete=models.CASCADE,
        related_name="hidden_in_workspaces",
    )

    class Meta:
        # NOTE: Uniqueness enforced at application level
        pass

    def __str__(self):
        return f"Hidden: {self.base_choice} in {self.workspace.name}"


class BaseWorkspaceExtensionChoice(BaseWorkspaceChoice):
    """
    Base for workspace-specific extension choices.
    These are new choices added by a workspace to an attribute.
    Uses polymorphism for typed values like the base choices.
    """

    # Can be attached to either a GlobalAssetTypeAttribute or WorkspaceLocalAssetTypeAttribute
    # Using the base polymorphic model to support both
    global_attribute = models.ForeignKey(
        "assets.GlobalAssetTypeAttribute",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="extension_choices",
        help_text="Global attribute this choice extends (if applicable)",
    )
    extension_attribute = models.ForeignKey(
        "assets.WorkspaceLocalAssetTypeAttribute",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="workspace_extension_choices",
        help_text="Extension attribute this choice belongs to (if applicable)",
    )
    icon = models.CharField(max_length=100, blank=True)
    color = models.CharField(max_length=50, blank=True)
    order = models.IntegerField(default=0)
    is_hidden = models.BooleanField(default=False)

    class Meta:
        constraints = [
            # Ensure exactly one attribute FK is set
            models.CheckConstraint(
                condition=(
                    models.Q(
                        global_attribute__isnull=False, extension_attribute__isnull=True
                    )
                    | models.Q(
                        global_attribute__isnull=True, extension_attribute__isnull=False
                    )
                ),
                name="extension_choice_has_one_attribute",
            ),
        ]

    def __str__(self):
        attr = self.global_attribute or self.extension_attribute
        value = getattr(self, "value", None)
        return f"Extension choice: {value} for {attr.name} in {self.workspace.name}"


class TextExtensionChoice(BaseWorkspaceExtensionChoice):
    """Text extension choice value"""

    value = models.TextField()


class NumberExtensionChoice(BaseWorkspaceExtensionChoice):
    """Number extension choice value"""

    value = models.FloatField()


class DateExtensionChoice(BaseWorkspaceExtensionChoice):
    """Date extension choice value"""

    value = models.DateField()


class DateTimeExtensionChoice(BaseWorkspaceExtensionChoice):
    """DateTime extension choice value"""

    value = models.DateTimeField()


class JSONExtensionChoice(BaseWorkspaceExtensionChoice):
    """JSON extension choice value"""

    value = models.JSONField()


class LinkExtensionChoice(BaseWorkspaceExtensionChoice):
    """Link/URL extension choice value with optional display text"""

    url = models.URLField(max_length=2000)
    display_text = models.CharField(max_length=500, blank=True)

    @property
    def value(self):
        """Return link data as a dict"""
        return {
            "url": self.url,
            "text": self.display_text or self.url,
        }

    @value.setter
    def value(self, val):
        """Accept either a string URL or a dict with url/text"""
        if isinstance(val, dict):
            self.url = val.get("url", "")
            self.display_text = val.get("text", "")
        else:
            self.url = val or ""
            self.display_text = ""
