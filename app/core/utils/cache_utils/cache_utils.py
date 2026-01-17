from typing import Any, Optional
from uuid import UUID
from django.core.cache import cache


def _ns_str(organization: UUID, workspace: Optional[UUID]) -> tuple[str, str]:
    org_s = str(organization)
    ws_s = str(workspace) if workspace else "org"
    return org_s, ws_s


def _version_key(org_s: str, ws_s: str) -> str:
    return f"org_version:{org_s}:{ws_s}"


def _get_version(org_s: str, ws_s: str) -> int:
    key = _version_key(org_s, ws_s)
    v = cache.get(key)
    if v is None:
        # ensure it exists
        try:
            cache.add(key, 1, None)
            return 1
        except Exception:
            cache.set(key, 1, None)
            return 1
    return int(v)


def _bump_version(org_s: str, ws_s: str) -> int:
    key = _version_key(org_s, ws_s)
    try:
        return cache.incr(key)
    except ValueError:
        # key might not exist for incr: create it and return 1
        cache.set(key, 1, None)
        return 1


def _compose_key(org_s: str, ws_s: str, key: str, version: int) -> str:
    return f"org:{org_s}:{ws_s}:{key}:v{version}"


def cache_data(
    organization: UUID,
    workspace: Optional[UUID],
    *,
    key: str,
    data: Any,
    timeout: Optional[int] = None,
):
    org_s, ws_s = _ns_str(organization, workspace)
    version = _get_version(org_s, ws_s)
    cache_key = _compose_key(org_s, ws_s, key, version)
    cache.set(cache_key, data, timeout=timeout)


def get_cached_data(
    organization: UUID,
    workspace: Optional[UUID],
    *,
    key: str,
) -> Any:
    org_s, ws_s = _ns_str(organization, workspace)
    version = _get_version(org_s, ws_s)
    cache_key = _compose_key(org_s, ws_s, key, version)
    return cache.get(cache_key)


def invalidate_cache(
    organization: UUID,
    workspace: Optional[UUID],
    *,
    key: Optional[str],
):
    """
    Namespace invalidation via bumping the version when `key` is None.
    When `key` is provided we delete the currently-versioned key only.
    """
    org_s, ws_s = _ns_str(organization, workspace)
    print(f"Deleting cache key: {org_s}, {ws_s}, {key}")

    if key is None:
        # Bump the namespace version to logically invalidate all keys
        _bump_version(org_s, ws_s)
        return

    # Delete the specific key at the current version
    version = _get_version(org_s, ws_s)
    cache_key = _compose_key(org_s, ws_s, key, version)
    cache.delete(cache_key)
