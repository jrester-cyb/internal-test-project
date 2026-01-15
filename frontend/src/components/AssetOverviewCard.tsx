import { Box, Typography, Card, CardContent, Chip, Container, IconButton, Button } from '@mui/material'
import { Place as PlaceIcon, Category as CategoryIcon, Close as CloseIcon, Public as PublicIcon, Edit as EditIcon, Map as MapIcon, Share as ShareIcon, Download as DownloadIcon, FileCopy as CloneIcon, Info as InfoIcon } from '@mui/icons-material'
import type { Asset } from '../types'
import ActionButtons from './ActionButtons'
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
  onClose?: () => void
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
  onSystemDetails,
  onClose
}: AssetOverviewCardProps) {
  const [containerWidth, setContainerWidth] = useState(800)
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

    updateWidth()
    window.addEventListener('resize', updateWidth)
    return () => window.removeEventListener('resize', updateWidth)
  }, [])

  const actions = useMemo(() => {
    const actionsList = []

    // Edit (both modes) - show first
    if (onEdit) {
      actionsList.push({
        label: 'Edit',
        icon: <EditIcon fontSize="small" />,
        onClick: () => onEdit(asset),
        color: 'inherit' as const,
        variant: 'outlined' as const,
        minWidth: 0 // Always show
      })
    }

    // View Details Page (drawer mode only)
    if (onViewDetails && mode === 'drawer') {
      actionsList.push({
        label: 'View Details',
        icon: <InfoIcon fontSize="small" />,
        onClick: onViewDetails,
        color: 'inherit' as const,
        variant: 'outlined' as const,
        minWidth: 0 // Always show
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
        minWidth: 0 // Always show
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
        minWidth: 0 // Always show
      })
    }

    // Global button (both modes)
    if (onGlobalValuesToggle) {
      actionsList.push({
        label: 'Global',
        icon: <PublicIcon fontSize="small" />,
        onClick: onGlobalValuesToggle,
        color: 'inherit' as const,
        variant: globalValuesOnly ? ('contained' as const) : ('outlined' as const),
        minWidth: 0, // Always show
        tooltip: globalValuesOnly ? 'Showing global asset values' : 'Show global asset',
        customComponent: globalValuesOnly ? (
          <Button
            variant="contained"
            size="small"
            startIcon={<PublicIcon fontSize="small" />}
            onClick={onGlobalValuesToggle}
            sx={{
              color: 'success.contrastText',
              bgcolor: 'success.main',
              '&:hover': {
                bgcolor: 'success.dark',
              },
            }}
          >
            Global
          </Button>
        ) : undefined
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
            <Box sx={{ flex: 1, minWidth: 0 }} ref={leftContentRef}>
              <Typography variant="h4" component="h1" sx={{ mb: 1, fontWeight: 'bold' }}>
                {asset.name}
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                <Chip
                  icon={<CategoryIcon />}
                  label={asset.assetType?.name || 'Unknown Type'}
                  size="small"
                  sx={{
                    bgcolor: 'primary.dark',
                    color: 'primary.contrastText',
                    '& .MuiChip-icon': { color: 'primary.contrastText' }
                  }}
                />
                {asset.location && (
                  <Chip
                    icon={<PlaceIcon />}
                    label={`${asset.location.coordinates[1].toFixed(6)}, ${asset.location.coordinates[0].toFixed(6)}`}
                    size="small"
                    sx={{
                      bgcolor: 'primary.dark',
                      color: 'primary.contrastText',
                      '& .MuiChip-icon': { color: 'primary.contrastText' }
                    }}
                  />
                )}
              </Box>
            </Box>
            <Box sx={{ display: 'flex', gap: 1, color: 'primary.contrastText', alignItems: 'center', flexShrink: 0 }} ref={actionsRef}>
              <ActionButtons
                actions={actions}
                width={containerWidth}
                size="small"
                iconOnly
              />
              {onClose && (
                <IconButton
                  onClick={onClose}
                  size="small"
                  sx={{
                    color: 'primary.contrastText',
                    '&:hover': {
                      bgcolor: 'rgba(255,255,255,0.1)'
                    }
                  }}
                >
                  <CloseIcon />
                </IconButton>
              )}
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Container>
  )
}