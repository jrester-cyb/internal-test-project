"""
Celery tasks for assets app.

Includes tasks for pre-calculating cluster data at adjacent zoom levels
to improve map panning/zooming performance.
"""

import logging
import json
import hashlib
from typing import Optional

from django.conf import settings

logger = logging.getLogger(__name__)

# Try to import Celery
try:
    from celery import shared_task as celery_shared_task

    CELERY_AVAILABLE = True
except ImportError:
    CELERY_AVAILABLE = False
    celery_shared_task = None


# Zoom to H3 prefix length mapping (same as in asset_view.py)
ZOOM_TO_H3_LEN = {
    range(0, 3): 2,  # World/continent
    range(3, 5): 4,  # Country
    range(5, 7): 5,  # State/region
    range(7, 10): 6,  # City
    range(10, 12): 10,  # District
    range(12, 14): 11,  # Neighborhood
    range(14, 16): 13,  # Street
    range(16, 18): 14,  # Building
    range(18, 21): 15,  # Sub-building
}


def get_precision_for_zoom(zoom: int) -> int:
    """Get H3 prefix length for a given zoom level."""
    for zoom_range, h3len in ZOOM_TO_H3_LEN.items():
        if zoom in zoom_range:
            return h3len
    return 7  # Default


def _calculate_clusters_for_zoom(
    organization_pk: Optional[str],
    workspace_pk: Optional[str],
    filter_data: dict,
    zoom: int,
) -> list:
    """
    Calculate cluster data for a specific zoom level.

    This is the core cluster calculation logic extracted for reuse.
    Returns the cluster data list.
    """
    from uuid import UUID
    from django.db import connection

    from core.utils.cache_utils.cache_utils import cache_data, get_cached_data
    from assets.models import Asset
    from assets.filter_serializers import FilterSerializer

    precision = get_precision_for_zoom(zoom)

    # Get org/workspace UUIDs for caching
    org_id = UUID(organization_pk) if organization_pk else None
    ws_id = UUID(workspace_pk) if workspace_pk else None

    # If we have workspace but not org, look up the org from workspace
    if ws_id and not org_id:
        from workspaces.models import Workspace

        try:
            org_id = Workspace.objects.values_list(
                "organization_id", flat=True
            ).get(pk=ws_id)
        except Workspace.DoesNotExist:
            pass

    # Build cache key
    cache_components = {
        "filters": filter_data,
        "zoom": zoom,
        "precision": precision,
    }
    cache_hash = hashlib.md5(
        json.dumps(cache_components, sort_keys=True).encode()
    ).hexdigest()
    cache_key = f"cluster_results:{cache_hash}"

    # Check if already cached
    if org_id:
        cached_results = get_cached_data(org_id, ws_id, key=cache_key)
        if cached_results is not None:
            logger.debug(f"Clusters for zoom {zoom} already cached")
            return cached_results

    # Build WHERE conditions and params for raw SQL
    where_clauses = [
        "a.h3_index IS NOT NULL",
        "a.h3_index != ''",
        "a.geometry IS NOT NULL",
        "a.deleted_at IS NULL",
    ]
    params = [precision]

    # Filter by organization if provided
    if organization_pk:
        where_clauses.append("a.organization_id = %s")
        params.append(organization_pk)

    # Filter by workspace if provided
    if workspace_pk:
        where_clauses.append(
            "a.id IN (SELECT asset_id FROM assets_workspaceasset WHERE workspace_id = %s)"
        )
        params.append(workspace_pk)

    # Apply zoom-based asset type filter
    where_clauses.append(
        "a.asset_type_id IN (SELECT id FROM assets_assettype WHERE min_render_zoom <= %s AND max_render_zoom >= %s)"
    )
    params.extend([zoom, zoom])

    # Apply search filters if provided
    if filter_data:
        q_filter = FilterSerializer(data=filter_data).build_query()
        if q_filter:
            # Build queryset to get filtered IDs
            base_qs = Asset.objects.filter(
                h3_index__isnull=False,
                geometry__isnull=False,
            ).exclude(h3_index="")

            if organization_pk:
                base_qs = base_qs.filter(organization_id=organization_pk)
            if workspace_pk:
                base_qs = base_qs.filter(
                    workspace_memberships__workspace_id=workspace_pk
                )
            base_qs = base_qs.filter(
                asset_type__min_render_zoom__lte=zoom,
                asset_type__max_render_zoom__gte=zoom,
            )
            base_qs = base_qs.filter(q_filter)

            # Fetch IDs
            from django.db.models.functions import Cast
            from django.db.models import CharField

            filtered_ids = list(
                base_qs.annotate(id_str=Cast("id", CharField()))
                .values_list("id_str", flat=True)
            )

            if not filtered_ids:
                # Cache empty result
                if org_id:
                    cache_data(org_id, ws_id, key=cache_key, data=[], timeout=3600)
                return []

            where_clauses.append("a.id = ANY(%s::uuid[])")
            params.append(filtered_ids)

    where_sql = " AND ".join(where_clauses)

    # Execute the cluster query
    with connection.cursor() as cursor:
        # First pass: quick aggregation to get cluster sizes and centroids
        cursor.execute(
            f"""
            SELECT
                LEFT(a.h3_index, %s) as h3_prefix,
                COUNT(*) as cluster_count,
                AVG(ST_Y(a.location)) as lat,
                AVG(ST_X(a.location)) as lon
            FROM assets_asset a
            WHERE {where_sql}
            GROUP BY h3_prefix
            ORDER BY cluster_count DESC
            """,
            params,
        )
        cluster_rows = cursor.fetchall()

        # Identify single-asset clusters (need full details)
        single_prefixes = [row[0] for row in cluster_rows if row[1] == 1]

        # Second pass: only fetch geometry for single-asset clusters
        single_asset_details = {}
        if single_prefixes:
            prefix_placeholders = ",".join(["%s"] * len(single_prefixes))
            detail_params = (
                [precision] + params[1:] + [precision] + single_prefixes
            )
            cursor.execute(
                f"""
                SELECT
                    LEFT(a.h3_index, %s) as h3_prefix,
                    a.id::text,
                    a.name,
                    a.asset_type_id::text,
                    a.h3_index,
                    ST_AsGeoJSON(a.geometry)
                FROM assets_asset a
                WHERE {where_sql}
                  AND LEFT(a.h3_index, %s) IN ({prefix_placeholders})
                """,
                detail_params,
            )
            for row in cursor.fetchall():
                single_asset_details[row[0]] = row[1:]

    # Build cluster data
    cluster_data = []
    for prefix, count, lat, lon in cluster_rows:
        if count == 1 and prefix in single_asset_details:
            asset_id, name, type_id, h3, geojson = single_asset_details[prefix]
            cluster_data.append(
                {
                    "type": "Feature",
                    "id": asset_id,
                    "geometry": json.loads(geojson),
                    "properties": {
                        "name": name,
                        "assetTypeId": type_id,
                        "h3_index": h3,
                    },
                }
            )
        elif lat is not None and lon is not None:
            cluster_data.append(
                {
                    "h3_index": prefix,
                    "count": count,
                    "center": {"lat": float(lat), "lon": float(lon)},
                }
            )

    # Cache the results (60 minute TTL)
    if org_id:
        cache_data(org_id, ws_id, key=cache_key, data=cluster_data, timeout=3600)

    return cluster_data


