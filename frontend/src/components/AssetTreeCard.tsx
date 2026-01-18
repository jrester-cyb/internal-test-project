import { Box, Typography, CircularProgress } from '@mui/material'
import { Error as ErrorIcon } from '@mui/icons-material'
import CollapsibleCard from '@app/components/CollapsibleCard'
import RelatedAssetsTree from '@app/components/RelatedAssetsTree'
import type { RelatedAssetsResponse, RelatedAsset } from '@app/api/assets'

interface AssetTreeCardProps {
  assetId: string
  relatedAssets: RelatedAssetsResponse | null
  loading: boolean
  error: string | null
  organizationId: string
  workspaceId?: string
  currentAsset: RelatedAsset
  defaultOpen?: boolean
  open?: boolean
  onToggle?: () => void
  headerAction?: React.ReactNode
}

export default function AssetTreeCard({
  assetId,
  relatedAssets,
  loading,
  error,
  organizationId,
  workspaceId,
  currentAsset,
  defaultOpen = true,
  open,
  onToggle,
  headerAction
}: AssetTreeCardProps) {
  return (
    <CollapsibleCard
      title="Asset Tree"
      defaultOpen={defaultOpen}
      open={open}
      onToggle={onToggle}
      headerAction={headerAction}
      contentSx={{ height: 400 }}
      disableContentPadding
    >
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
    </CollapsibleCard>
  )
}
