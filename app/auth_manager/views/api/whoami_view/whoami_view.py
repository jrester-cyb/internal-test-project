# local
from multifactor_auth.permissions import IsMultiFactorAuthenticated
from users.serializers import UserDetailSerializer

# thirdparty
from rest_framework.response import Response
from rest_framework.views import APIView


class WhoAmIView(APIView):
    permission_classes = [IsMultiFactorAuthenticated]

    def get(self, request) -> Response:
        """
        Get the details of the currently authenticated user.
        """
        return Response(UserDetailSerializer(request.user, context={"request": request}).data)
