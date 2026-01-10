from django.contrib import admin
from django.contrib.gis.admin import GISModelAdmin
from polymorphic.admin import PolymorphicParentModelAdmin, PolymorphicChildModelAdmin
from .models import (
    AssetType,
    AssetTypeAttribute,
    Asset,
    BaseAttributeValue,
    TextAttributeValue,
    NumberAttributeValue,
    BooleanAttributeValue,
    DateAttributeValue,
    DateTimeAttributeValue,
    JSONAttributeValue,
)


class AssetTypeAttributeInline(admin.TabularInline):
    model = AssetTypeAttribute
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
    fields = ["attribute_type_attribute", "polymorphic_ctype"]
    readonly_fields = ["attribute_type_attribute", "polymorphic_ctype"]
    can_delete = True


@admin.register(AssetType)
class AssetTypeAdmin(admin.ModelAdmin):
    list_display = ["name", "created_at", "asset_count"]
    search_fields = ["name", "description"]
    readonly_fields = ["created_at", "updated_at"]
    inlines = [AssetTypeAttributeInline]

    def asset_count(self, obj):
        return obj.assets.count()

    asset_count.short_description = "Number of Assets"


@admin.register(AssetTypeAttribute)
class AssetTypeAttributeAdmin(admin.ModelAdmin):
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
    list_display = ["asset", "attribute_type_attribute", "value"]


@admin.register(NumberAttributeValue)
class NumberAttributeValueAdmin(BaseAttributeValueChildAdmin):
    base_model = NumberAttributeValue
    list_display = ["asset", "attribute_type_attribute", "value"]


@admin.register(BooleanAttributeValue)
class BooleanAttributeValueAdmin(BaseAttributeValueChildAdmin):
    base_model = BooleanAttributeValue
    list_display = ["asset", "attribute_type_attribute", "value"]


@admin.register(DateAttributeValue)
class DateAttributeValueAdmin(BaseAttributeValueChildAdmin):
    base_model = DateAttributeValue
    list_display = ["asset", "attribute_type_attribute", "value"]


@admin.register(DateTimeAttributeValue)
class DateTimeAttributeValueAdmin(BaseAttributeValueChildAdmin):
    base_model = DateTimeAttributeValue
    list_display = ["asset", "attribute_type_attribute", "value"]


@admin.register(JSONAttributeValue)
class JSONAttributeValueAdmin(BaseAttributeValueChildAdmin):
    base_model = JSONAttributeValue
    list_display = ["asset", "attribute_type_attribute", "value"]


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
    list_display = [
        "asset",
        "attribute_type_attribute",
        "polymorphic_ctype",
        "updated_at",
    ]
    list_filter = ["attribute_type_attribute__asset_type", "polymorphic_ctype"]
    search_fields = ["asset__name", "attribute_type_attribute__name"]
