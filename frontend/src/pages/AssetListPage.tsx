import { Box, Typography, Stack, Switch, FormControlLabel, Link, Skeleton, Button, TextField } from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'
import EditOffIcon from '@mui/icons-material/EditOff'
import type { Asset, AssetTypeAttribute } from '../types'
import { useLoaderData, useLocation, useParams, Link as RouterLink } from 'react-router-dom'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { fetchAssetsByType } from '../api/assets'
import AttributeValueRenderer from '../components/AttributeValueRenderer'
import VirtualizedGrid, { type ColumnDefinition, type CellEditorProps } from '../components/VirtualizedGrid'

export default function AssetListPage() {
  const initialData = useLoaderData() as {
    assets: Asset[],
    attributes?: AssetTypeAttribute[],
    totalCount: number,
    pageSize: number,
    workspaceId: string
  }

  const { assetTypeId } = useParams()
  const location = useLocation()

  // Convert initial assets array to Map for VirtualizedGrid
  const initialItemsMap = useMemo(() => {
    const map = new Map<number, Asset>()
    initialData.assets?.forEach((asset, index) => {
      map.set(index, asset)
    })
    return map
  }, [initialData.assets])

  // State for virtualized grid with offset pagination
  const [items, setItems] = useState<Map<number, Asset>>(initialItemsMap)
  const [attributes] = useState<AssetTypeAttribute[]>(initialData.attributes || [])
  const [totalCount, setTotalCount] = useState(initialData.totalCount)
  const [isLoading, setIsLoading] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  const [editingEnabled, setEditingEnabled] = useState(false)

  // Filter attributes based on showHidden toggle
  const hiddenCount = useMemo(() => attributes.filter(attr => attr.isHidden).length, [attributes])
  const displayAttributes = useMemo(
    () => showHidden ? attributes : attributes.filter(attr => !attr.isHidden),
    [attributes, showHidden]
  )

  // Reset when route changes (different asset type)
  useEffect(() => {
    const map = new Map<number, Asset>()
    initialData.assets?.forEach((asset, index) => {
      map.set(index, asset)
    })
    setItems(map)
    setTotalCount(initialData.totalCount)
  }, [initialData])

  // Load a range of items
  const handleLoadRange = useCallback(async (startIndex: number, endIndex: number) => {
    if (isLoading) return

    setIsLoading(true)
    try {
      const limit = endIndex - startIndex + 1
      const response = await fetchAssetsByType(
        initialData.workspaceId,
        assetTypeId!,
        limit,
        startIndex
      )

      const newAssets = response.results || []
      setItems(prev => {
        const updated = new Map(prev)
        newAssets.forEach((asset: Asset, i: number) => {
          updated.set(startIndex + i, asset)
        })
        return updated
      })
      setTotalCount(response.count)
    } catch (error) {
      console.error('Failed to load assets:', error)
    } finally {
      setIsLoading(false)
    }
  }, [assetTypeId, initialData.workspaceId, isLoading])

  // Handle cell edit
  const handleCellEdit = useCallback((asset: Asset, columnKey: string, newValue: string, rowIndex: number) => {
    console.log('Cell edited:', { asset, columnKey, newValue, rowIndex })
    // TODO: Implement actual save logic (API call)
    // For now, just update local state
    setItems(prev => {
      const updated = new Map(prev)
      const existingAsset = updated.get(rowIndex)
      if (existingAsset) {
        // Handle attribute columns (prefixed with 'attr-')
        if (columnKey.startsWith('attr-')) {
          const attrId = columnKey.replace('attr-', '')
          const attribute = attributes.find(a => a.id === attrId)
          if (attribute) {
            // Store empty/whitespace-only values as null so AttributeValueRenderer shows placeholder
            const valueToStore = newValue.trim() === '' ? null : newValue
            updated.set(rowIndex, {
              ...existingAsset,
              attributes: {
                ...existingAsset.attributes,
                [attribute.apiKey]: valueToStore
              }
            })
          }
        } else if (columnKey === 'name') {
          updated.set(rowIndex, { ...existingAsset, name: newValue })
        }
      }
      return updated
    })
  }, [attributes])

  const formatCoordinates = (assetLocation: any) => {
    if (!assetLocation?.coordinates) {
      return 'N/A'
    }

    const coords = assetLocation.coordinates
    // Location is always a Point: [lng, lat]
    if (Array.isArray(coords) && coords.length >= 2 && typeof coords[0] === 'number') {
      return `${coords[1].toFixed(6)}, ${coords[0].toFixed(6)}`
    }

    return 'N/A'
  }

  const getAttributeValue = (asset: Asset, apiKey: string) => {
    return asset?.attributes?.[apiKey] ?? null
  }

  // Helper to format attribute value as string for copying
  const formatAttributeValueForCopy = (value: any, attributeType: string): string => {
    if (value === null || value === undefined) return ''
    if (attributeType === 'json') {
      const jsonValue = value.rawJson ?? value
      return typeof jsonValue === 'string' ? jsonValue : JSON.stringify(jsonValue)
    }
    if (attributeType === 'boolean') return value ? 'Yes' : 'No'
    if (attributeType === 'date' || attributeType === 'datetime') {
      const date = new Date(value)
      return attributeType === 'datetime' ? date.toLocaleString() : date.toLocaleDateString()
    }
    if (attributeType === 'link') {
      return typeof value === 'string' ? value : value.url || ''
    }
    return String(value)
  }

  // JSON cell editor for inline editing of JSON attributes
  const JsonCellEditor = useCallback(({ value, onSave, onCancel, style, selectionBorders }: CellEditorProps<Asset>) => {
    const [editValue, setEditValue] = useState(value)
    const inputRef = useRef<HTMLTextAreaElement>(null)

    useEffect(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, [])

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        onSave(editValue)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
      e.stopPropagation()
    }

    return (
      <Box
        style={style}
        sx={{
          display: 'flex',
          alignItems: 'center',
          bgcolor: 'background.paper',
          position: 'relative',
          zIndex: 2,
          borderBottom: selectionBorders?.bottom ? 'none' : '1px solid',
          borderRight: selectionBorders?.right ? 'none' : '1px solid',
          borderRightColor: 'divider',
          borderBottomColor: 'divider',
          '&::after': selectionBorders ? {
            content: '""',
            position: 'absolute',
            top: -1,
            right: -1,
            bottom: -1,
            left: -1,
            borderTop: `${selectionBorders?.top ? 2 : 0}px solid`,
            borderRight: `${selectionBorders?.right ? 2 : 0}px solid`,
            borderBottom: `${selectionBorders?.bottom ? 2 : 0}px solid`,
            borderLeft: `${selectionBorders?.left ? 2 : 0}px solid`,
            borderColor: (theme: any) => theme.palette.mode === 'dark' ? theme.palette.secondary.main : theme.palette.primary.main,
            pointerEvents: 'none',
            zIndex: 10,
          } : undefined,
          boxSizing: 'border-box',
        }}
      >
        <TextField
          inputRef={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => onSave(editValue)}
          variant="standard"
          fullWidth
          multiline
          maxRows={4}
          size="small"
          slotProps={{
            input: {
              disableUnderline: true,
              sx: {
                px: 1,
                py: 0.5,
                fontSize: '0.75rem',
                fontFamily: 'monospace',
              }
            }
          }}
        />
      </Box>
    )
  }, [])

  // Build column definitions
  const columns: ColumnDefinition<Asset>[] = useMemo(() => {
    const baseColumns: ColumnDefinition<Asset>[] = [
      {
        key: 'name',
        header: <Box sx={{ px: 2 }}>Name</Box>,
        width: 200,
        minWidth: 150,
        editable: editingEnabled,
        render: (asset) => (
          <Box sx={{ px: 2 }}>
            {editingEnabled ? (
              asset.name
            ) : (
              <Link
                component={RouterLink}
                to={asset.id}
                underline="hover"
                state={{
                  ...location.state,
                  assetName: asset.name
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {asset.name}
              </Link>
            )}
          </Box>
        ),
        getCellValue: (asset) => asset.name,
        headerSx: { fontWeight: 600 },
      },
      {
        key: 'coordinates',
        header: <Box sx={{ px: 2 }}>Coordinates</Box>,
        width: 200,
        minWidth: 100,
        render: (asset) => (
          <Box sx={{ px: 2, fontFamily: 'monospace', fontSize: '0.75rem', color: 'text.secondary' }}>
            {formatCoordinates(asset.location)}
          </Box>
        ),
        getCellValue: (asset) => formatCoordinates(asset.location),
        headerSx: { fontWeight: 600 },
      },
    ]

    // Add dynamic attribute columns
    const attributeColumns: ColumnDefinition<Asset>[] = displayAttributes.map(attr => ({
      key: `attr-${attr.id}`,
      header: (
        <Box sx={{ px: 2, opacity: attr.isHidden ? 0.5 : 1 }}>
          {attr.name}
        </Box>
      ),
      width: 150,
      minWidth: 100,
      editable: editingEnabled && ['string', 'number', 'text', 'json'].includes(attr.attributeType),
      editor: attr.attributeType === 'json' ? JsonCellEditor : undefined,
      render: (asset) => (
        <Box sx={{ px: 2, overflow: 'hidden', opacity: attr.isHidden ? 0.5 : 1 }}>
          <AttributeValueRenderer
            attribute={attr}
            value={getAttributeValue(asset, attr.apiKey)}
            maxLines={1}
            lineNumbers="fullscreen"
            showCopyButton={false}
          />
        </Box>
      ),
      getCellValue: (asset) => formatAttributeValueForCopy(
        getAttributeValue(asset, attr.apiKey),
        attr.attributeType
      ),
      headerSx: { fontWeight: 600 },
    }))

    return [...baseColumns, ...attributeColumns]
  }, [displayAttributes, location.state, editingEnabled, JsonCellEditor])

  // Cell placeholder for loading state
  const cellPlaceholder = (
    <Box sx={{ px: 2, width: '100%' }}>
      <Skeleton variant="text" width="100%" height={20} />
    </Box>
  )

  // Header with title and controls
  const header = (
    <Box sx={{ flexShrink: 0, p: 3, pb: 2 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5" component="h2">Assets</Typography>
        <Stack direction="row" alignItems="center" spacing={2}>
          <Button
            size="small"
            variant={editingEnabled ? 'contained' : 'outlined'}
            color={editingEnabled ? 'primary' : 'inherit'}
            startIcon={editingEnabled ? <EditOffIcon /> : <EditIcon />}
            onClick={() => setEditingEnabled(!editingEnabled)}
          >
            {editingEnabled ? 'Done Editing' : 'Edit'}
          </Button>
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
            {items.size} of {totalCount}
          </Typography>
        </Stack>
      </Stack>
    </Box>
  )

  return (
    <Box sx={{
      flexGrow: 1,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      bgcolor: 'background.default',
      height: '100%',
      minHeight: 0,
      pb: 2
    }}>
      <VirtualizedGrid<Asset>
        items={items}
        totalCount={totalCount}
        getRowKey={(asset) => asset.id}
        columns={columns}
        onLoadRange={handleLoadRange}
        isLoading={isLoading}
        estimatedRowHeight={52}
        emptyMessage="No assets found"
        header={header}
        loadingPlaceholder={cellPlaceholder}
        stickyHeader
        headerHeight={48}
        onCellEdit={editingEnabled ? handleCellEdit : undefined}
      />
    </Box>
  )
}
