"""Tests for unit views."""

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase


class TestUnitCategoriesView(APITestCase):
    """Tests for UnitCategoriesView."""

    def test_list_categories_returns_200(self):
        response = self.client.get(reverse("unit-categories"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_list_categories_returns_paginated_response(self):
        response = self.client.get(reverse("unit-categories"))
        data = response.json()
        self.assertIn("count", data)
        self.assertIn("results", data)

    def test_list_categories_has_expected_categories(self):
        response = self.client.get(reverse("unit-categories"))
        data = response.json()
        category_keys = {cat["key"] for cat in data["results"]}
        self.assertIn("mass", category_keys)
        self.assertIn("length", category_keys)
        self.assertIn("temperature", category_keys)

    def test_category_has_required_fields(self):
        response = self.client.get(reverse("unit-categories"))
        data = response.json()
        category = data["results"][0]
        self.assertIn("key", category)
        self.assertIn("name", category)
        self.assertIn("baseUnit", category)  # camelCase from DRF
        self.assertIn("units", category)

    def test_unit_has_required_fields(self):
        response = self.client.get(reverse("unit-categories"))
        data = response.json()
        unit = data["results"][0]["units"][0]
        self.assertIn("code", unit)
        self.assertIn("symbol", unit)
        self.assertIn("name", unit)
        self.assertIn("isBase", unit)  # camelCase from DRF

    def test_pagination_with_page_size(self):
        response = self.client.get(reverse("unit-categories"), {"page_size": 2})
        data = response.json()
        self.assertEqual(len(data["results"]), 2)
        self.assertGreater(data["count"], 2)  # Total count should be greater

    def test_pagination_next_link(self):
        response = self.client.get(reverse("unit-categories"), {"page_size": 2})
        data = response.json()
        self.assertIsNotNone(data["next"])


class TestUnitConvertView(APITestCase):
    """Tests for UnitConvertView."""

    def test_convert_kg_to_lb(self):
        response = self.client.post(
            reverse("unit-convert"),
            {"value": 1, "fromUnit": "kg", "toUnit": "lb"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertAlmostEqual(data["value"], 2.20462, places=3)
        self.assertEqual(data["fromUnit"], "kg")
        self.assertEqual(data["toUnit"], "lb")

    def test_convert_celsius_to_fahrenheit(self):
        response = self.client.post(
            reverse("unit-convert"),
            {"value": 100, "fromUnit": "degC", "toUnit": "degF"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertAlmostEqual(data["value"], 212, places=1)

    def test_convert_meters_to_feet(self):
        response = self.client.post(
            reverse("unit-convert"),
            {"value": 1, "fromUnit": "m", "toUnit": "ft"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertAlmostEqual(data["value"], 3.28084, places=3)

    def test_convert_missing_value_returns_400(self):
        response = self.client.post(
            reverse("unit-convert"),
            {"fromUnit": "kg", "toUnit": "lb"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_convert_missing_from_unit_returns_400(self):
        response = self.client.post(
            reverse("unit-convert"),
            {"value": 1, "toUnit": "lb"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_convert_missing_to_unit_returns_400(self):
        response = self.client.post(
            reverse("unit-convert"),
            {"value": 1, "fromUnit": "kg"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_convert_invalid_from_unit_returns_400(self):
        response = self.client.post(
            reverse("unit-convert"),
            {"value": 1, "fromUnit": "invalid_unit", "toUnit": "lb"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_convert_invalid_to_unit_returns_400(self):
        response = self.client.post(
            reverse("unit-convert"),
            {"value": 1, "fromUnit": "kg", "toUnit": "invalid_unit"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_convert_incompatible_units_returns_400(self):
        response = self.client.post(
            reverse("unit-convert"),
            {"value": 1, "fromUnit": "kg", "toUnit": "m"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        data = response.json()
        self.assertIn("error", data)

    def test_convert_decimal_value(self):
        response = self.client.post(
            reverse("unit-convert"),
            {"value": 1.5, "fromUnit": "kg", "toUnit": "lb"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertAlmostEqual(data["value"], 3.30693, places=3)

    def test_convert_negative_value(self):
        response = self.client.post(
            reverse("unit-convert"),
            {"value": -40, "fromUnit": "degC", "toUnit": "degF"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        # -40°C = -40°F (the crossover point)
        self.assertAlmostEqual(data["value"], -40, places=1)

    def test_convert_zero_value(self):
        response = self.client.post(
            reverse("unit-convert"),
            {"value": 0, "fromUnit": "kg", "toUnit": "lb"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data["value"], 0)

    def test_get_method_not_allowed(self):
        response = self.client.get(reverse("unit-convert"))
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
