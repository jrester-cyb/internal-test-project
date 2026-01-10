from rest_framework import viewsets, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, extend_schema_view
from .models import TodoList, Todo
from .serializers import (
    TodoListSerializer,
    TodoListSummarySerializer,
    TodoSerializer,
)


@extend_schema_view(
    list=extend_schema(tags=["Lists"]),
    create=extend_schema(tags=["Lists"]),
    retrieve=extend_schema(tags=["Lists"]),
    update=extend_schema(tags=["Lists"]),
    partial_update=extend_schema(tags=["Lists"]),
    destroy=extend_schema(tags=["Lists"]),
)
class TodoListViewSet(viewsets.ModelViewSet):
    """
    ViewSet for TodoList model.

    list: Get all todo lists
    create: Create a new todo list
    retrieve: Get a specific todo list with all its todos
    update: Update a todo list
    partial_update: Partially update a todo list
    destroy: Delete a todo list
    """

    queryset = TodoList.objects.all()
    serializer_class = TodoListSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name", "description"]
    ordering_fields = ["name", "created_at"]

    def get_serializer_class(self):
        """Use summary serializer for list view to reduce payload"""
        if self.action == "list":
            return TodoListSummarySerializer
        return TodoListSerializer


@extend_schema_view(
    list=extend_schema(tags=["Todos"]),
    create=extend_schema(tags=["Todos"]),
    retrieve=extend_schema(tags=["Todos"]),
    update=extend_schema(tags=["Todos"]),
    partial_update=extend_schema(tags=["Todos"]),
    destroy=extend_schema(tags=["Todos"]),
)
class TodoViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Todo model.

    list: Get all todos for a specific list
    create: Create a new todo in a specific list
    retrieve: Get a specific todo
    update: Update a todo
    partial_update: Partially update a todo
    destroy: Delete a todo
    toggle_complete: Toggle the completion status of a todo
    """

    serializer_class = TodoSerializer
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_fields = ["completed", "priority"]
    search_fields = ["title", "description"]
    ordering_fields = ["priority", "due_date", "created_at"]

    def get_queryset(self):
        """Filter todos by parent list"""
        return Todo.objects.filter(todo_list_id=self.kwargs["list_pk"])

    def perform_create(self, serializer):
        """Automatically set the todo_list when creating"""
        serializer.save(todo_list_id=self.kwargs["list_pk"])

    @extend_schema(tags=["Todos"])
    @action(detail=True, methods=["post"])
    def toggle_complete(self, request, pk=None):
        """Toggle the completion status of a todo"""
        todo = self.get_object()
        todo.completed = not todo.completed
        todo.save()
        serializer = self.get_serializer(todo)
        return Response(serializer.data)
