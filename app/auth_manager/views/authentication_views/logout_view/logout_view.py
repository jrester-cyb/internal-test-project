# django
from django.contrib.auth import logout
from django.shortcuts import redirect
from django.views import View


class LogoutView(View):
    def dispatch(self, request, *args, **kwargs):
        logout(request)
        return redirect("auth-manager:login")
