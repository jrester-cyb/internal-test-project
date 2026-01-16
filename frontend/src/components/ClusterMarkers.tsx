import { Marker } from 'react-leaflet'
import { divIcon } from 'leaflet'
import type { Cluster } from '../types'
import { useTheme } from '../contexts/ThemeContext'
import { lightTheme, darkTheme } from '../theme'

interface ClusterMarkersProps {
  clusters: Cluster[]
  selectedClusterId?: string | null
  onClusterClick: (cluster: Cluster) => void
}

export default function ClusterMarkers({ clusters, selectedClusterId, onClusterClick }: ClusterMarkersProps) {
  const { isDarkMode } = useTheme()
  // Use primary for background, secondary.light for text/outline in light mode, secondary.dark in dark mode
  const bgColor = lightTheme.palette.primary.main
  const textColor = isDarkMode ? darkTheme.palette.secondary.dark : lightTheme.palette.secondary.light
  const outlineColor = textColor
  // Glow color for selected state - primary.light in dark mode for better visibility, secondary in light mode
  const glowColor = isDarkMode ? darkTheme.palette.primary.light : lightTheme.palette.secondary.main

  return (
    <>
      {clusters.map(cluster => {
        const isSelected = selectedClusterId === cluster.h3Index
        const size = Math.max(30, Math.min(60, 30 + Math.log10(cluster.count) * 10))

        // Use SVG with blur filter for glow effect when selected
        // Always use same padding to prevent position shift when selecting
        const padding = 15
        const svgSize = size + padding * 2
        const centerOffset = svgSize / 2

        const svgHtml = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgSize}" height="${svgSize}" style="margin-left: -${centerOffset}px; margin-top: -${centerOffset}px;">
          ${isSelected ? `
            <defs>
              <filter id="glow-${cluster.h3Index}" x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="4" result="blur1"/>
                <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur2"/>
                <feMerge>
                  <feMergeNode in="blur1"/>
                  <feMergeNode in="blur1"/>
                  <feMergeNode in="blur2"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>
            <circle cx="${centerOffset}" cy="${centerOffset}" r="${size / 2}" fill="${glowColor}" filter="url(#glow-${cluster.h3Index})"/>
          ` : ''}
          <circle cx="${centerOffset}" cy="${centerOffset}" r="${size / 2 - 1}" fill="${bgColor}" stroke="${outlineColor}" stroke-width="2"/>
          <text x="${centerOffset}" y="${centerOffset}" text-anchor="middle" dominant-baseline="central" fill="${textColor}" font-weight="bold" font-size="12" font-family="system-ui, -apple-system, sans-serif">${cluster.count}</text>
        </svg>`

        const icon = divIcon({
          html: svgHtml,
          className: '',
          iconSize: [svgSize, svgSize]
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
