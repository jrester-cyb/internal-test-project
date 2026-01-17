import pytest
from uuid import UUID

from core.utils.cache_utils import cache_utils


def make_ids():
    return UUID(int=1), UUID(int=2)


@pytest.fixture
def mocked_cache(mocker):
    mock_cache = mocker.MagicMock()
    mock_cache.get.return_value = None
    mocker.patch("core.utils.cache_utils.cache_utils.cache", mock_cache)
    return mock_cache


def test_cache_data_and_get_cached_data_calls_cache_with_composed_key(mocked_cache):
    org, ws = make_ids()
    key = "mykey"
    data = {"a": 1}
    mock_cache = mocked_cache

    # Compose expected keys up-front. Version will be 1 when created.
    expected_version_key = f"org_version:{org}:{ws}"
    expected = f"org:{org}:{ws}:{key}:v1"

    # Make cache.get behave: return None for version lookups, return data for the composed cache key
    def _get_side_effect(k):
        if k == expected_version_key:
            return None
        if k == expected:
            return data
        return None

    mock_cache.get.side_effect = _get_side_effect

    cache_utils.cache_data(org, ws, key=key, data=data, timeout=60)
    # Ensure set called with composed key
    mock_cache.set.assert_called_once_with(expected, data, timeout=60)
    result = cache_utils.get_cached_data(org, ws, key=key)
    # Ensure get was called for the composed key at least once
    mock_cache.get.assert_any_call(expected)
    assert result == data


def test_invalidate_cache_pattern_deletes_all_matching_keys(mocked_cache):
    org, ws = make_ids()

    cache_utils.invalidate_cache(org, ws, key=None)

    # Current implementation bumps the namespace version via `cache.incr`
    version_key = f"org_version:{org}:{ws}"
    mocked_cache.incr.assert_called_once_with(version_key)


def test_invalidate_cache_single_key_deletes_composed_key(mocked_cache):
    org, ws = make_ids()
    key = "specific"
    # Ensure version lookup returns None so _get_version will initialize to 1
    mocked_cache.get.return_value = None
    cache_utils.invalidate_cache(org, ws, key=key)
    expected = f"org:{org}:{ws}:{key}:v1"
    mocked_cache.delete.assert_called_once_with(expected)


def test_invalidate_cache_is_namespace_isolated(mocked_cache):
    """Invalidating one org/workspace should not bump another namespace."""
    org1, ws1 = UUID(int=1), UUID(int=2)
    org2, ws2 = UUID(int=3), UUID(int=4)

    # perform invalidate on first namespace
    cache_utils.invalidate_cache(org1, ws1, key=None)

    v1 = f"org_version:{org1}:{ws1}"
    v2 = f"org_version:{org2}:{ws2}"

    # ensure only the first namespace was bumped
    mocked_cache.incr.assert_called_once_with(v1)
    for call in mocked_cache.incr.call_args_list:
        assert call.args[0] != v2
