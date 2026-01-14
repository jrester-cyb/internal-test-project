from django.contrib import admin
from .models import Trigger, Action, ActionExecution


class ActionInline(admin.TabularInline):
    model = Action
    extra = 1
    fields = ["name", "action_type", "config", "order", "is_active"]


@admin.register(Trigger)
class TriggerAdmin(admin.ModelAdmin):
    list_display = [
        "name",
        "event_action",
        "target_content_type",
        "organization",
        "is_active",
        "created_at",
    ]
    list_filter = ["is_active", "event_action", "target_content_type"]
    search_fields = ["name", "description"]
    inlines = [ActionInline]
    readonly_fields = ["created_at", "updated_at"]


@admin.register(Action)
class ActionAdmin(admin.ModelAdmin):
    list_display = ["name", "trigger", "action_type", "order", "is_active"]
    list_filter = ["is_active", "action_type"]
    search_fields = ["name", "trigger__name"]
    readonly_fields = ["created_at", "updated_at"]


@admin.register(ActionExecution)
class ActionExecutionAdmin(admin.ModelAdmin):
    list_display = ["action", "audit_entry", "status", "started_at", "completed_at"]
    list_filter = ["status", "action__action_type"]
    readonly_fields = [
        "action",
        "audit_entry",
        "status",
        "result",
        "started_at",
        "completed_at",
        "created_at",
    ]
    ordering = ["-created_at"]