def _precalculate_adjacent_zooms_impl(
    organization_pk: Optional[str],
    workspace_pk: Optional[str],
    filter_data: dict,
    current_zoom: int,
    zoom_range: int = 3,
):
    """
    Pre-calculate cluster data for zoom levels above and below the current level.

    Args:
        organization_pk: Organization ID (optional)
        workspace_pk: Workspace ID (optional)
        filter_data: Filter configuration dict
        current_zoom: The zoom level the user is currently at
        zoom_range: How many zoom levels above and below to calculate (default 3)
    """
    min_zoom = max(0, current_zoom - zoom_range)
    max_zoom = min(20, current_zoom + zoom_range)

    calculated_count = 0
    for zoom in range(min_zoom, max_zoom + 1):
        if zoom == current_zoom:
            # Skip current zoom - it was already calculated by the main request
            continue

        try:
            logger.info(f"Pre-calculating clusters for zoom {zoom} (org={organization_pk}, ws={workspace_pk})")
            _calculate_clusters_for_zoom(
                organization_pk=organization_pk,
                workspace_pk=workspace_pk,
                filter_data=filter_data,
                zoom=zoom,
            )
            calculated_count += 1
        except Exception as e:
            logger.error(f"Failed to pre-calculate clusters for zoom {zoom}: {e}")

    logger.info(f"Pre-calculated clusters for {calculated_count} zoom levels")
    return calculated_count


