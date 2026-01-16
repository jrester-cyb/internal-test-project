import { Box, Card, CardContent, Chip, Container } from '@mui/material'
import { Place as PlaceIcon, Category as CategoryIcon, Public as PublicIcon, Edit as EditIcon, Map as MapIcon, Share as ShareIcon, Download as DownloadIcon, FileCopy as CloneIcon, Info as InfoIcon, OpenInNew as OpenInNewIcon } from '@mui/icons-material'
import type { Asset } from '../types'
import ActionButtons from './ActionButtons'
import CopyableText from './CopyableText'
import { useState, useRef, useEffect, useMemo } from 'react'

type AssetOverviewMode = 'page' | 'drawer'

interface AssetOverviewCardProps {
  asset: Asset
  mode?: AssetOverviewMode
  globalValuesOnly?: boolean
  onGlobalValuesToggle?: () => void
  onEdit?: (asset: Asset) => void
  onShare?: () => void
  onViewOnMap?: () => void
  onViewDetails?: () => void
  onClone?: () => void
  onDownload?: () => void
  onSystemDetails?: () => void
}

export default function AssetOverviewCard({
  asset,
  mode = 'page',
  globalValuesOnly = false,
  onGlobalValuesToggle,
  onEdit,
  onShare,
  onViewOnMap,
  onViewDetails,
  onClone,
  onDownload,
  onSystemDetails
}: AssetOverviewCardProps) {
  const [containerWidth, setContainerWidth] = useState<number | null>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const actionsRef = useRef<HTMLDivElement>(null)
  const leftContentRef = useRef<HTMLDivElement>(null)

  // Track container width for responsive buttons
  useEffect(() => {
    const updateWidth = () => {
      if (headerRef.current) {
        // Use the actual container width, not available space
        // ActionButtons will handle the responsive logic internally
        setContainerWidth(headerRef.current.offsetWidth)
      }
    }

    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(updateWidth)

    // Use ResizeObserver to detect container size changes (works for drawer resize)
    const resizeObserver = new ResizeObserver(updateWidth)
    if (headerRef.current) {
      resizeObserver.observe(headerRef.current)
    }

    window.addEventListener('resize', updateWidth)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', updateWidth)
    }
  }, [])

  const actions = useMemo(() => {
    const actionsList = []

    // Edit (both modes) - show first, collapse last
    if (onEdit) {
      actionsList.push({
        label: 'Edit',
        icon: <EditIcon fontSize="small" />,
        onClick: () => onEdit(asset),
        color: 'inherit' as const,
        variant: 'outlined' as const,
        minWidth: mode === 'drawer' ? 500 : 700
      })
    }

    // Open Details Page (drawer mode only)
    if (onViewDetails && mode === 'drawer') {
      actionsList.push({
        label: 'Open asset details page',
        icon: <OpenInNewIcon fontSize="small" />,
        onClick: onViewDetails,
        color: 'inherit' as const,
        variant: 'outlined' as const,
        minWidth: 580
      })
    }

    // View on Map (page mode only)
    if (onViewOnMap && mode === 'page') {
      actionsList.push({
        label: 'View on Map',
        icon: <MapIcon fontSize="small" />,
        onClick: onViewOnMap,
        color: 'inherit' as const,
        variant: 'outlined' as const,
        minWidth: 900
      })
    }

    // Share (both modes)
    if (onShare) {
      actionsList.push({
        label: 'Share',
        icon: <ShareIcon fontSize="small" />,
        onClick: onShare,
        color: 'inherit' as const,
        variant: 'outlined' as const,
        minWidth: mode === 'drawer' ? 680 : 1050
      })
    }

    // Global button (both modes) - always icon-only
    if (onGlobalValuesToggle) {
      actionsList.push({
        label: 'Global',
        icon: <PublicIcon fontSize="small" />,
        onClick: onGlobalValuesToggle,
        color: 'inherit' as const,
        variant: globalValuesOnly ? ('contained' as const) : ('outlined' as const),
        minWidth: mode === 'drawer' ? 780 : 1200,
        tooltip: globalValuesOnly ? 'Showing global asset values' : 'Show global asset'
      })
    }

    // System Details (always in menu)
    if (onSystemDetails) {
      actionsList.push({
        label: 'System Details',
        icon: <InfoIcon fontSize="small" />,
        onClick: onSystemDetails,
        color: 'inherit' as const,
        variant: 'outlined' as const,
        minWidth: Infinity
      })
    }

    // Clone (always in menu)
    if (onClone) {
      actionsList.push({
        label: 'Clone',
        icon: <CloneIcon fontSize="small" />,
        onClick: onClone,
        color: 'inherit' as const,
        variant: 'outlined' as const,
        minWidth: Infinity
      })
    }

    // Download (always in menu)
    if (onDownload) {
      actionsList.push({
        label: 'Download',
        icon: <DownloadIcon fontSize="small" />,
        onClick: onDownload,
        color: 'inherit' as const,
        variant: 'outlined' as const,
        minWidth: Infinity
      })
    }

    return actionsList
  }, [mode, globalValuesOnly, onGlobalValuesToggle, onEdit, onShare, onViewOnMap, onViewDetails, onClone, onDownload, onSystemDetails, asset])

  return (
    <Container maxWidth={false} sx={{ py: 2 }} ref={headerRef}>
      <Card sx={{ bgcolor: 'primary.main', color: 'primary.contrastText' }}>
        <CardContent sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2 }}>
            <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden' }} ref={leftContentRef}>
              <CopyableText
                variant="h4"
                component="h1"
                iconColor="primary.contrastText"
                sx={{ mb: 1, fontWeight: 'bold' }}
              >
                {asset.name}
              </CopyableText>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                <Chip
                  icon={<CategoryIcon />}
                  label={asset.assetTypeName || 'Unknown Type'}
                  size="small"
                  sx={{
                    bgcolor: 'primary.dark',
                    color: 'primary.contrastText',
                    '& .MuiChip-icon': { color: 'primary.contrastText' },
                    flexShrink: 0
                  }}
                />
                <Chip
                  icon={<PlaceIcon />}
                  label={
                    asset.location?.coordinates
                      ? `${asset.location.coordinates[1].toFixed(6)}, ${asset.location.coordinates[0].toFixed(6)}`
                      : '--.------, --.------'
                  }
                  size="small"
                  sx={{
                    bgcolor: 'primary.dark',
                    color: 'primary.contrastText',
                    '& .MuiChip-icon': { color: 'primary.contrastText' },
                    flexShrink: 0
                  }}
                />
              </Box>
            </Box>
            <Box sx={{ display: 'flex', gap: 1, color: 'primary.contrastText', alignItems: 'center', flexShrink: 0 }} ref={actionsRef}>
              {containerWidth !== null && (
                <ActionButtons
                  actions={actions}
                  width={containerWidth}
                  size="small"
                  iconOnly
                />
              )}
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Container>
  )
}