"""
URL configuration for audit log API.
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import AuditLogBatchViewSet, AuditLogEntryViewSet

router = DefaultRouter()
router.register(r"batches", AuditLogBatchViewSet, basename="audit-batch")
router.register(r"entries", AuditLogEntryViewSet, basename="audit-entry")

urlpatterns = [
    path("", include(router.urls)),
]
