import { Marker } from 'react-leaflet'
import { divIcon } from 'leaflet'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Cluster } from '../types'
import { useTheme } from '../contexts/ThemeContext'
import { lightTheme, darkTheme } from '../theme'

interface ClusterMarkersProps {
  clusters: Cluster[]
  onClusterClick: (cluster: Cluster) => void
}

export default function ClusterMarkers({ clusters, onClusterClick }: ClusterMarkersProps) {
  const { isDarkMode } = useTheme()
  // Use primary for background, secondary.light for text/outline in light mode, secondary.dark in dark mode
  const bgColor = lightTheme.palette.primary.main
  const textColor = isDarkMode ? darkTheme.palette.secondary.dark : lightTheme.palette.secondary.light
  const outlineColor = textColor

  return (
    <>
      {clusters.map(cluster => {
        const size = Math.max(30, Math.min(60, 30 + Math.log10(cluster.count) * 10))

        const icon = divIcon({
          html: renderToStaticMarkup(
            <div
              className="flex items-center justify-center rounded-full cursor-pointer font-bold shadow-lg"
              style={{
                backgroundColor: bgColor,
                color: textColor,
                border: `2px solid ${outlineColor}`,
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
              key={cluster.h3Index}
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
