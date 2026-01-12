from django.urls import path, include
from rest_framework_nested import routers
from .views import FileNodeViewSet

# These routes will be nested under assets
# e.g., /api/workspaces/{workspace_pk}/assets/{asset_pk}/files/

router = routers.SimpleRouter()

urlpatterns = [
    path("", include(router.urls)),
]
