from django.contrib import admin
from django.contrib.gis.admin import GISModelAdmin
from polymorphic.admin import PolymorphicParentModelAdmin, PolymorphicChildModelAdmin
from .models import (
    AssetType,
    AssetAttributeDefinition,
    Asset,
    BaseAttributeValue,
    TextAttributeValue,
    NumberAttributeValue,
    BooleanAttributeValue,
    DateAttributeValue,
    DateTimeAttributeValue,
    JSONAttributeValue,
)


class AssetAttributeDefinitionInline(admin.TabularInline):
    model = AssetAttributeDefinition
    extra = 1
    fields = [
        "name",
        "api_key",
        "attribute_type",
        "is_required",
        "default_value",
        "order",
    ]


class AssetAttributeInline(admin.TabularInline):
    model = BaseAttributeValue
    extra = 0
    fields = ["field_definition", "polymorphic_ctype"]
    readonly_fields = ["field_definition", "polymorphic_ctype"]
    can_delete = True


@admin.register(AssetType)
class AssetTypeAdmin(admin.ModelAdmin):
    list_display = ["name", "created_at", "asset_count"]
    search_fields = ["name", "description"]
    readonly_fields = ["created_at", "updated_at"]
    inlines = [AssetAttributeDefinitionInline]

    def asset_count(self, obj):
        return obj.assets.count()

    asset_count.short_description = "Number of Assets"


@admin.register(AssetAttributeDefinition)
class AssetAttributeDefinitionAdmin(admin.ModelAdmin):
    list_display = [
        "name",
        "asset_type",
        "attribute_type",
        "is_required",
        "order",
        "created_at",
    ]
    list_filter = ["asset_type", "attribute_type", "is_required"]
    search_fields = ["name", "description"]
    readonly_fields = ["created_at", "updated_at"]


@admin.register(Asset)
class AssetAdmin(GISModelAdmin):
    list_display = ["name", "asset_type", "created_at"]
    list_filter = ["asset_type"]
    search_fields = ["name", "description"]
    readonly_fields = ["created_at", "updated_at"]
    inlines = [AssetAttributeInline]


# Polymorphic admin for attribute values
class BaseAttributeValueChildAdmin(PolymorphicChildModelAdmin):
    base_model = BaseAttributeValue
    readonly_fields = ["created_at", "updated_at"]


@admin.register(TextAttributeValue)
class TextAttributeValueAdmin(BaseAttributeValueChildAdmin):
    base_model = TextAttributeValue
    list_display = ["asset", "field_definition", "value"]


@admin.register(NumberAttributeValue)
class NumberAttributeValueAdmin(BaseAttributeValueChildAdmin):
    base_model = NumberAttributeValue
    list_display = ["asset", "field_definition", "value"]


@admin.register(BooleanAttributeValue)
class BooleanAttributeValueAdmin(BaseAttributeValueChildAdmin):
    base_model = BooleanAttributeValue
    list_display = ["asset", "field_definition", "value"]


@admin.register(DateAttributeValue)
class DateAttributeValueAdmin(BaseAttributeValueChildAdmin):
    base_model = DateAttributeValue
    list_display = ["asset", "field_definition", "value"]


@admin.register(DateTimeAttributeValue)
class DateTimeAttributeValueAdmin(BaseAttributeValueChildAdmin):
    base_model = DateTimeAttributeValue
    list_display = ["asset", "field_definition", "value"]


@admin.register(JSONAttributeValue)
class JSONAttributeValueAdmin(BaseAttributeValueChildAdmin):
    base_model = JSONAttributeValue
    list_display = ["asset", "field_definition", "value"]


@admin.register(BaseAttributeValue)
class BaseAttributeValueAdmin(PolymorphicParentModelAdmin):
    base_model = BaseAttributeValue
    child_models = (
        TextAttributeValue,
        NumberAttributeValue,
        BooleanAttributeValue,
        DateAttributeValue,
        DateTimeAttributeValue,
        JSONAttributeValue,
    )
    list_display = ["asset", "field_definition", "polymorphic_ctype", "updated_at"]
    list_filter = ["field_definition__asset_type", "polymorphic_ctype"]
    search_fields = ["asset__name", "field_definition__field_name"]
