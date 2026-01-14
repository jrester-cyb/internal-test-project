"""
URL configuration for audit log API.
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import AuditLogRequestViewSet, AuditLogEntryViewSet

router = DefaultRouter()
router.register(r"requests", AuditLogRequestViewSet, basename="audit-log-request")
router.register(r"entries", AuditLogEntryViewSet, basename="audit-log-entry")

urlpatterns = [
    path("", include(router.urls)),
]
