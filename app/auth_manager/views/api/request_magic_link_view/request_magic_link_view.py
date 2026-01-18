# django
from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied

# local
from auth_manager.emails import MagicLinkRequestEmail
from auth_manager.models import OneTimeToken
from django.urls import reverse

# thirdparty
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

User = get_user_model()


class RequestMagicLinkAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs) -> Response:
        token = request.data.get("token", "")
        is_valid, user = OneTimeToken.objects.validate_token(token, token_expiration_time=300)
        if not is_valid:
            raise PermissionDenied()

        # Generate a new token for the magic link
        new_token = OneTimeToken.objects.generate_token(user=user)

        # Send the magic link email
        MagicLinkRequestEmail(
            user_first_name=user.first_name,
            user_email=user.email,
            login_url=reverse(
                "auth-manager:magic-link-callback",
                args=(new_token,),
                request=request,
            ),
        ).send()

        return Response(data="Ok", status=status.HTTP_200_OK)
