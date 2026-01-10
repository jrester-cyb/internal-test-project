#!/usr/bin/env python
"""
Script to import OpenStreetMap data into the Asset database.
Uses the Overpass API to query OSM data and creates Assets with geometry.
"""

import os
import sys
import django
import requests
import json
from typing import Dict, List, Any
from django.contrib.gis.geos import Point, LineString, Polygon, MultiPolygon

# Setup Django
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "app.settings")
django.setup()

from assets.models import Asset, AssetType, AssetAttributeDefinition, JSONAttributeValue


class OSMImporter:
        def geocode_location(self, location_name: str) -> tuple:
            """
            Geocode a location name using Nominatim and return bounding box (south, west, north, east)
            """
            url = f"https://nominatim.openstreetmap.org/search"
            params = {
                "q": location_name,
                "format": "json",
                "limit": 1,
            }
            try:
                resp = self.session.get(url, params=params, timeout=30)
                resp.raise_for_status()
                results = resp.json()
                if not results:
                    raise Exception(f"No results found for location: {location_name}")
                bbox = results[0]["boundingbox"]
                # bbox: [south, north, west, east] as strings
                south, north, west, east = map(float, bbox)
                return (south, west, north, east)
            except Exception as e:
                print(f"Error geocoding location '{location_name}': {e}")
                raise
    """Import OSM data into Asset database"""

    OVERPASS_URL = "https://overpass-api.de/api/interpreter"

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": "AssetVisualizer/1.0 (Django App)"})

    def query_overpass(self, query: str, max_retries: int = 3, retry_delay: int = 10) -> Dict[str, Any]:
        """
        Execute an Overpass API query with retry on 504 Gateway Timeout

        Args:
            query: Overpass QL query string
            max_retries: Number of times to retry on 504
            retry_delay: Seconds to wait between retries

        Returns:
            JSON response from Overpass API
        """
        attempt = 0
        while attempt < max_retries:
            try:
                response = self.session.post(
                    self.OVERPASS_URL, data={"data": query}, timeout=60
                )
                if response.status_code == 504:
                    attempt += 1
                    print(f"504 Gateway Timeout from Overpass API (attempt {attempt}/{max_retries}), retrying in {retry_delay}s...")
                    import time
                    time.sleep(retry_delay)
                    continue
                response.raise_for_status()
                return response.json()
            except requests.exceptions.RequestException as e:
                print(f"Error querying Overpass API: {e}")
                if hasattr(e, 'response') and getattr(e.response, 'status_code', None) == 504:
                    attempt += 1
                    print(f"504 Gateway Timeout from Overpass API (attempt {attempt}/{max_retries}), retrying in {retry_delay}s...")
                    import time
                    time.sleep(retry_delay)
                    continue
                raise
        print(f"Failed after {max_retries} attempts due to repeated 504 Gateway Timeout errors.")
        raise Exception("Overpass API 504 Gateway Timeout after retries")

    def build_geometry(self, element: Dict[str, Any]) -> Any:
        """
        Convert OSM element to Django GIS geometry

        Args:
            element: OSM element dict

        Returns:
            Django GIS geometry object or None
        """
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
                # Check if it's a closed polygon
                if coords[0] == coords[-1] and len(coords) >= 4:
                    return Polygon(coords, srid=4326)
                else:
                    return LineString(coords, srid=4326)

        elif element_type == "relation":
            # For now, skip relations (would need more complex handling)
            pass

        return None

    def get_or_create_asset_type(self, osm_type: str) -> AssetType:
        """
        Get or create AssetType for OSM feature type

        Args:
            osm_type: OSM type (e.g., 'building', 'highway', 'amenity')

        Returns:
            AssetType instance
        """
        asset_type, created = AssetType.objects.get_or_create(
            name=f"OSM {osm_type.title()}",
            defaults={"description": f"OpenStreetMap {osm_type} features"},
        )

        if created:
            # Create common attribute definitions for this type
            self.create_osm_attributes(asset_type)

        return asset_type

    def create_osm_attributes(self, asset_type: AssetType):
        """Create standard OSM attribute definitions"""
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
        """
        Import OSM features from a bounding box

        Args:
            bbox: Bounding box as (south, west, north, east)
            feature_type: OSM feature type (e.g., 'amenity', 'building', 'highway')
            feature_value: Optional specific value (e.g., 'restaurant', 'school')
            limit: Maximum number of features to import

        Returns:
            Number of assets created
        """
        south, west, north, east = bbox

        # Build Overpass query
        if feature_value:
            query = f"""
            [out:json][timeout:25];
            (
              node["{feature_type}"="{feature_value}"]({south},{west},{north},{east});
              way["{feature_type}"="{feature_value}"]({south},{west},{north},{east});
              relation["{feature_type}"="{feature_value}"]({south},{west},{north},{east});
            );
            out geom {limit};
            """
        else:
            query = f"""
            [out:json][timeout:25];
            (
              node["{feature_type}"]({south},{west},{north},{east});
              way["{feature_type}"]({south},{west},{north},{east});
              relation["{feature_type}"]({south},{west},{north},{east});
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

            # Skip if no geometry
            geometry = self.build_geometry(element)
            if not geometry:
                continue

            # Get name from tags
            name = tags.get("name", tags.get("ref", f"{feature_type} {osm_id}"))
            name = self.sanitize_text(name)
            description = self.sanitize_text(tags.get("description", ""))

            # Create or update asset
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

            # Store OSM attributes
            self.store_osm_attributes(asset, osm_id, osm_type, tags)

        print(f"Created {created_count} new assets")
        return created_count

    def sanitize_text(self, text: str) -> str:
        """
        Sanitize text to handle Unicode encoding issues

        Args:
            text: Input text that may contain Unicode characters

        Returns:
            ASCII-safe text
        """
        if not text:
            return text
        # Remove non-ASCII characters for SQL_ASCII database
        return text.encode("ascii", errors="ignore").decode("ascii")

    def sanitize_tags(self, tags: Dict) -> Dict:
        """
        Sanitize all tag values to handle Unicode

        Args:
            tags: Dictionary of OSM tags

        Returns:
            Sanitized tags dictionary
        """
        sanitized = {}
        for key, value in tags.items():
            if isinstance(value, str):
                sanitized[key] = self.sanitize_text(value)
            else:
                sanitized[key] = value
        return sanitized

    def store_osm_attributes(
        self, asset: Asset, osm_id: int, osm_type: str, tags: Dict
    ):
        """Store OSM-specific attributes for an asset"""
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

        # Store OSM ID
        if "osm_id" in attribute_defs:
            TextAttributeValue.objects.update_or_create(
                asset=asset,
                field_definition=attribute_defs["osm_id"],
                defaults={"value": str(osm_id)},
            )

        # Store OSM type
        if "osm_type" in attribute_defs:
            TextAttributeValue.objects.update_or_create(
                asset=asset,
                field_definition=attribute_defs["osm_type"],
                defaults={"value": osm_type},
            )

        # Store all tags as JSON (sanitized for ASCII-only database)
        if "tags" in attribute_defs:
            sanitized_tags = self.sanitize_tags(tags)
            JSONAttributeValue.objects.update_or_create(
                asset=asset,
                field_definition=attribute_defs["tags"],
                defaults={"value": sanitized_tags},
            )

        # For each tag, create a field definition if missing and store value
        order_start = len(attribute_defs)
        for i, (key, raw_value) in enumerate(tags.items()):
            # Determine attribute type
            if isinstance(raw_value, bool):
                attr_type = "boolean"
            elif isinstance(raw_value, int) or (
                isinstance(raw_value, str) and raw_value.isdigit()
            ):
                attr_type = "number"
            elif isinstance(raw_value, str):
                attr_type = "text"
            else:
                attr_type = "json"

            # Create field definition if missing
            if key not in attribute_defs:
                # Find used orders for this asset type
                used_orders = set(
                    ad.order for ad in asset.asset_type.field_definitions.all()
                )
                next_order = 0
                while next_order in used_orders:
                    next_order += 1
                field_def = AssetAttributeDefinition.objects.create(
                    asset_type=asset.asset_type,
                    name=key,
                    api_key=key,
                    attribute_type=attr_type,
                    description=f"OSM tag: {key}",
                    order=next_order,
                )
                attribute_defs[key] = field_def
            else:
                field_def = attribute_defs[key]

            # Store value in correct attribute value model
            if attr_type == "boolean":
                BooleanAttributeValue.objects.update_or_create(
                    asset=asset,
                    field_definition=field_def,
                    defaults={"value": bool(raw_value)},
                )
            elif attr_type == "number":
                try:
                    num_value = float(raw_value)
                except Exception:
                    num_value = None
                NumberAttributeValue.objects.update_or_create(
                    asset=asset,
                    field_definition=field_def,
                    defaults={"value": num_value},
                )
            elif attr_type == "text":
                TextAttributeValue.objects.update_or_create(
                    asset=asset,
                    field_definition=field_def,
                    defaults={"value": str(raw_value)},
                )
            else:
                JSONAttributeValue.objects.update_or_create(
                    asset=asset,
                    field_definition=field_def,
                    defaults={"value": raw_value},
                )


def main():
    """Main entry point"""
    importer = OSMImporter()

    import argparse
    parser = argparse.ArgumentParser(description="Import OSM data for a location")
    parser.add_argument("location", type=str, help="Location name (city, address, etc)")
    parser.add_argument("--limit", type=int, default=50, help="Max features per type")
    args = parser.parse_args()

    print(f"=== Importing OSM Data for {args.location} ===\n")
    bbox = importer.geocode_location(args.location)
    print(f"Using bounding box: {bbox}")

    # Import restaurants
    print("\n--- Importing Restaurants ---")
    importer.import_osm_features(
        bbox=bbox,
        feature_type="amenity",
        feature_value="restaurant",
        limit=args.limit,
    )

    # Import bars
    print("\n--- Importing Bars ---")
    importer.import_osm_features(
        bbox=bbox, feature_type="amenity", feature_value="bar", limit=args.limit
    )

    # Import buildings
    print("\n--- Importing Buildings ---")
    importer.import_osm_features(
        bbox=bbox, feature_type="building", limit=args.limit * 2
    )

    print("\n=== Import Complete ===")


if __name__ == "__main__":
    main()
