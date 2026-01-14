"""URL configuration for utils app."""

from django.urls import path

from .units.views import UnitCategoriesView, UnitConvertView

urlpatterns = [
    path("units/", UnitCategoriesView.as_view(), name="unit-categories"),
    path("units/convert/", UnitConvertView.as_view(), name="unit-convert"),
]
