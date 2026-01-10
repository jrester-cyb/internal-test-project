from django.core.management.base import BaseCommand
from django.db import connection


class Command(BaseCommand):
    help = "Calculate and update H3 indexes for all assets using database triggers"

    def add_arguments(self, parser):
        parser.add_argument(
            "--resolution",
            type=int,
            default=15,
            help="H3 resolution (0-15, default: 15)",
        )

        # Create mutually exclusive group for asset type filters
        asset_type_group = parser.add_mutually_exclusive_group()
        asset_type_group.add_argument(
            "--asset-type",
            type=str,
            help="Filter by asset type name (e.g., 'restaurant', 'hotel')",
        )
        asset_type_group.add_argument(
            "--asset-type-id",
            type=str,
            help="Filter by asset type ID (UUID)",
        )

    def handle(self, *args, **options):
        resolution = options["resolution"]
        asset_type_name = options.get("asset_type")
        asset_type_id = options.get("asset_type_id")

        # Build WHERE clause based on filters
        where_conditions = ["geometry IS NOT NULL"]
        params = []

        if asset_type_name:
            where_conditions.append(
                "asset_type_id IN (SELECT id FROM assets_assettype WHERE name ILIKE %s)"
            )
            params.append(f"%{asset_type_name}%")

        if asset_type_id:
            where_conditions.append("asset_type_id = %s")
            params.append(asset_type_id)

        where_clause = " AND ".join(where_conditions)

        filter_desc = ""
        if asset_type_name:
            filter_desc += f" (asset type: {asset_type_name})"
        if asset_type_id:
            filter_desc += f" (asset type ID: {asset_type_id})"

        self.stdout.write(
            f"Updating H3 indexes at resolution {resolution}{filter_desc}..."
        )

        with connection.cursor() as cursor:
            # First, update location from geometry for filtered assets
            cursor.execute(
                f"""
                UPDATE assets_asset
                SET location = ST_Centroid(geometry)
                WHERE {where_clause}
            """,
                params,
            )

            # Then, update h3_index for assets with valid locations
            h3_params = [resolution] + params
            cursor.execute(
                f"""
                UPDATE assets_asset
                SET h3_index = h3_latlng_to_cell(
                    point(ST_Y(location), ST_X(location)),
                    %s
                )
                WHERE location IS NOT NULL AND {where_clause}
            """,
                h3_params,
            )

            updated = cursor.rowcount

        self.stdout.write(
            self.style.SUCCESS(
                f"Successfully updated {updated} assets with H3 index at resolution {resolution}"
            )
        )
