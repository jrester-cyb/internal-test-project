# stdlib

# django
from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied

# local
from auth_manager.models.one_time_token import OneTimeToken

# thirdparty
from knox.models import AuthToken
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

User = get_user_model()


class APITokenInitView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs) -> Response:
        token = request.data.get("token", "")
        is_valid, user = OneTimeToken.objects.validate_token(token)
        if not is_valid:
            raise PermissionDenied()

        _, auth_token = AuthToken.objects.create(user=user)
        return Response({"token": auth_token}, status=201)
