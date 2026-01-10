# OSM Data Import Script

This script imports OpenStreetMap (OSM) data into the Asset database using the Overpass API.

## Features

- Query OSM data by feature type (amenity, building, highway, etc.)
- Automatic geometry conversion (Points, LineStrings, Polygons)
- Automatic geohash generation
- Stores OSM tags as JSON attributes
- Creates AssetTypes automatically for each OSM feature type

## Usage

### Run the script inside the Django container:

```bash
docker-compose -f docker-compose.dev.yml exec web python /app/scripts/import_osm_data.py
```

### Customize the import:

Edit the `main()` function in `import_osm_data.py` to change:

1. **Bounding box** - Define your area of interest:
   ```python
   bbox = (south, west, north, east)  # in decimal degrees
   ```

2. **Feature types** - Import different OSM features:
   ```python
   # Restaurants
   importer.import_osm_features(
       bbox=your_bbox,
       feature_type='amenity',
       feature_value='restaurant',
       limit=50
   )
   
   # Schools
   importer.import_osm_features(
       bbox=your_bbox,
       feature_type='amenity',
       feature_value='school',
       limit=50
   )
   
   # All buildings
   importer.import_osm_features(
       bbox=your_bbox,
       feature_type='building',
       limit=100
   )
   
   # Roads
   importer.import_osm_features(
       bbox=your_bbox,
       feature_type='highway',
       limit=100
   )
   ```

## Common OSM Feature Types

### Amenities
- `restaurant`, `bar`, `cafe`, `pub`
- `school`, `university`, `library`
- `hospital`, `clinic`, `pharmacy`
- `bank`, `atm`, `post_office`
- `parking`, `fuel`, `charging_station`

### Buildings
- `building=yes` (all buildings)
- `building=residential`
- `building=commercial`
- `building=industrial`

### Highways (Roads)
- `highway=motorway`
- `highway=primary`
- `highway=residential`
- `highway=footway`

### Natural Features
- `natural=water`
- `natural=tree`
- `natural=beach`

## Finding Bounding Boxes

Use [bboxfinder.com](http://bboxfinder.com/) to easily find coordinates for your area of interest.

## API Rate Limits

The Overpass API has usage limits:
- Be respectful with query size and frequency
- Use appropriate limits in your queries
- Consider the `timeout` parameter for large queries

## Example Locations

```python
# New Orleans French Quarter
new_orleans_bbox = (29.945, -90.08, 29.965, -90.06)

# Manhattan, New York
manhattan_bbox = (40.70, -74.02, 40.80, -73.92)

# San Francisco Downtown
sf_bbox = (37.77, -122.42, 37.80, -122.39)
```
