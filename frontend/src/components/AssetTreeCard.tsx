import { Card, CardContent, CardHeader, Box, Typography, CircularProgress, Tooltip } from '@mui/material'
import { Error as ErrorIcon, DragHandle as DragHandleIcon } from '@mui/icons-material'
import RelatedAssetsTree from '@app/components/RelatedAssetsTree'
import type { RelatedAssetsResponse, RelatedAsset } from '@app/api/assets'

interface AssetTreeCardProps {
  assetId: string
  relatedAssets: RelatedAssetsResponse | null
  loading: boolean
  error: string | null
  organizationId: string
  workspaceId: string
  currentAsset: RelatedAsset
  dragHandleProps?: {
    attributes: any
    listeners: any
  }
}

export default function AssetTreeCard({
  assetId,
  relatedAssets,
  loading,
  error,
  organizationId,
  workspaceId,
  currentAsset,
  dragHandleProps
}: AssetTreeCardProps) {
  return (
    <Card sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <CardHeader
        title="Asset Tree"
        action={dragHandleProps && (
          <Tooltip title="Drag to reorder cards">
            <Box
              {...dragHandleProps.attributes}
              {...dragHandleProps.listeners}
              sx={{
                cursor: 'grab',
                '&:active': { cursor: 'grabbing' },
                p: 0.5,
                borderRadius: 1,
                '&:hover': { bgcolor: 'action.hover' }
              }}
            >
              <DragHandleIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
            </Box>
          </Tooltip>
        )}
      />
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