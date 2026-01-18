import { useCallback, useRef, type CSSProperties } from 'react'
import {
  Box,
  Link,
  IconButton,
  Skeleton,
  Typography,
} from '@mui/material'
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material'
import { Link as RouterLink } from 'react-router-dom'
import { FixedSizeList as List } from 'react-window'
import { AutoSizer } from 'react-virtualized-auto-sizer'
import type { AssetType } from '@app/types'

const ROW_HEIGHT = 52

function formatDate(dateString?: string) {
  if (!dateString) return '-'
  return new Date(dateString).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

interface RowData {
  items: Map<number, AssetType>
  onEdit?: (assetType: AssetType) => void
  onDelete?: (assetType: AssetType) => void
}

interface RowProps {
  index: number
  style: CSSProperties
  data: RowData
}

function Row({ index, style, data }: RowProps) {
  const { items, onEdit, onDelete } = data
  const assetType = items.get(index)

  if (!assetType) {
    return (
      <div style={style}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: '1fr 150px 100px',
            alignItems: 'center',
            height: '100%',
            px: 2,
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <Skeleton variant="text" width="60%" />
          <Skeleton variant="text" width="80%" />
          <Skeleton variant="text" width="50%" />
        </Box>
      </div>
    )
  }

  return (
    <div style={style}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: '1fr 150px 100px',
          alignItems: 'center',
          height: '100%',
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
    </div>
  )
}

interface AssetTypeListProps {
  /** Map of index to asset type for sparse data */
  items: Map<number, AssetType>
  /** Total count of items for virtualization */
  totalCount: number
  /** Called when items at specific indices need to be loaded */
  onLoadRange?: (startIndex: number, endIndex: number) => void
  /** Whether currently loading items */
  isLoading?: boolean
  /** Callback when edit is clicked */
  onEdit?: (assetType: AssetType) => void
  /** Callback when delete is clicked */
  onDelete?: (assetType: AssetType) => void
}

export default function AssetTypeList({
  items,
  totalCount,
  onLoadRange,
  isLoading = false,
  onEdit,
  onDelete,
}: AssetTypeListProps) {
  const listRef = useRef<List>(null)
  const loadingPagesRef = useRef<Set<number>>(new Set())
  const PAGE_SIZE = 50

  const handleItemsRendered = useCallback(
    ({ visibleStartIndex, visibleStopIndex }: { visibleStartIndex: number; visibleStopIndex: number }) => {
      if (!onLoadRange || isLoading) return

      // Add buffer around visible range
      const bufferSize = 10
      const startIndex = Math.max(0, visibleStartIndex - bufferSize)
      const endIndex = Math.min(totalCount - 1, visibleStopIndex + bufferSize)

      // Find missing items
      let missingStart: number | null = null
      let missingEnd: number | null = null

      for (let i = startIndex; i <= endIndex; i++) {
        if (!items.has(i)) {
          if (missingStart === null) missingStart = i
          missingEnd = i
        }
      }

      if (missingStart !== null && missingEnd !== null) {
        // Check if this range is already loading
        const pageStart = Math.floor(missingStart / PAGE_SIZE)
        const pageEnd = Math.floor(missingEnd / PAGE_SIZE)

        for (let page = pageStart; page <= pageEnd; page++) {
          if (!loadingPagesRef.current.has(page)) {
            loadingPagesRef.current.add(page)
            onLoadRange(missingStart, missingEnd)
            break
          }
        }
      }
    },
    [onLoadRange, isLoading, totalCount, items]
  )

  const rowData: RowData = {
    items,
    onEdit,
    onDelete,
  }

  if (totalCount === 0 && !isLoading) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: 1,
          color: 'text.secondary',
        }}
      >
        <Typography variant="body1">No asset types found</Typography>
        <Typography variant="body2">Create an asset type to get started</Typography>
      </Box>
    )
  }

  const ListComponent = ({ height, width }: { height: number | undefined; width: number | undefined }) => (
    <List
      ref={listRef}
      height={height || 400}
      width={width || 800}
      itemCount={totalCount}
      itemSize={ROW_HEIGHT}
      itemData={rowData}
      onItemsRendered={handleItemsRendered}
    >
      {Row}
    </List>
  )

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Table header */}
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

      {/* Virtualized list */}
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <AutoSizer ChildComponent={ListComponent} />
      </Box>
    </Box>
  )
}
