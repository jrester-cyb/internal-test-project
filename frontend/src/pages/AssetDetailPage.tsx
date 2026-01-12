import { useState, useRef, useEffect } from 'react'
import { useLoaderData } from 'react-router-dom'
import { Box, Typography, Card, CardContent, CardHeader, Table, TableBody, TableCell, TableRow, Chip, Container, Grid } from '@mui/material'
import { Place as PlaceIcon, Category as CategoryIcon, Edit as EditIcon, Map as MapIcon, Share as ShareIcon, Download as DownloadIcon } from '@mui/icons-material'
import type { Asset } from '../types'
import ActionButtons from '../components/ActionButtons'

export default function AssetDetailPage() {
  const asset = useLoaderData() as Asset
  const [menuAnchorEl, setMenuAnchorEl] = useState<HTMLElement | null>(null)
  const [containerWidth, setContainerWidth] = useState(1000)
  const headerRef = useRef<HTMLDivElement>(null)

  // Track container width for responsive buttons
  useEffect(() => {
    const updateWidth = () => {
      if (headerRef.current) {
        setContainerWidth(headerRef.current.offsetWidth)
      }
    }

    updateWidth()
    window.addEventListener('resize', updateWidth)
    return () => window.removeEventListener('resize', updateWidth)
  }, [])

  const handleEdit = () => {
    // TODO: Implement edit functionality
    console.log('Edit asset:', asset.id)
  }

  const handleViewOnMap = () => {
    // TODO: Implement view on map functionality
    console.log('View on map:', asset.id)
  }

  const handleShare = () => {
    // TODO: Implement share functionality
    navigator.clipboard.writeText(window.location.href)
    console.log('Share asset:', asset.id)
  }

  const handleDownload = () => {
    // Download asset details as JSON
    const dataStr = JSON.stringify(asset, null, 2)
    const blob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${asset.name.replace(/\s+/g, '_')}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const actions = [
    {
      label: 'Share',
      icon: <ShareIcon fontSize="small" />,
      onClick: handleShare,
      color: 'inherit' as const,
      variant: 'outlined' as const,
      collapseThreshold: 500 // Stays visible longest
    },
    {
      label: 'View on Map',
      icon: <MapIcon fontSize="small" />,
      onClick: handleViewOnMap,
      color: 'inherit' as const,
      variant: 'outlined' as const,
      collapseThreshold: 550 // Collapses second
    },
    {
      label: 'Edit',
      icon: <EditIcon fontSize="small" />,
      onClick: handleEdit,
      color: 'inherit' as const,
      variant: 'outlined' as const,
      collapseThreshold: 700 // Collapses first
    },
    {
      label: 'Download',
      icon: <DownloadIcon fontSize="small" />,
      onClick: handleDownload,
      color: 'inherit' as const,
      variant: 'outlined' as const,
      collapseThreshold: Infinity // Always in menu
    }
  ]

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Fixed Header */}
      <Container maxWidth={false} sx={{ pt: 3, pb: 1, flexShrink: 0 }}>
        <Card sx={{ bgcolor: 'primary.main' }}>
          <CardContent>
            <Box ref={headerRef} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Box>
                <Typography variant="h5" component="h1" sx={{ color: 'primary.contrastText' }}>
                  {asset.name}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1 }}>
                  <Chip
                    icon={<CategoryIcon />}
                    label={asset.assetTypeName || 'Unknown Type'}
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
              <Box sx={{ display: 'flex', gap: 1, color: 'primary.contrastText' }}>
                <ActionButtons
                  actions={actions}
                  width={containerWidth}
                  menuAnchorEl={menuAnchorEl}
                  setMenuAnchorEl={setMenuAnchorEl}
                  size="small"
                  showWhenWider
                  iconOnly
                />
              </Box>
            </Box>
          </CardContent>
        </Card>
      </Container>

      {/* Scrollable Content */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        <Container maxWidth={false} sx={{ py: 3 }}>
          <Grid container spacing={3}>
            {/* First Row: Attributes, Related Assets */}
            {asset.attributes && Object.keys(asset.attributes).length > 0 && (
              <Grid size={{ xs: 12, md: 6 }}>
                <Card sx={{ height: '100%' }}>
                  <CardHeader title="Attributes" />
                  <CardContent>
                    <Table size="small">
                      <TableBody>
                        {Object.entries(asset.attributes).map(([key, value]) => (
                          <TableRow key={key}>
                            <TableCell sx={{ fontWeight: 500, color: 'text.secondary', width: '30%', border: 0 }}>{key}</TableCell>
                            <TableCell sx={{ border: 0 }}>
                              {value !== null && value !== undefined
                                ? (typeof value === 'object' ? (
                                  <Box component="pre" sx={{ m: 0, fontSize: '0.85rem', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                                    {JSON.stringify(value, null, 2)}
                                  </Box>
                                ) : String(value))
                                : <Typography color="text.disabled" component="span">N/A</Typography>}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </Grid>
            )}

            <Grid size={{ xs: 12, md: 6 }}>
              <Card sx={{ height: '100%' }}>
                <CardHeader title="Related Assets" />
                <CardContent>
                  <Typography color="text.secondary" variant="body2">
                    No related assets yet
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            {/* Second Row: Tasks, Files */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Card sx={{ height: '100%' }}>
                <CardHeader title="Tasks" />
                <CardContent>
                  <Typography color="text.secondary" variant="body2">
                    No tasks assigned
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Card sx={{ height: '100%' }}>
                <CardHeader title="Files" />
                <CardContent>
                  <Typography color="text.secondary" variant="body2">
                    No files attached
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            {/* Third Row: Timeline */}
            <Grid size={{ xs: 12 }}>
              <Card sx={{ height: '100%' }}>
                <CardHeader title="Timeline" />
                <CardContent>
                  <Typography color="text.secondary" variant="body2">
                    No activity yet
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Container>
      </Box>
    </Box>
  )
}
