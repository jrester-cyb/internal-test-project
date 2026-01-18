# django
from django.contrib.auth import get_user_model
from django.views.generic import TemplateView

# local
from auth_manager.constants import PROVIDED_EMAIL

User = get_user_model()


class ForgottenPasswordView(TemplateView):
    template_name = "forgotten_password.html"

    def get_context_data(self, **kwargs):
        context_data = super().get_context_data(**kwargs)
        context_data["email"] = self.request.session.get(PROVIDED_EMAIL)
        return context_data
