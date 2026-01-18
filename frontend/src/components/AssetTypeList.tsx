import { useState, type CSSProperties } from 'react'
import {
  Box,
  Link,
  IconButton,
  Skeleton,
  Typography,
  CircularProgress,
} from '@mui/material'
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Info as InfoIcon,
} from '@mui/icons-material'
import { Link as RouterLink } from 'react-router-dom'
import type { AssetType, AssetTypeSummary } from '@app/types'
import PvDrawer from './PvDrawer'
import TruncatedText from './TruncatedText'
import { prefetchAssetTypeDetail } from '@app/utils/preload'
import VirtualizedList from './VirtualizedList'

function formatDate(dateString?: string) {
  if (!dateString) return '-'
  return new Date(dateString).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

const ROW_HEIGHT = 52

// Custom skeleton placeholder for table rows
const TableRowPlaceholder = (
  <Box
    sx={{
      display: 'grid',
      gridTemplateColumns: '1fr 150px 100px',
      alignItems: 'center',
      height: ROW_HEIGHT,
      px: 2,
      borderBottom: 1,
      borderColor: 'divider',
    }}
  >
    <Skeleton variant="text" width="60%" />
    <Skeleton variant="text" width="80%" />
    <Skeleton variant="text" width="50%" />
  </Box>
)

interface AssetTypeListProps {
  /** Map of index to asset type for sparse data */
  items: Map<number, AssetTypeSummary>
  /** Total count of items for virtualization */
  totalCount: number
  /** Called when items at specific indices need to be loaded */
  onLoadRange?: (startIndex: number, endIndex: number) => void
  /** Whether currently loading items */
  isLoading?: boolean
  /** Callback when edit is clicked */
  onEdit?: (assetType: AssetTypeSummary) => void
  /** Callback when delete is clicked */
  onDelete?: (assetType: AssetTypeSummary) => void
}

export default function AssetTypeList({
  items,
  totalCount,
  onLoadRange,
  isLoading = false,
  onEdit,
  onDelete,
}: AssetTypeListProps) {
  const [systemDetailsDrawerProps, setSystemDetailsDrawerProps] = useState<{
    open: boolean
    assetType: (AssetTypeSummary & { workspaceCount?: number }) | null
  }>({ open: false, assetType: null })

  const fetchAssetTypeDetailed = async (assetTypeSummary: AssetTypeSummary): Promise<AssetType> => {
    const res = await fetch(assetTypeSummary.apiUrl, { credentials: 'include' })
    const data = await res.json()
    return data as AssetType
  }

  const handleSystemDetailsOpen = async (assetTypeSummary: AssetTypeSummary) => {
    setSystemDetailsDrawerProps({ open: true, assetType: assetTypeSummary })
    if (assetTypeSummary.apiUrl) {
      const detailedAssetType = await fetchAssetTypeDetailed(assetTypeSummary)
      setSystemDetailsDrawerProps({ open: true, assetType: detailedAssetType })
    }
  }

  const renderItem = (assetType: AssetTypeSummary, _index: number, _style: CSSProperties) => {
    const handlePreload = () => {
      prefetchAssetTypeDetail(assetType.organization, undefined, assetType.id)
    }

    return (
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: '1fr 150px 100px',
          alignItems: 'center',
          height: ROW_HEIGHT,
          px: 2,
          borderBottom: 1,
          borderColor: 'divider',
          '&:hover': {
            bgcolor: 'action.hover',
          },
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Link
            onMouseEnter={handlePreload}
            onFocus={handlePreload}
            component={RouterLink}
            to={`${assetType.id}`}
            underline="hover"
            state={{ breadcrumb: assetType.name }}
            sx={{
              fontWeight: 500,
              display: 'block',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {assetType.name}
          </Link>
          {assetType.description && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                display: 'block',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {assetType.description}
            </Typography>
          )}
        </Box>
        <Typography variant="body2" color="text.secondary">
          {formatDate(assetType.createdAt)}
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
          <IconButton
            size="small"
            onClick={() => handleSystemDetailsOpen(assetType)}
            title="System Details"
          >
            <InfoIcon fontSize="small" />
          </IconButton>
          {onEdit && (
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation()
                onEdit(assetType)
              }}
              title="Edit"
            >
              <EditIcon fontSize="small" />
            </IconButton>
          )}
          {onDelete && (
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation()
                onDelete(assetType)
              }}
              title="Delete"
              color="error"
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          )}
        </Box>
      </Box>
    )
  }

  const tableHeader = (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: '1fr 150px 100px',
        alignItems: 'center',
        px: 2,
        py: 1.5,
        borderBottom: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Typography variant="subtitle2" fontWeight={600}>
        Name
      </Typography>
      <Typography variant="subtitle2" fontWeight={600}>
        Created
      </Typography>
      <Typography variant="subtitle2" fontWeight={600} sx={{ textAlign: 'right' }}>
        Actions
      </Typography>
    </Box>
  )

  return (
    <>
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <VirtualizedList<AssetTypeSummary>
          items={items}
          totalCount={totalCount}
          getItemKey={(item) => item.id}
          renderItem={renderItem}
          onLoadRange={onLoadRange}
          isLoading={isLoading}
          estimatedItemHeight={ROW_HEIGHT}
          header={tableHeader}
          emptyMessage="No asset types found"
          emptyDescription="Create an asset type to get started"
          loadingPlaceholder={TableRowPlaceholder}
        />
      </Box>

      {/* System Details Drawer */}
      <PvDrawer
        key="AssetTypeSystemDetailsDrawer"
        open={systemDetailsDrawerProps.open}
        onClose={() => setSystemDetailsDrawerProps((prev) => ({ ...prev, open: false }))}
        resizable={false}
        width={600}
        overlay
      >
        <Box sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            System Details
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gap: 2,
              rowGap: 1.5,
            }}
          >
            {systemDetailsDrawerProps.assetType?.apiUrl && (
              <>
                <Typography variant="body2" color="text.secondary">
                  API URL
                </Typography>
                <TruncatedText
                  maxLines={2}
                  title="API URL"
                  sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
                >
                  {systemDetailsDrawerProps.assetType.apiUrl}
                </TruncatedText>
              </>
            )}

            <Typography variant="body2" color="text.secondary">
              Asset Type ID
            </Typography>
            <TruncatedText
              maxLines={1}
              title="Asset ID"
              sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
            >
              {systemDetailsDrawerProps.assetType?.id}
            </TruncatedText>

            {systemDetailsDrawerProps.assetType?.createdAt && (
              <>
                <Typography variant="body2" color="text.secondary">
                  Created
                </Typography>
                <Typography variant="body2">
                  {new Date(systemDetailsDrawerProps.assetType.createdAt).toLocaleString()}
                </Typography>
              </>
            )}

            {systemDetailsDrawerProps.assetType?.organization && (
              <>
                <Typography variant="body2" color="text.secondary">
                  Organization ID
                </Typography>
                <TruncatedText
                  maxLines={1}
                  title="Organization ID"
                  sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
                >
                  {systemDetailsDrawerProps.assetType?.organization}
                </TruncatedText>
              </>
            )}

            {systemDetailsDrawerProps.assetType?.updatedAt && (
              <>
                <Typography variant="body2" color="text.secondary">
                  Updated
                </Typography>
                <Typography variant="body2">
                  {new Date(systemDetailsDrawerProps.assetType.updatedAt).toLocaleString()}
                </Typography>
              </>
            )}

            <>
              <Typography variant="body2" color="text.secondary">
                Workspace Count
              </Typography>
              {systemDetailsDrawerProps.assetType?.workspaceCount !== undefined ? (
                <Typography variant="body2">
                  {systemDetailsDrawerProps.assetType?.workspaceCount}
                </Typography>
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CircularProgress size={16} />
                  <Typography variant="body2">Loading...</Typography>
                </Box>
              )}
            </>
          </Box>
        </Box>
      </PvDrawer>
    </>
  )
}
