from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_nested import routers
from .views import TodoListViewSet, TodoViewSet

router = DefaultRouter()
router.register(r"lists", TodoListViewSet, basename="todolist")

# Nested router for todos under lists
lists_router = routers.NestedDefaultRouter(router, r"lists", lookup="list")
lists_router.register(r"todos", TodoViewSet, basename="list-todos")

urlpatterns = [
    path("", include(router.urls)),
    path("", include(lists_router.urls)),
]
