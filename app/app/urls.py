"""
URL configuration for app project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""

from django.contrib import admin
from django.urls import path, include
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularSwaggerView,
    SpectacularRedocView,
)
from assets.views import get_attribute_types

urlpatterns = [
    path("admin/", admin.site.urls),
    # Auth manager
    path("auth/", include("auth_manager.auth_urls")),
    path("api/v3/auth/", include("auth_manager.urls")),
    # API routes
    path("api/v3/", include("todos.urls")),
    path("api/v3/", include("organizations.urls")),
    path("api/v3/", include("users_manager.urls")),
    path("api/v3/utils/", include("utils.urls")),
    path("api/v3/attribute-types/", get_attribute_types, name="attribute-types"),
    path("api/v3/audit/", include("audit_log.urls")),
    path("api/v3/actions/", include("actions.urls")),
    # Silk profiling dashboard
    path("silk/", include("silk.urls", namespace="silk")),
    # OpenAPI schema
    path("api/v3/schema/", SpectacularAPIView.as_view(), name="schema"),
    # Swagger UI
    path(
        "api/v3/docs/",
        SpectacularSwaggerView.as_view(url_name="schema"),
        name="swagger-ui",
    ),
    # ReDoc UI (alternative documentation)
    path("api/v3/redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),
]
