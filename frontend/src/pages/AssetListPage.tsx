import { Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Link, CircularProgress, Stack } from '@mui/material'
import type { Asset, AssetTypeAttribute } from '../types'
import { useLoaderData, useLocation, useParams } from 'react-router-dom'
import { Link as RouterLink } from 'react-router-dom'
import { useState, useEffect, useRef, useCallback } from 'react'
import { fetchAssetsByType } from '../api/assets'

export default function AssetListPage() {
  const initialData = useLoaderData() as {
    assets: Asset[],
    attributes?: AssetTypeAttribute[],
    count: number,
    page: number,
    pageSize: number,
    workspaceId: string
  }

  const { assetTypeId } = useParams()
  const location = useLocation()

  // State for infinite scroll
  const [assets, setAssets] = useState<Asset[]>(initialData.assets || [])
  const [attributes] = useState<AssetTypeAttribute[]>(initialData.attributes || [])
  const [page, setPage] = useState(initialData.page || 1)
  const [hasMore, setHasMore] = useState((initialData.assets?.length || 0) < (initialData.count || 0))
  const [isLoading, setIsLoading] = useState(false)
  const [totalCount] = useState(initialData.count || 0)

  const pageSize = 25
  const observerRef = useRef<IntersectionObserver | null>(null)
  const loadMoreRef = useRef<HTMLTableRowElement | null>(null)

  // Reset when route changes (different asset type)
  useEffect(() => {
    setAssets(initialData.assets || [])
    setPage(initialData.page || 1)
    setHasMore((initialData.assets?.length || 0) < (initialData.count || 0))
  }, [initialData])

  const loadMore = useCallback(async () => {
    if (isLoading || !hasMore) return

    setIsLoading(true)
    try {
      const nextPage = page + 1
      const response = await fetchAssetsByType(
        initialData.workspaceId,
        assetTypeId!,
        nextPage,
        pageSize
      )

      const newAssets = response.results || []
      setAssets(prev => [...prev, ...newAssets])
      setPage(nextPage)

      // Check if there are more pages
      const totalLoaded = assets.length + newAssets.length
      setHasMore(totalLoaded < response.count)
    } catch (error) {
      console.error('Failed to load more assets:', error)
    } finally {
      setIsLoading(false)
    }
  }, [isLoading, hasMore, page, initialData.workspaceId, assetTypeId, assets.length])

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
    if (!asset?.attributes?.[apiKey]) {
      return 'N/A'
    }
    const value = asset.attributes[apiKey]
    if (value === null || value === undefined) return 'N/A'
    if (typeof value === 'boolean') return value ? 'Yes' : 'No'
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2)
    }
    return String(value)
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
          <Typography color="text.secondary">
            Showing {assets.length} of {totalCount}
          </Typography>
        </Stack>
        <TableContainer component={Paper} sx={{ flexGrow: 1, overflow: 'auto', minHeight: 0 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, minWidth: '150px' }}>Name</TableCell>
                <TableCell sx={{ fontWeight: 600, minWidth: '150px' }}>Coordinates</TableCell>
                {attributes.map(attr => (
                  <TableCell key={attr.id} sx={{ fontWeight: 600, minWidth: '120px' }}>{attr.name}</TableCell>
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
                  {attributes.map(attr => (
                    <TableCell key={attr.id} sx={{
                      minWidth: '120px',
                      maxWidth: attr.attributeType === 'json' ? '300px' : 'auto',
                      whiteSpace: attr.attributeType === 'json' ? 'pre-wrap' : 'normal',
                      fontFamily: attr.attributeType === 'json' ? 'monospace' : 'inherit',
                      fontSize: attr.attributeType === 'json' ? '0.75rem' : 'inherit',
                      wordBreak: 'break-word'
                    }}>
                      {getAttributeValue(asset, attr.apiKey)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              {/* Sentinel row for intersection observer */}
              {hasMore && (
                <TableRow ref={loadMoreRef}>
                  <TableCell colSpan={2 + attributes.length} sx={{ textAlign: 'center', py: 2 }}>
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
