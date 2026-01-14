"""
URL configuration for audit log API.
"""

from django.urls import path
from .views import AuditLogEntryListView

urlpatterns = [
    path("entries/", AuditLogEntryListView.as_view(), name="audit-log-entries"),
]
