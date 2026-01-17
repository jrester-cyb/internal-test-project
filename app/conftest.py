"""
Pytest configuration for the Django application.
"""

import pytest
from django.core.cache import cache


@pytest.fixture(autouse=True)
def clear_cache():
    """Clear the cache before each test to avoid stale cached data."""
    cache.clear()
    yield
    cache.clear()
