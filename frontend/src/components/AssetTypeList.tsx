import { useState } from 'react'
import {
  Box,
  Link,
  IconButton,
  Skeleton,
  Typography,
  Tooltip,
} from '@mui/material'
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Info as InfoIcon,
} from '@mui/icons-material'
import { Link as RouterLink } from 'react-router-dom'
import type { AssetType, AssetTypeSummary } from '@app/types'
import { authFetch } from '@app/api/authFetch'
import PvDrawer from './PvDrawer'
import { prefetchAssetTypeDetail } from '@app/utils/preload'
import InfiniteLoaderTable, { type TableColumn } from './InfiniteLoaderTable'
import SystemDetailsGrid, { type FieldConfig } from './SystemDetailsGrid'

function formatDate(dateString?: string) {
  if (!dateString) return '-'
  return new Date(dateString).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

const ROW_HEIGHT = 52

// Field configuration for System Details drawer
const ASSET_TYPE_SYSTEM_DETAILS_FIELDS: FieldConfig[] = [
  { key: 'apiUrl', label: 'API URL', format: 'monospace' },
  { key: 'assetCount', label: 'Asset Count', format: 'number', showLoading: true },
  { key: 'id', label: 'Asset Type ID', format: 'monospace' },
  { key: 'createdAt', label: 'Created', format: 'date' },
  { key: 'organization', label: 'Organization ID', format: 'monospace' },
  { key: 'organizationName', label: 'Organization' },
  { key: 'updatedAt', label: 'Updated', format: 'date' },
  { key: 'workspace', label: 'Workspace ID', format: 'monospace' },
  { key: 'workspaceCount', label: 'Workspace Count', format: 'number', showLoading: true },
  { key: 'workspaceName', label: 'Workspace' },
]

// Custom skeleton placeholder for loading rows
const RowLoadingPlaceholder = (
  <Box sx={{ py: 1, px: 2 }}>
    <Skeleton variant="text" width="60%" height={20} />
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
    assetType: (AssetTypeSummary & { workspaceCount?: number | null; assetCount?: number | null }) | null
  }>({ open: false, assetType: null })

  const fetchAssetTypeDetailed = async (assetTypeSummary: AssetTypeSummary): Promise<AssetType> => {
    const res = await authFetch(assetTypeSummary.apiUrl)
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

  // Define columns for the table
  const columns: TableColumn<AssetTypeSummary>[] = [
    {
      key: 'name',
      header: 'Name',
      width: 300,
      render: (assetType) => {
        const handlePreload = () => {
          prefetchAssetTypeDetail(assetType.organization, undefined, assetType.id)
        }

        return (
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
        )
      },
      resizable: true,
    },
    {
      key: 'createdAt',
      header: 'Created',
      width: 150,
      render: (assetType) => (
        <Typography variant="body2" color="text.secondary">
          {formatDate(assetType.createdAt)}
        </Typography>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      width: 120,
      headerSx: { justifyContent: 'flex-end' },
      cellSx: { justifyContent: 'flex-end' },
      render: (assetType) => (
        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
          <Tooltip title="System Details" placement="left" arrow>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation()
                handleSystemDetailsOpen(assetType)
              }}
            >
              <InfoIcon fontSize="small" />
            </IconButton>
          </Tooltip>
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
      ),
    },
  ]

  return (
    <>
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <InfiniteLoaderTable<AssetTypeSummary>
          items={items}
          totalCount={totalCount}
          getRowKey={(item) => item.id}
          columns={columns}
          onLoadRange={onLoadRange}
          isLoading={isLoading}
          estimatedRowHeight={ROW_HEIGHT}
          emptyMessage="No asset types found"
          emptyDescription="Create an asset type to get started"
          loadingPlaceholder={RowLoadingPlaceholder}
          headerHeight={44}
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
          <SystemDetailsGrid
            data={systemDetailsDrawerProps.assetType}
            fields={ASSET_TYPE_SYSTEM_DETAILS_FIELDS}
          />
        </Box>
      </PvDrawer>
    </>
  )
}
