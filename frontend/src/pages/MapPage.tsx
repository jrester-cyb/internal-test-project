import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useSearchParams, useLoaderData } from 'react-router-dom'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { fetchClusters, fetchTiles } from '../api/assets'
import type { Asset, Cluster } from '../types'
import type { AttributeFilter } from '../components/FilterBuilder'
import { MapProvider } from '../contexts/MapContext'
import MapView from '../components/MapView'
import MapEvents from '../components/MapEvents'

// Fix for default marker icon in Leaflet with React
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

function MapPage() {
  const { organizationId, workspaceId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const loaderData = useLoaderData() as {
    initialCenter: [number, number]
    initialZoom: number
    initialAssets: any[]
    initialClusters: any[]
    selectedAsset: any
    selectedAssetAttributes: any[]
  } | null

  // Use loader data for initial state
  const [center, setCenter] = useState<[number, number]>(loaderData?.initialCenter || [29.9511, -90.0715])
  const [zoom, setZoom] = useState(loaderData?.initialZoom || 10)
  const [assets, setAssets] = useState<any[]>(loaderData?.initialAssets || [])
  const [clusters, setClusters] = useState<any[]>(loaderData?.initialClusters || [])

  const [activeFilters] = useState<any>(null)
  const [selectedAssetTypes, setSelectedAssetTypes] = useState<string[]>([])
  const [attributeFilters, setAttributeFilters] = useState<AttributeFilter[]>([])
  const [nameFilter, setNameFilter] = useState('')

  const initialUrlUpdateDone = useRef(false)

  const loadMapData = useCallback(async (bounds: number[], zoom: number, filters?: any) => {
    if (!workspaceId) return

    try {
      // Merge asset type and attribute filters with other filters
      let mergedFilters = filters ? { ...filters } : null
      const filterGroups: any[] = []

      // Add name filter if present
      if (nameFilter.trim()) {
        filterGroups.push({
          field: 'name',
          value: nameFilter.trim(),
          operator: 'icontains'
        })
      }

      // Group attribute filters by asset type
      const attributesByType: Record<string, any[]> = {}
      attributeFilters.forEach(af => {
        if (!attributesByType[af.assetTypeId]) {
          attributesByType[af.assetTypeId] = []
        }
        attributesByType[af.assetTypeId].push({
          field: `attributes.${af.attributeKey}`,
          value: af.value,
          operator: af.operator
        })
      })

      // Create filter groups: each asset type with its attribute filters in an AND clause
      if (selectedAssetTypes.length > 0) {
        selectedAssetTypes.forEach(typeId => {
          const typeFilters: any[] = [
            {
              field: 'assetTypeId',
              value: typeId,
              operator: 'exact'
            }
          ]

          // Add attribute filters for this asset type
          if (attributesByType[typeId]) {
            typeFilters.push(...attributesByType[typeId])
          }

          // If only one filter (just the asset type), add it directly
          // Otherwise, wrap in an AND clause
          if (typeFilters.length === 1) {
            filterGroups.push(typeFilters[0])
          } else {
            filterGroups.push({
              logic: 'AND',
              filters: typeFilters
            })
          }
        })
      }

      if (filterGroups.length > 0) {
        if (mergedFilters && mergedFilters.filters) {
          mergedFilters = {
            ...mergedFilters,
            filters: [...mergedFilters.filters, ...filterGroups],
            logic: 'AND'
          }
        } else {
          mergedFilters = {
            filters: filterGroups,
            logic: selectedAssetTypes.length > 1 ? 'OR' : 'AND'
          }
        }
      }

      if (zoom < 12) {
        // Show clusters at high zoom out
        const clusterData = await fetchClusters(workspaceId, zoom, bounds, mergedFilters)
        // Separate GeoJSON features (single-asset clusters) from true clusters
        const geojsonAssets: Asset[] = []
        const realClusters: Cluster[] = []
        for (const c of clusterData.clusters) {
          if (c.type === 'Feature' && c.geometry && c.properties) {
            geojsonAssets.push({
              id: c.id,
              name: c.properties.name,
              assetType: c.properties.assetTypeId,
              h3Index: c.properties.h3Index,
              geometry: c.geometry
            })
          } else {
            realClusters.push(c)
          }
        }
        setClusters(realClusters)
        setAssets(geojsonAssets)
      } else {
        // Show individual assets when zoomed in
        const tileData = await fetchTiles(workspaceId, bounds, 5000, mergedFilters)
        setAssets(tileData.features.map((f: any) => ({
          id: f.id,
          name: f.properties.name,
          assetType: f.properties.assetTypeId,
          h3Index: f.properties.h3Index,
          geometry: f.geometry
        })))
        setClusters([])
      }
    } catch (error) {
      console.error('Error loading map data:', error)
    }
  }, [workspaceId, selectedAssetTypes, attributeFilters, nameFilter])

  // Update URL when map position changes
  useEffect(() => {
    const newSearchParams = new URLSearchParams(searchParams)
    newSearchParams.set('lat', center[0].toFixed(6))
    newSearchParams.set('lng', center[1].toFixed(6))
    newSearchParams.set('zoom', zoom.toString())

    setSearchParams(newSearchParams, { replace: true })
    initialUrlUpdateDone.current = true
  }, [center, zoom, setSearchParams, searchParams])

  return (
    <MapProvider organizationId={organizationId || ''} workspaceId={workspaceId || ''}>
      <MapView
        center={center}
        zoom={zoom}
        clusters={clusters}
        assets={assets}
        activeFilters={activeFilters}
        selectedAssetTypes={selectedAssetTypes}
        attributeFilters={attributeFilters}
        nameFilter={nameFilter}
        hasInitialData={true}
        setSelectedAssetTypes={setSelectedAssetTypes}
        setAttributeFilters={setAttributeFilters}
        setNameFilter={setNameFilter}
        loadMapData={loadMapData}
        onCenterChange={setCenter}
        onZoomChange={setZoom}
        workspaceId={workspaceId || ''}
        MapEvents={MapEvents}
      />
    </MapProvider>
  )
}

export default MapPage