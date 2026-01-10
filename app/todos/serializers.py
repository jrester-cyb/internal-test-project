from rest_framework import serializers
from .models import TodoList, Todo


class TodoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Todo
        fields = [
            "id",
            "todo_list",
            "title",
            "description",
            "completed",
            "priority",
            "due_date",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class TodoListSerializer(serializers.ModelSerializer):
    todos = TodoSerializer(many=True, read_only=True)
    todo_count = serializers.IntegerField(source="todos.count", read_only=True)

    class Meta:
        model = TodoList
        fields = [
            "id",
            "name",
            "description",
            "todo_count",
            "todos",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class TodoListSummarySerializer(serializers.ModelSerializer):
    """Lightweight serializer without nested todos"""

    todo_count = serializers.IntegerField(source="todos.count", read_only=True)

    class Meta:
        model = TodoList
        fields = [
            "id",
            "name",
            "description",
            "todo_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
