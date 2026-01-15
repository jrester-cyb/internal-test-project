import { useEffect, useState } from 'react'
import { Box, Typography, IconButton, CircularProgress, Drawer, Paper } from '@mui/material'
import { Close as CloseIcon, Edit as EditIcon, Delete as DeleteIcon, ContentCopy as CopyIcon } from '@mui/icons-material'
import type { Asset, AssetTypeAttribute } from '../types'
import { getAsset, fetchAssetAttributeDefinitions } from '../api/assets'
import ActionButtons from './ActionButtons'

interface AssetDetailsProps {
  asset: Asset
  workspaceId: string
  onClose: () => void
  onEdit?: (asset: Asset) => void
  onDelete?: (asset: Asset) => void
  attributes?: AssetTypeAttribute[]
}

export default function AssetDetails({ asset, workspaceId, onClose, onEdit, onDelete, attributes: propAttributes }: AssetDetailsProps) {
  const [fullAsset, setFullAsset] = useState<Asset | null>(null)
  const [attributes, setAttributes] = useState<AssetTypeAttribute[]>(propAttributes || [])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    async function loadFullAsset() {
      if (!workspaceId) return
      setLoading(true)
      try {
        const data = await getAsset(workspaceId, asset.id)
        setFullAsset(data)

        // Fetch attributes if not provided and we have an asset type
        if (!propAttributes && data.assetType) {
          const attrs = await fetchAssetAttributeDefinitions(workspaceId, data.assetType)
          setAttributes(attrs)
        }
      } catch (error) {
        console.error('Error loading asset details:', error)
      } finally {
        setLoading(false)
      }
    }
    loadFullAsset()
  }, [asset.id, workspaceId, propAttributes])

  const displayAsset = fullAsset || asset

  const handleCopyId = () => {
    navigator.clipboard.writeText(displayAsset.id)
  }

  const actions = [
    ...(onEdit ? [{
      label: 'Edit',
      icon: <EditIcon fontSize="small" />,
      onClick: () => onEdit(displayAsset),
      color: 'primary' as const,
      variant: 'outlined' as const
    }] : []),
    ...(onDelete ? [{
      label: 'Delete',
      icon: <DeleteIcon fontSize="small" />,
      onClick: () => onDelete(displayAsset),
      color: 'error' as const,
      variant: 'outlined' as const
    }] : []),
    {
      label: 'Copy ID',
      icon: <CopyIcon fontSize="small" />,
      onClick: handleCopyId,
      color: 'secondary' as const,
      variant: 'text' as const
    }
  ]

  return (
    <Drawer
      anchor="right"
      open={true}
      onClose={onClose}
      PaperProps={{ sx: { width: 400 } }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="h6" component="h2">Asset Details</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ActionButtons actions={actions} simple size="small" spacing={0.5} />
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </Box>

      <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>Name</Typography>
              <Typography variant="h6">{displayAsset.name}</Typography>
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>ID</Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{displayAsset.id}</Typography>
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>H3 Index</Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{displayAsset.h3Index}</Typography>
            </Box>

            {displayAsset.geometry && (
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>Location</Typography>
                <Typography variant="body2">
                  {displayAsset.location && Array.isArray(displayAsset.location.coordinates) && displayAsset.location.coordinates.length >= 2 ? (
                    <>
                      Lat: {displayAsset.location.coordinates[1]?.toFixed(6)}<br />
                      Lon: {displayAsset.location.coordinates[0]?.toFixed(6)}
                    </>
                  ) : displayAsset.geometry && Array.isArray(displayAsset.geometry.coordinates) && displayAsset.geometry.coordinates.length >= 2 ? (
                    <>
                      Lat: {displayAsset.geometry.coordinates[1]?.toFixed(6)}<br />
                      Lon: {displayAsset.geometry.coordinates[0]?.toFixed(6)}
                    </>
                  ) : (
                    <span>Location unavailable</span>
                  )}
                </Typography>
              </Box>
            )}

            {displayAsset.attributes && Object.keys(displayAsset.attributes).length > 0 && (
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>
                  Attributes
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {Object.entries(displayAsset.attributes).map(([key, value]) => {
                    const attr = attributes.find(a => a.apiKey === key)
                    const scope = attr?.scope || 'global'
                    const scopeLabel = scope === 'local' ? 'Local' : scope === 'override' ? 'Override' : 'Global'
                    const scopeColor = scope === 'local' ? 'info.main' : scope === 'override' ? 'warning.main' : 'text.secondary'

                    return (
                      <Paper key={key} variant="outlined" sx={{ p: 1.5 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                            {attr?.name || key}
                          </Typography>
                          <Typography variant="caption" sx={{ color: scopeColor }}>
                            {scopeLabel}
                          </Typography>
                        </Box>
                        {attr && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                            {attr.attributeType}
                          </Typography>
                        )}
                        <Typography variant="body2" color="text.secondary">
                          {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                        </Typography>
                      </Paper>
                    )
                  })}
                </Box>
              </Box>
            )}
          </>
        )}
      </Box>
    </Drawer>
  )
}
