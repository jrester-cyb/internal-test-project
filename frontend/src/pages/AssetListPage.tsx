import { Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Link, CircularProgress, Stack, Switch, FormControlLabel } from '@mui/material'
import type { Asset, AssetTypeAttribute } from '../types'
import { useLoaderData, useLocation, useParams } from 'react-router-dom'
import { Link as RouterLink } from 'react-router-dom'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { fetchAssetsByType } from '../api/assets'
import AttributeValueRenderer from '../components/AttributeValueRenderer'

export default function AssetListPage() {
  const initialData = useLoaderData() as {
    assets: Asset[],
    attributes?: AssetTypeAttribute[],
    nextCursor: string | null,
    workspaceId: string
  }

  const { assetTypeId } = useParams()
  const location = useLocation()

  // State for infinite scroll with cursor pagination
  const [assets, setAssets] = useState<Asset[]>(initialData.assets || [])
  const [attributes] = useState<AssetTypeAttribute[]>(initialData.attributes || [])
  const [nextCursor, setNextCursor] = useState<string | null>(initialData.nextCursor)
  const [hasMore, setHasMore] = useState(!!initialData.nextCursor)
  const [isLoading, setIsLoading] = useState(false)
  const [showHidden, setShowHidden] = useState(false)

  // Filter attributes based on showHidden toggle
  const hiddenCount = useMemo(() => attributes.filter(attr => attr.isHidden).length, [attributes])
  const displayAttributes = useMemo(
    () => showHidden ? attributes : attributes.filter(attr => !attr.isHidden),
    [attributes, showHidden]
  )

  const observerRef = useRef<IntersectionObserver | null>(null)
  const loadMoreRef = useRef<HTMLTableRowElement | null>(null)

  // Reset when route changes (different asset type)
  useEffect(() => {
    setAssets(initialData.assets || [])
    setNextCursor(initialData.nextCursor)
    setHasMore(!!initialData.nextCursor)
  }, [initialData])

  const loadMore = useCallback(async () => {
    if (isLoading || !hasMore || !nextCursor) return

    setIsLoading(true)
    try {
      // Use cursor URL directly - no need to track page numbers
      const response = await fetchAssetsByType(
        initialData.workspaceId,
        assetTypeId!,
        nextCursor
      )

      const newAssets = response.results || []
      setAssets(prev => [...prev, ...newAssets])

      // Update cursor for next page
      setNextCursor(response.next)
      setHasMore(!!response.next)
    } catch (error) {
      console.error('Failed to load more assets:', error)
    } finally {
      setIsLoading(false)
    }
  }, [isLoading, hasMore, nextCursor, initialData.workspaceId, assetTypeId])

  // Set up intersection observer for infinite scroll
  useEffect(() => {
    if (observerRef.current) {
      observerRef.current.disconnect()
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
          loadMore()
        }
      },
      { threshold: 0.1 }
    )

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current)
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [hasMore, isLoading, loadMore])

  const formatCoordinates = (location: any) => {
    if (!location || !location.coordinates) {
      return 'N/A'
    }

    const coords = location.coordinates
    // Location is always a Point: [lng, lat]
    if (Array.isArray(coords) && coords.length >= 2 && typeof coords[0] === 'number') {
      return `${coords[1].toFixed(6)}, ${coords[0].toFixed(6)}`
    }

    return 'N/A'
  }

  const getAttributeValue = (asset: Asset, apiKey: string) => {
    return asset?.attributes?.[apiKey] ?? null
  }

  return (
    <Box sx={{
      flexGrow: 1,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      bgcolor: 'background.default',
      height: '100%',
      minHeight: 0
    }}>
      <Box sx={{
        flexGrow: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        p: 3,
        minHeight: 0
      }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2} sx={{ flexShrink: 0 }}>
          <Typography variant="h5" component="h2">Assets</Typography>
          <Stack direction="row" alignItems="center" spacing={2}>
            {hiddenCount > 0 && (
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={showHidden}
                    onChange={(e) => setShowHidden(e.target.checked)}
                  />
                }
                label={
                  <Typography variant="body2" color="text.secondary">
                    Show hidden ({hiddenCount})
                  </Typography>
                }
              />
            )}
            <Typography color="text.secondary">
              {assets.length} loaded{hasMore ? '...' : ''}
            </Typography>
          </Stack>
        </Stack>
        <TableContainer component={Paper} sx={{ flexGrow: 1, overflow: 'auto', minHeight: 0 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, minWidth: '150px' }}>Name</TableCell>
                <TableCell sx={{ fontWeight: 600, minWidth: '150px' }}>Coordinates</TableCell>
                {displayAttributes.map(attr => (
                  <TableCell key={attr.id} sx={{ fontWeight: 600, minWidth: '120px', opacity: attr.isHidden ? 0.5 : 1 }}>
                    {attr.name}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {assets.map(asset => (
                <TableRow
                  key={asset.id}
                  hover
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell sx={{ minWidth: '150px' }}>
                    <Link
                      component={RouterLink}
                      to={asset.id} underline="hover" state={{
                        ...location.state,
                        assetName: asset.name
                      }}
                    >
                      {asset.name}
                    </Link>
                  </TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', minWidth: '150px' }}>
                    {formatCoordinates(asset.location)}
                  </TableCell>
                  {displayAttributes.map(attr => (
                    <TableCell key={attr.id} sx={{
                      minWidth: '120px',
                      maxWidth: '300px',
                      opacity: attr.isHidden ? 0.5 : 1
                    }}>
                      <AttributeValueRenderer
                        attribute={attr}
                        value={getAttributeValue(asset, attr.apiKey)}
                        maxLines={2}
                        lineNumbers="fullscreen"
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              {/* Sentinel row for intersection observer */}
              {hasMore && (
                <TableRow ref={loadMoreRef}>
                  <TableCell colSpan={2 + displayAttributes.length} sx={{ textAlign: 'center', py: 2 }}>
                    {isLoading ? (
                      <CircularProgress size={24} />
                    ) : (
                      <Typography color="text.secondary" variant="body2">
                        Scroll to load more...
                      </Typography>
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        {assets.length === 0 && !isLoading && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography color="text.secondary">
              No assets found
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  )
}