class PrecalculateAdjacentZooms:
    """
    Callable class that handles both sync and async processing.

    Usage:
        precalculate_adjacent_zooms(org, ws, filters, zoom)  # Sync call
        precalculate_adjacent_zooms.delay(org, ws, filters, zoom)  # Async call
    """

    def __call__(
        self,
        organization_pk: Optional[str],
        workspace_pk: Optional[str],
        filter_data: dict,
        current_zoom: int,
        zoom_range: int = 3,
    ) -> int:
        """Process synchronously."""
        try:
            return _precalculate_adjacent_zooms_impl(
                organization_pk, workspace_pk, filter_data, current_zoom, zoom_range
            )
        except Exception as e:
            logger.error(f"Failed to pre-calculate adjacent zooms: {e}")
            raise

    def delay(
        self,
        organization_pk: Optional[str],
        workspace_pk: Optional[str],
        filter_data: dict,
        current_zoom: int,
        zoom_range: int = 3,
    ):
        """
        Process asynchronously if Celery available, otherwise skip.

        We don't fall back to sync because this is an optimization -
        if Celery isn't available, we just skip the pre-calculation.
        """
        if CELERY_AVAILABLE:
            return _precalculate_adjacent_zooms_celery.delay(
                organization_pk, workspace_pk, filter_data, current_zoom, zoom_range
            )
        else:
            logger.debug("Celery not available, skipping pre-calculation")
            return None


# Create the callable instance
precalculate_adjacent_zooms = PrecalculateAdjacentZooms()


def _calculate_tile_features_for_zoom(
    organization_pk: Optional[str],
    workspace_pk: Optional[str],
    filter_data: dict,
    zoom: int,
) -> list:
    """
    Calculate and cache tile features for a specific zoom level.

    Returns the list of GeoJSON features.
    """
    from uuid import UUID

    from core.utils.cache_utils.cache_utils import cache_data, get_cached_data
    from assets.models import Asset
    from assets.filter_serializers import FilterSerializer

    # Get org/workspace UUIDs for caching
    org_id = UUID(organization_pk) if organization_pk else None
    ws_id = UUID(workspace_pk) if workspace_pk else None

    # If we have workspace but not org, look up the org from workspace
    if ws_id and not org_id:
        from workspaces.models import Workspace

        try:
            org_id = Workspace.objects.values_list(
                "organization_id", flat=True
            ).get(pk=ws_id)
        except Workspace.DoesNotExist:
            pass

    # Build cache key
    cache_components = {
        "filters": filter_data,
        "zoom": zoom,
    }
    filter_hash = hashlib.md5(
        json.dumps(cache_components, sort_keys=True).encode()
    ).hexdigest()
    cache_key = f"tiles_features:{filter_hash}"

    # Check if already cached
    if org_id:
        cached_features = get_cached_data(org_id, ws_id, key=cache_key)
        if cached_features is not None:
            logger.debug(f"Tile features for zoom {zoom} already cached")
            return cached_features

    # Build queryset
    queryset = Asset.objects.filter(geometry__isnull=False)

    if organization_pk:
        queryset = queryset.filter(organization_id=organization_pk)
    if workspace_pk:
        queryset = queryset.filter(workspace_memberships__workspace_id=workspace_pk)

    # Apply zoom-based asset type render filtering
    queryset = queryset.filter(
        asset_type__min_render_zoom__lte=zoom,
        asset_type__max_render_zoom__gte=zoom,
    )

    # Apply search filters
    if filter_data:
        q_filter = FilterSerializer(data=filter_data).build_query()
        if q_filter:
            queryset = queryset.filter(q_filter)

    if workspace_pk:
        queryset = queryset.distinct()

    # Check for geometry type filter to skip size filtering
    has_geometry_type_filter = False
    if filter_data:
        filters = filter_data.get("filters", [])
        for f in filters:
            if f.get("field") == "geometry_type":
                has_geometry_type_filter = True
                break

    # Apply size-based filtering
    if not has_geometry_type_filter:
        min_pixel_size = 50
        degrees_per_pixel = 360.0 / (256.0 * (2**zoom))
        min_size_degrees = min_pixel_size * degrees_per_pixel
        min_line_size_degrees = min_size_degrees * 0.6

        queryset = queryset.extra(
            where=[
                """
                (
                    ST_GeometryType(geometry) = 'ST_Point'
                    OR (
                        ST_GeometryType(geometry) = 'ST_Polygon'
                        AND SQRT(
                            POW(ST_XMax(geometry) - ST_XMin(geometry), 2) +
                            POW(ST_YMax(geometry) - ST_YMin(geometry), 2)
                        ) >= %s
                    )
                    OR (
                        ST_GeometryType(geometry) = 'ST_LineString'
                        AND SQRT(
                            POW(ST_XMax(geometry) - ST_XMin(geometry), 2) +
                            POW(ST_YMax(geometry) - ST_YMin(geometry), 2)
                        ) >= %s
                    )
                )
                """
            ],
            params=[min_size_degrees, min_line_size_degrees],
        )

    queryset = queryset.order_by("id")

    # Build features using ST_AsGeoJSON for fast geometry serialization
    from django.db.models import Func, CharField

    class AsGeoJSON(Func):
        function = "ST_AsGeoJSON"
        output_field = CharField()

    all_features = []
    annotated_qs = queryset.annotate(geojson=AsGeoJSON("geometry"))
    for asset in annotated_qs.only("id", "name", "asset_type_id", "h3_index", "geometry").iterator():
        if asset.geojson:
            all_features.append(
                {
                    "type": "Feature",
                    "id": str(asset.id),
                    "geometry": json.loads(asset.geojson),
                    "properties": {
                        "name": asset.name,
                        "assetTypeId": str(asset.asset_type_id),
                        "h3_index": asset.h3_index,
                    },
                }
            )

    # Cache the result (60 minute TTL)
    if org_id:
        cache_data(org_id, ws_id, key=cache_key, data=all_features, timeout=3600)

    return all_features


