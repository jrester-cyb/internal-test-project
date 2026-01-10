from django.contrib import admin
from .models import TodoList, Todo


@admin.register(TodoList)
class TodoListAdmin(admin.ModelAdmin):
    list_display = ["name", "created_at", "todo_count"]
    search_fields = ["name", "description"]
    readonly_fields = ["created_at", "updated_at"]

    def todo_count(self, obj):
        return obj.todos.count()

    todo_count.short_description = "Number of Todos"


@admin.register(Todo)
class TodoAdmin(admin.ModelAdmin):
    list_display = [
        "title",
        "todo_list",
        "priority",
        "completed",
        "due_date",
        "created_at",
    ]
    list_filter = ["completed", "priority", "todo_list"]
    search_fields = ["title", "description"]
    readonly_fields = ["created_at", "updated_at"]
