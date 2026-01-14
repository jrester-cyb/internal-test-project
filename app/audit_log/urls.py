"""
URL configuration for audit log API.
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import AuditLogEntryViewSet

router = DefaultRouter()
router.register(r"", AuditLogEntryViewSet, basename="audit-log")

urlpatterns = [
    path("", include(router.urls)),
]
