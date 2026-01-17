"""
Pytest configuration for the Django application.
"""

import pytest


@pytest.fixture(scope="session")
def django_db_setup():
    """Ensure the test database is set up for the session."""
    pass


@pytest.fixture
def db(django_db_blocker):
    """Allow database access for tests."""
    django_db_blocker.unblock()
    yield
    django_db_blocker.restore()
