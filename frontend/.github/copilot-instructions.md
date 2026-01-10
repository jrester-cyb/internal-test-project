# React Asset Visualizer Project

## Project Overview
A React application with Vite for visualizing asset data from a Django REST API with map-based clustering and detail views.

## Checklist

- [x] Create copilot-instructions.md file
- [x] Clarify Project Requirements
- [x] Scaffold the Vite React Project
- [x] Customize the Project
- [x] Install Dependencies
- [x] Create and Run Task
- [x] Ensure Documentation is Complete

## Stack
- React 18 with TypeScript
- Vite for build tooling
- Mapbox GL JS for mapping
- Tailwind CSS for styling
- API: Django REST with GeoJSON support (camelCase fields)

## API Endpoints
- GET /api/assets/tiles/?bbox=...&limit=...
- GET /api/assets/clusters/?zoom=...&bbox=...
- POST /api/assets/search/ (with filter body)

## Setup Instructions

1. Copy `.env.example` to `.env`
2. Add your Mapbox token to `.env`
3. Run `npm run dev` to start development server

## Completed Steps

✅ Created Vite React TypeScript project
✅ Installed Mapbox GL JS and react-map-gl
✅ Installed Tailwind CSS
✅ Created map visualization with cluster support
✅ Built API client for Django backend
✅ Created components: AssetList, AssetDetails, ClusterMarkers
✅ Added zoom-based rendering (clusters vs individual assets)
✅ Configured environment variables
✅ Documentation complete
