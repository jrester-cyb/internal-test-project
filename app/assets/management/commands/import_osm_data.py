from django.core.management.base import BaseCommand, CommandError
from assets.models import Asset, AssetType, AssetAttributeDefinition, JSONAttributeValue
from django.contrib.gis.geos import Point, LineString, Polygon, MultiPolygon
import requests


class OSMImporter:
    OVERPASS_URL = "https://overpass-api.de/api/interpreter"

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update(
            {"User-Agent": "AssetVisualizer/1.0 (jaryd.rester@cybirical.com)"}
        )

    def query_overpass(
        self, query: str, max_retries: int = 3, retry_delay: int = 10
    ) -> dict:
        attempt = 0
        while attempt < max_retries:
            try:
                response = self.session.post(
                    self.OVERPASS_URL, data={"data": query}, timeout=60
                )
                if response.status_code == 504:
                    attempt += 1
                    print(
                        f"504 Gateway Timeout from Overpass API (attempt {attempt}/{max_retries}), retrying in {retry_delay}s..."
                    )
                    import time

                    time.sleep(retry_delay)
                    continue
                response.raise_for_status()
                return response.json()
            except requests.exceptions.RequestException as e:
                print(f"Error querying Overpass API: {e}")
                if (
                    hasattr(e, "response")
                    and getattr(e.response, "status_code", None) == 504
                ):
                    attempt += 1
                    print(
                        f"504 Gateway Timeout from Overpass API (attempt {attempt}/{max_retries}), retrying in {retry_delay}s..."
                    )
                    import time

                    time.sleep(retry_delay)
                    continue
                raise
        print(
            f"Failed after {max_retries} attempts due to repeated 504 Gateway Timeout errors."
        )
        raise Exception("Overpass API 504 Gateway Timeout after retries")

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
            defaults={"description": f"OpenStreetMap {osm_type} features"},
        )
        if created:
            self.create_osm_attributes(asset_type)
        return asset_type

    def create_osm_attributes(self, asset_type: AssetType):
        attributes = [
            ("osm_id", "osm_id", "text", "OpenStreetMap ID"),
            ("osm_type", "osm_type", "text", "OSM element type (node/way/relation)"),
            ("tags", "tags", "json", "All OSM tags"),
        ]
        for order, (name, api_key, attr_type, description) in enumerate(attributes):
            AssetAttributeDefinition.objects.get_or_create(
                asset_type=asset_type,
                name=name,
                defaults={
                    "api_key": api_key,
                    "attribute_type": attr_type,
                    "description": description,
                    "order": order,
                },
            )

    def import_osm_features(
        self,
        bbox: tuple,
        feature_type: str,
        feature_value: str = None,
        limit: int = 100,
    ) -> int:
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
        data = self.query_overpass(query)
        elements = data.get("elements", [])
        print(f"Found {len(elements)} elements")
        asset_type = self.get_or_create_asset_type(feature_type)
        created_count = 0
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
            asset, created = Asset.objects.update_or_create(
                asset_type=asset_type,
                name=f"{name}",
                defaults={
                    "description": description,
                    "geometry": geometry,
                },
            )
            if created:
                created_count += 1
            self.store_osm_attributes(asset, osm_id, osm_type, tags)
        print(f"Created {created_count} new assets")
        return created_count

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
            AssetAttributeDefinition,
        )

        attribute_defs = {
            ad.api_key: ad for ad in asset.asset_type.field_definitions.all()
        }
        # Ensure osm_id and osm_type are set
        if "osm_id" in attribute_defs:
            TextAttributeValue.objects.update_or_create(
                asset=asset,
                field_definition=attribute_defs["osm_id"],
                defaults={"value": str(osm_id)},
            )
        if "osm_type" in attribute_defs:
            TextAttributeValue.objects.update_or_create(
                asset=asset,
                field_definition=attribute_defs["osm_type"],
                defaults={"value": str(osm_type)},
            )

        # Convert each tag into its own attribute
        from django.db import transaction

        sanitized_tags = self.sanitize_tags(tags)
        # Get the current max order for this asset type
        existing_orders = set(
            asset.asset_type.field_definitions.values_list("order", flat=True)
        )
        next_order = max(existing_orders) + 1 if existing_orders else 0

        for tag_key, tag_value in sanitized_tags.items():
            # Skip if tag_key is already handled (osm_id, osm_type)
            if tag_key in ("osm_id", "osm_type"):
                continue
            # Try to get or create the attribute definition for this tag
            attr_def, created = AssetAttributeDefinition.objects.get_or_create(
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
            TextAttributeValue.objects.update_or_create(
                asset=asset,
                field_definition=attr_def,
                defaults={"value": str(tag_value)},
            )

        # Optionally, still store all tags as a JSON blob for reference
        if "tags" in attribute_defs:
            JSONAttributeValue.objects.update_or_create(
                asset=asset,
                field_definition=attribute_defs["tags"],
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
        self.stdout.write(self.style.SUCCESS(f"Importing OSM data for {location}"))
        bbox = self.geocode_location(location)
        self.stdout.write(self.style.SUCCESS(f"Using bounding box: {bbox}"))

        importer = OSMImporter()

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

        for feature_type, feature_value, feature_limit, label in import_features:
            self.stdout.write(f"\n--- Importing {label} ---")
            importer.import_osm_features(
                bbox=bbox,
                feature_type=feature_type,
                feature_value=feature_value,
                limit=feature_limit,
            )

        self.stdout.write(self.style.SUCCESS("\n=== Import Complete ==="))
