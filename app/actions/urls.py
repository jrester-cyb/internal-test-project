"""
URL configuration for actions app.
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import TriggerViewSet, ActionViewSet, ActionExecutionViewSet

router = DefaultRouter()
router.register(r"triggers", TriggerViewSet, basename="trigger")
router.register(r"actions", ActionViewSet, basename="action")
router.register(r"executions", ActionExecutionViewSet, basename="action-execution")

urlpatterns = [
    path("", include(router.urls)),
]
