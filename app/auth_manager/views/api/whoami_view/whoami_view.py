# local
from auth_manager.permissions import IsMultiFactorAuthenticated
from users_manager.serializers import UserSerializer
from users_manager.permissions.caching import permission_cache

# thirdparty
from rest_framework.response import Response
from rest_framework.views import APIView


class WhoAmIView(APIView):
    permission_classes = [IsMultiFactorAuthenticated]

    def get(self, request) -> Response:
        """
        Get the details of the currently authenticated user,
        including their permissions for each scope.
        """
        user = request.user
        user_data = UserSerializer(user, context={"request": request}).data

        # Get accessible organizations and workspaces
        org_ids = permission_cache.get_user_organization_ids(user)
        ws_ids = permission_cache.get_user_workspace_ids(user)

        # Build permissions by scope
        permissions = {
            "instance": list(permission_cache.get_instance_permissions(user)),
            "organizations": {},
            "workspaces": {},
        }

        # Get permissions for each organization
        from organizations.models import Organization

        for org_id in org_ids:
            try:
                org = Organization.objects.get(id=org_id)
                perms = permission_cache.get_organization_permissions(user, org)
                permissions["organizations"][str(org_id)] = list(perms)
            except Organization.DoesNotExist:
                continue

        # Get permissions for each workspace
        from workspaces.models import Workspace

        for ws_id in ws_ids:
            try:
                ws = Workspace.objects.get(id=ws_id)
                perms = permission_cache.get_workspace_permissions(user, ws)
                permissions["workspaces"][str(ws_id)] = list(perms)
            except Workspace.DoesNotExist:
                continue

        user_data["permissions"] = permissions

        return Response(user_data)
