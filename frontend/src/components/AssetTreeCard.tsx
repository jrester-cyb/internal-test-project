import { Card, CardContent, CardHeader, Box, Typography, CircularProgress } from '@mui/material'
import { Error as ErrorIcon } from '@mui/icons-material'
import RelatedAssetsTree from './RelatedAssetsTree'
import type { RelatedAssetsResponse, RelatedAsset } from '../api/assets'

interface AssetTreeCardProps {
  assetId: string
  relatedAssets: RelatedAssetsResponse | null
  loading: boolean
  error: string | null
  organizationId: string
  workspaceId: string
  currentAsset: RelatedAsset
}

export default function AssetTreeCard({
  assetId,
  relatedAssets,
  loading,
  error,
  organizationId,
  workspaceId,
  currentAsset
}: AssetTreeCardProps) {
  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardHeader title="Asset Tree" />
      <CardContent sx={{ flex: 1, overflow: 'hidden', p: 0 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <ErrorIcon sx={{ mr: 1, color: 'error.main' }} />
            <Typography color="error.main">
              {error}
            </Typography>
          </Box>
        ) : relatedAssets ? (
          <RelatedAssetsTree
            relatedAssets={relatedAssets}
            currentAsset={currentAsset}
            organizationId={organizationId}
            workspaceId={workspaceId}
          />
        ) : (
          <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Typography color="text.secondary">
              No related assets found
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  )
}