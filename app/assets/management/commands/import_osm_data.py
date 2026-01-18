from django.core.management.base import BaseCommand, CommandError
from django.core.exceptions import ValidationError
from assets.models import (
    Asset,
    AssetType,
    GlobalAssetTypeAttribute,
    WorkspaceAssetType,
    WorkspaceAsset,
)
from workspaces.models import Workspace
from django.contrib.gis.geos import Point, LineString, Polygon
from audit_log import log_bulk_create, log_create, audit_group
import requests


class OSMImporter:
    OVERPASS_URL = "https://overpass-api.de/api/interpreter"

    def __init__(self, workspace=None):
        self.session = requests.Session()
        self.session.headers.update(
            {"User-Agent": "AssetVisualizer/1.0 (jaryd.rester@cybirical.com)"}
        )
        self.workspace = workspace
        self.organization = workspace.organization if workspace else None

    def query_overpass(
        self, query: str, max_retries: int = 5, retry_delay: int = 10
    ) -> dict:
        import time

        attempt = 0
        while attempt < max_retries:
            try:
                response = self.session.post(
                    self.OVERPASS_URL, data={"data": query}, timeout=60
                )
                # Handle rate limiting (429)
                if response.status_code == 429:
                    attempt += 1
                    # Exponential backoff: 10, 20, 40, 80, 160 seconds
                    wait_time = retry_delay * (2 ** (attempt - 1))
                    print(
                        f"429 Rate Limited by Overpass API (attempt {attempt}/{max_retries}), waiting {wait_time}s..."
                    )
                    time.sleep(wait_time)
                    continue
                # Handle gateway timeout (504)
                if response.status_code == 504:
                    attempt += 1
                    print(
                        f"504 Gateway Timeout from Overpass API (attempt {attempt}/{max_retries}), retrying in {retry_delay}s..."
                    )
                    time.sleep(retry_delay)
                    continue
                response.raise_for_status()
                return response.json()
            except requests.exceptions.RequestException as e:
                status_code = getattr(getattr(e, "response", None), "status_code", None)
                if status_code in (429, 504):
                    attempt += 1
                    if status_code == 429:
                        wait_time = retry_delay * (2 ** (attempt - 1))
                        print(
                            f"429 Rate Limited by Overpass API (attempt {attempt}/{max_retries}), waiting {wait_time}s..."
                        )
                        time.sleep(wait_time)
                    else:
                        print(
                            f"504 Gateway Timeout from Overpass API (attempt {attempt}/{max_retries}), retrying in {retry_delay}s..."
                        )
                        time.sleep(retry_delay)
                    continue
                print(f"Error querying Overpass API: {e}")
                raise
        print(
            f"Failed after {max_retries} attempts due to repeated errors from Overpass API."
        )
        raise Exception("Overpass API failed after retries")

    def build_geometry(self, element: dict) -> object:
        element_type = element.get("type")
        if element_type == "node":
            lat = element.get("lat")
            lon = element.get("lon")
            if lat and lon:
                return Point(lon, lat, srid=4326)
        elif element_type == "way":
            geometry = element.get("geometry", [])
            if len(geometry) >= 2:
                coords = [(pt["lon"], pt["lat"]) for pt in geometry]
                if coords[0] == coords[-1] and len(coords) >= 4:
                    return Polygon(coords, srid=4326)
                else:
                    return LineString(coords, srid=4326)
        return None

    def get_or_create_asset_type(self, osm_type: str) -> AssetType:
        asset_type, created = AssetType.objects.get_or_create(
            name=f"OSM {osm_type.title()}",
            organization=self.organization,
            defaults={"description": f"OpenStreetMap {osm_type} features"},
        )
        if created:
            log_create(
                asset_type,
                message=f"Created asset type 'OSM {osm_type.title()}' for OSM import",
                references=[(self.organization, "organization")],
                metadata={"command": "import_osm_data", "osm_type": osm_type},
                source="management_command",
            )
            self.create_osm_attributes(asset_type)

        # Ensure asset type is linked to workspace
        if self.workspace:
            work_asset_type, wat_created = WorkspaceAssetType.objects.get_or_create(
                workspace=self.workspace,
                asset_type=asset_type,
                defaults={"is_owner": True},
            )
            if wat_created:
                log_create(
                    work_asset_type,
                    message=f"Linked asset type 'OSM {osm_type.title()}' to workspace '{self.workspace.name}'",
                    references=[
                        (asset_type, "asset_type"),
                        (self.workspace, "workspace"),
                        (self.organization, "organization"),
                    ],
                    metadata={"command": "import_osm_data"},
                    source="management_command",
                )

        return asset_type

    def create_osm_attributes(self, asset_type: AssetType):
        attributes = [
            ("osm_id", "osm_id", "text", "OpenStreetMap ID"),
            ("osm_type", "osm_type", "text", "OSM element type (node/way/relation)"),
            ("tags", "tags", "json", "All OSM tags"),
        ]
        for order, (name, api_key, attr_type, description) in enumerate(attributes):
            instance, created = GlobalAssetTypeAttribute.objects.get_or_create(
                asset_type=asset_type,
                name=name,
                defaults={
                    "api_key": api_key,
                    "attribute_type": attr_type,
                    "description": description,
                    "order": order,
                },
            )
            if created:
                log_create(
                    instance,
                    message=f"Created OSM attribute '{name}' for asset type '{asset_type.name}'",
                    references=[
                        (asset_type, "asset_type"),
                        (self.organization, "organization"),
                    ],
                    metadata={"command": "import_osm_data"},
                    source="management_command",
                )

    def import_osm_features(
        self,
        bbox: tuple,
        feature_type: str,
        feature_value: str = None,
        limit: int = 100,
        max_retries: int = 3,
        retry_delay: int = 10,
        batch_size: int = 1000,
    ) -> tuple:
        """Import OSM features and return (created_count, created_assets)."""
        south, west, north, east = bbox
        if feature_value:
            query = f"""
            [out:json][timeout:25];
            (
              node[\"{feature_type}\"=\"{feature_value}\"]({south},{west},{north},{east});
              way[\"{feature_type}\"=\"{feature_value}\"]({south},{west},{north},{east});
              relation[\"{feature_type}\"=\"{feature_value}\"]({south},{west},{north},{east});
            );
            out geom {limit};
            """
        else:
            query = f"""
            [out:json][timeout:25];
            (
              node[\"{feature_type}\"]({south},{west},{north},{east});
              way[\"{feature_type}\"]({south},{west},{north},{east});
              relation[\"{feature_type}\"]({south},{west},{north},{east});
            );
            out geom {limit};
            """
        print(
            f"Querying OSM for {feature_type}"
            + (f"={feature_value}" if feature_value else "")
        )
        print(f"Bounding box: {bbox}")
        data = self.query_overpass(
            query, max_retries=max_retries, retry_delay=retry_delay
        )
        elements = data.get("elements", [])
        print(f"Found {len(elements)} elements")
        asset_type = self.get_or_create_asset_type(feature_type)

        # Build list of assets to create, tracking element data for later attribute storage
        existing_names = set(
            Asset.objects.filter(asset_type=asset_type).values_list("name", flat=True)
        )

        assets_to_create = []
        element_data_map = {}  # name -> (osm_id, osm_type, tags)

        for element in elements:
            osm_id = element.get("id")
            osm_type = element.get("type")
            tags = element.get("tags", {})
            geometry = self.build_geometry(element)
            if not geometry:
                continue
            name = tags.get("name", tags.get("ref", f"{feature_type} {osm_id}"))
            name = self.sanitize_text(name)
            description = self.sanitize_text(tags.get("description", ""))

            if name not in existing_names:
                asset = Asset(
                    asset_type=asset_type,
                    name=name,
                    organization=self.organization,
                    description=description,
                    geometry=geometry,
                )
                assets_to_create.append(asset)
                element_data_map[name] = (osm_id, osm_type, tags)
                existing_names.add(name)  # Prevent duplicates within this batch

        # Bulk create assets
        created_assets = []
        for i in range(0, len(assets_to_create), batch_size):
            batch = assets_to_create[i : i + batch_size]
            created_batch = Asset.objects.bulk_create(batch, ignore_conflicts=True)
            created_assets.extend(created_batch)
            print(f"Created batch {i // batch_size + 1}: {len(created_batch)} assets")

        created_count = len(created_assets)

        # Bulk create workspace asset links
        if self.workspace and created_assets:
            workspace_assets_to_create = [
                WorkspaceAsset(workspace=self.workspace, asset=asset)
                for asset in created_assets
            ]
            WorkspaceAsset.objects.bulk_create(
                workspace_assets_to_create, ignore_conflicts=True
            )

        # Store attributes for created assets
        for asset in created_assets:
            if asset.name in element_data_map:
                osm_id, osm_type, tags = element_data_map[asset.name]
                self.store_osm_attributes(asset, osm_id, osm_type, tags)

        print(f"Created {created_count} new assets")
        return created_count, created_assets

    def sanitize_text(self, text: str) -> str:
        if not text:
            return text
        return text.encode("ascii", errors="ignore").decode("ascii")

    def sanitize_tags(self, tags: dict) -> dict:
        sanitized = {}
        for key, value in tags.items():
            if isinstance(value, str):
                sanitized[key] = self.sanitize_text(value)
            else:
                sanitized[key] = value
        return sanitized

    def store_osm_attributes(
        self, asset: Asset, osm_id: int, osm_type: str, tags: dict
    ):
        from assets.models import (
            TextAttributeValue,
            NumberAttributeValue,
            BooleanAttributeValue,
            DateAttributeValue,
            DateTimeAttributeValue,
            JSONAttributeValue,
            GlobalAssetTypeAttribute,
        )

        # Get global attributes for this asset type
        attribute_defs = {
            ad.api_key: ad
            for ad in GlobalAssetTypeAttribute.objects.filter(
                asset_type=asset.asset_type, deleted_at__isnull=True
            )
        }
        # Ensure osm_id and osm_type are set
        if "osm_id" in attribute_defs:
            TextAttributeValue.objects.update_or_create(
                asset=asset,
                asset_type_attribute=attribute_defs["osm_id"],
                defaults={"value": str(osm_id)},
            )
        if "osm_type" in attribute_defs:
            TextAttributeValue.objects.update_or_create(
                asset=asset,
                asset_type_attribute=attribute_defs["osm_type"],
                defaults={"value": str(osm_type)},
            )

        # Convert each tag into its own attribute
        from django.db import transaction

        sanitized_tags = self.sanitize_tags(tags)
        # Get the current max order for this asset type
        existing_orders = set(
            GlobalAssetTypeAttribute.objects.filter(
                asset_type=asset.asset_type, deleted_at__isnull=True
            ).values_list("order", flat=True)
        )
        next_order = max(existing_orders) + 1 if existing_orders else 0

        for tag_key, tag_value in sanitized_tags.items():
            # Skip if tag_key is already handled (osm_id, osm_type)
            if tag_key in ("osm_id", "osm_type"):
                continue
            # Try to get or create the attribute definition for this tag
            attr_def, created = GlobalAssetTypeAttribute.objects.get_or_create(
                asset_type=asset.asset_type,
                api_key=tag_key,
                defaults={
                    "name": tag_key,
                    "attribute_type": "text",  # Store all tags as text for now
                    "description": f"OSM tag: {tag_key}",
                    "order": next_order,
                },
            )
            if created:
                next_order += 1
                # Update local cache
                attribute_defs[tag_key] = attr_def
            TextAttributeValue.objects.update_or_create(
                asset=asset,
                asset_type_attribute=attr_def,
                defaults={"value": str(tag_value)},
            )

        # Optionally, still store all tags as a JSON blob for reference
        if "tags" in attribute_defs:
            JSONAttributeValue.objects.update_or_create(
                asset=asset,
                asset_type_attribute=attribute_defs["tags"],
                defaults={"value": sanitized_tags},
            )