def _precalculate_tile_features_impl(
    organization_pk: Optional[str],
    workspace_pk: Optional[str],
    filter_data: dict,
    current_zoom: int,
    zoom_range: int = 3,
):
    """
    Pre-calculate tile features for the current zoom level and adjacent levels.

    This is triggered on cache miss - the main request only queries the bbox,
    so we need to cache the full feature set for fast panning/zooming.

    Args:
        organization_pk: Organization ID (optional)
        workspace_pk: Workspace ID (optional)
        filter_data: Filter configuration dict
        current_zoom: The zoom level the user is currently at
        zoom_range: How many zoom levels above and below to calculate (default 3)
    """
    min_zoom = max(0, current_zoom - zoom_range)
    max_zoom = min(20, current_zoom + zoom_range)

    calculated_count = 0
    # Include current_zoom since on cache miss we only query bbox, not full set
    for zoom in range(min_zoom, max_zoom + 1):
        try:
            logger.info(f"Pre-calculating tile features for zoom {zoom} (org={organization_pk}, ws={workspace_pk})")
            _calculate_tile_features_for_zoom(
                organization_pk=organization_pk,
                workspace_pk=workspace_pk,
                filter_data=filter_data,
                zoom=zoom,
            )
            calculated_count += 1
        except Exception as e:
            logger.error(f"Failed to pre-calculate tile features for zoom {zoom}: {e}")

    logger.info(f"Pre-calculated tile features for {calculated_count} zoom levels")
    return calculated_count


class PrecalculateTileFeatures:
    """
    Callable class that handles both sync and async processing for tile features.

    Usage:
        precalculate_tile_features(org, ws, filters, zoom)  # Sync call
        precalculate_tile_features.delay(org, ws, filters, zoom)  # Async call
    """

    def __call__(
        self,
        organization_pk: Optional[str],
        workspace_pk: Optional[str],
        filter_data: dict,
        current_zoom: int,
        zoom_range: int = 3,
    ) -> int:
        """Process synchronously."""
        try:
            return _precalculate_tile_features_impl(
                organization_pk, workspace_pk, filter_data, current_zoom, zoom_range
            )
        except Exception as e:
            logger.error(f"Failed to pre-calculate tile features: {e}")
            raise

    def delay(
        self,
        organization_pk: Optional[str],
        workspace_pk: Optional[str],
        filter_data: dict,
        current_zoom: int,
        zoom_range: int = 3,
    ):
        """
        Process asynchronously if Celery available, otherwise skip.
        """
        if CELERY_AVAILABLE:
            return _precalculate_tile_features_celery.delay(
                organization_pk, workspace_pk, filter_data, current_zoom, zoom_range
            )
        else:
            logger.debug("Celery not available, skipping tile features pre-calculation")
            return None


# Create the callable instance
precalculate_tile_features = PrecalculateTileFeatures()


# Only define Celery task if available
if CELERY_AVAILABLE:

    @celery_shared_task(
        bind=True,
        max_retries=1,
        default_retry_delay=30,
        autoretry_for=(Exception,),
        retry_backoff=True,
        ignore_result=True,  # We don't need to store the result
    )
    def _precalculate_adjacent_zooms_celery(
        self,
        organization_pk: Optional[str],
        workspace_pk: Optional[str],
        filter_data: dict,
        current_zoom: int,
        zoom_range: int = 3,
    ):
        """Celery task wrapper for cluster pre-calculation."""
        return _precalculate_adjacent_zooms_impl(
            organization_pk, workspace_pk, filter_data, current_zoom, zoom_range
        )

    @celery_shared_task(
        bind=True,
        max_retries=1,
        default_retry_delay=30,
        autoretry_for=(Exception,),
        retry_backoff=True,
        ignore_result=True,  # We don't need to store the result
    )
    def _precalculate_tile_features_celery(
        self,
        organization_pk: Optional[str],
        workspace_pk: Optional[str],
        filter_data: dict,
        current_zoom: int,
        zoom_range: int = 3,
    ):
        """Celery task wrapper for tile features pre-calculation."""
        return _precalculate_tile_features_impl(
            organization_pk, workspace_pk, filter_data, current_zoom, zoom_range
        )
