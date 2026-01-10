import { Marker } from 'react-leaflet'
import { divIcon } from 'leaflet'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Cluster } from '../types'

interface ClusterMarkersProps {
  clusters: Cluster[]
  onClusterClick: (cluster: Cluster) => void
}

export default function ClusterMarkers({ clusters, onClusterClick }: ClusterMarkersProps) {
  return (
    <>
      {clusters.map(cluster => {
        const size = Math.max(30, Math.min(60, 30 + Math.log10(cluster.count) * 10))

        const icon = divIcon({
          html: renderToStaticMarkup(
            <div
              className="flex items-center justify-center bg-orange-500 text-white rounded-full border-2 border-white cursor-pointer font-bold shadow-lg"
              style={{
                width: `${size}px`,
                height: `${size}px`,
                marginLeft: `-${size / 2}px`,
                marginTop: `-${size / 2}px`
              }}
            >
              {cluster.count}
            </div>
          ),
          className: '',
          iconSize: [size, size]
        })

        // Only render marker if lat/lon are valid numbers
        const { lat, lon } = cluster.center || {}
        if (typeof lat === 'number' && typeof lon === 'number' && !isNaN(lat) && !isNaN(lon)) {
          return (
            <Marker
              key={cluster.geohash}
              position={[lat, lon]}
              icon={icon}
              eventHandlers={{
                click: () => onClusterClick(cluster)
              }}
            />
          )
        }
        return null
      })}
    </>
  )
}
