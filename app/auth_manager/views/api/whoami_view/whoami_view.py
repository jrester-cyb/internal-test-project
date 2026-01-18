# local
from auth_manager.permissions import IsMultiFactorAuthenticated
from users_manager.serializers import UserSerializer

# thirdparty
from rest_framework.response import Response
from rest_framework.views import APIView


class WhoAmIView(APIView):
    permission_classes = [IsMultiFactorAuthenticated]

    def get(self, request) -> Response:
        """
        Get the details of the currently authenticated user.
        """
        return Response(UserSerializer(request.user, context={"request": request}).data)
