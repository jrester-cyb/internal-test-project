# Asset Visualizer Frontend

React application for visualizing asset data with map-based clustering.

## Setup

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and add your Mapbox token
3. Start dev server: `npm run dev`

## Features

- Interactive map with Mapbox GL JS
- Cluster view at high zoom levels
- Individual asset markers when zoomed in
- List view with asset details
- Real-time data loading based on viewport

## API Endpoints

- GET /api/assets/tiles/ - Get assets as GeoJSON
- GET /api/assets/clusters/ - Get clustered assets
- POST /api/assets/search/ - Search with filters
- GET /api/assets/{id}/ - Get asset details