class Command(BaseCommand):
    help = "Import OSM data for a given location using Nominatim and Overpass API."

    def add_arguments(self, parser):
        parser.add_argument(
            "location", type=str, help="Location name (city, address, etc)"
        )
        parser.add_argument(
            "--limit", type=int, default=10_000, help="Max features per type"
        )
        parser.add_argument(
            "--workspace-id", type=str, required=True, help="Workspace ID (UUID)"
        )
        parser.add_argument(
            "--retry-delay",
            type=int,
            default=10,
            help="Delay between retries on timeout",
        )
        parser.add_argument(
            "--max-retries", type=int, default=3, help="Max retries on timeout"
        )

    def geocode_location(self, location_name: str) -> tuple:
        url = "https://nominatim.openstreetmap.org/search"
        params = {
            "q": location_name,
            "format": "json",
            "limit": 1,
        }
        headers = {"User-Agent": "AssetVisualizer/1.0 (jaryd.rester@cybirical.com)"}
        resp = requests.get(url, params=params, headers=headers, timeout=30)
        resp.raise_for_status()
        results = resp.json()
        if not results:
            raise CommandError(f"No results found for location: {location_name}")
        bbox = results[0]["boundingbox"]
        south, north, west, east = map(float, bbox)
        return (south, west, north, east)

    def handle(self, *args, **options):
        location = options["location"]
        limit = options["limit"]
        workspace_id = options["workspace_id"]
        max_retries = options["max_retries"]
        retry_delay = options["retry_delay"]

        # Look up workspace
        try:
            workspace = Workspace.objects.get(id=workspace_id)
        except (Workspace.DoesNotExist, ValidationError):
            try:
                workspace = Workspace.objects.get(name=workspace_id)
            except Workspace.DoesNotExist:
                raise CommandError(f'Workspace "{workspace_id}" not found')

        self.stdout.write(self.style.SUCCESS(f"Importing OSM data for {location}"))
        self.stdout.write(
            f"Workspace: {workspace.name} (Organization: {workspace.organization.name})"
        )
        bbox = self.geocode_location(location)
        self.stdout.write(self.style.SUCCESS(f"Using bounding box: {bbox}"))

        # Wrap import in audit group for traceability
        with audit_group(
            f"OSM Import: {location}",
            source_type="management_command",
            source_name="import_osm_data",
            metadata={
                "location": location,
                "workspace_id": str(workspace.id),
                "workspace_name": workspace.name,
                "organization_id": str(workspace.organization.id),
                "bbox": list(bbox),
            },
        ):
            importer = OSMImporter(workspace=workspace)

            import_features = [
                ("power", "line", limit, "Powerline"),
                ("power", "generator", limit, "Generator"),
                ("power", "plant", limit, "Plant"),
                ("power", "substation", limit, "Substation"),
                ("power", "structure", limit, "Structure"),
                ("power", "transformer", limit, "Transformer"),
                ("man_made", "pipeline", limit, "Pipeline"),
                ("man_made", "tower", limit, "Tower"),
                ("man_made", "water_works", limit, "Water Works"),
                ("man_made", "storage_tank", limit, "Storage Tank"),
            ]

            total_created = 0
            all_created_assets = []
            for feature_type, feature_value, feature_limit, label in import_features:
                self.stdout.write(f"\n--- Importing {label} ---")
                created, created_assets = importer.import_osm_features(
                    bbox=bbox,
                    feature_type=feature_type,
                    feature_value=feature_value,
                    limit=feature_limit,
                    max_retries=max_retries,
                    retry_delay=retry_delay,
                )
                total_created += created
                all_created_assets.extend(created_assets)

            # Log bulk create for all assets
            if all_created_assets:
                log_bulk_create(
                    all_created_assets,
                    message=f"Imported {total_created} assets from OSM for location '{location}'",
                    metadata={
                        "command": "import_osm_data",
                        "location": location,
                        "bbox": list(bbox),
                        "total_created": total_created,
                    },
                    parent_references=[
                        (workspace, "workspace"),
                        (workspace.organization, "organization"),
                    ],
                    source="management_command",
                )

        self.stdout.write(self.style.SUCCESS("\n=== Import Complete ==="))
