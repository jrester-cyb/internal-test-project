# thirdparty
from rest_framework import status
from rest_framework.exceptions import APIException


class IncorrectCredentials(APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = "Invalid username or password"
    default_code = "incorrect_credentials"


class IdentityProviderNotFound(APIException):
    status_code = status.HTTP_404_NOT_FOUND
    default_detail = "Identity provider not found"
    default_code = "identity_provider_not_found"


class UserAlreadyLinked(APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = "User already linked to another identity provider"
    default_code = "user_already_linked"


class BadRequest(APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = "Bad request"
    default_code = "bad_request"


class LockedAccount(APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = "This account is locked. Please contact your administrator or try again in 5 minutes."
    default_code = "locked_account"
