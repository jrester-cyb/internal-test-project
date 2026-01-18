import React, { useRef, useCallback, useMemo } from 'react'
import { Box, Typography, IconButton, Skeleton } from '@mui/material'
import {
  Folder as FolderIcon,
  InsertDriveFile as FileIcon,
  Image as ImageIcon,
  Description as DocumentIcon,
  VideoFile as VideoIcon,
  AudioFile as AudioIcon,
  MoreVert as MoreVertIcon,
} from '@mui/icons-material'
import { FixedSizeGrid as Grid } from 'react-window'
import { AutoSizer } from 'react-virtualized-auto-sizer'
import type { FileNode } from '@app/api/assets'

const resourceTypeIcons: Record<string, React.ReactElement> = {
  directory: <FolderIcon />,
  file: <FileIcon />,
  image: <ImageIcon />,
  document: <DocumentIcon />,
  video: <VideoIcon />,
  audio: <AudioIcon />,
}

function splitFilename(filename: string): { name: string; extension: string } {
  const lastDotIndex = filename.lastIndexOf('.')
  if (lastDotIndex === -1 || lastDotIndex === 0) {
    return { name: filename, extension: '' }
  }
  return {
    name: filename.substring(0, lastDotIndex),
    extension: filename.substring(lastDotIndex),
  }
}

// Constants for grid layout
const ITEM_WIDTH = 160
const ITEM_HEIGHT = 176
const GAP = 16

interface GridItemData {
  items: (FileNode | null)[]
  columnCount: number
  onNavigate: (item: FileNode) => void
  onContextMenu: (event: React.MouseEvent, item: FileNode) => void
  onMenuClick: (event: React.MouseEvent, item: FileNode) => void
  onPrefetchDirectory?: (item: FileNode) => void
}

interface GridCellProps {
  columnIndex: number
  rowIndex: number
  style: React.CSSProperties
  data: GridItemData
}

const GridCell: React.FC<GridCellProps> = ({ columnIndex, rowIndex, style, data }) => {
  const { items, columnCount, onNavigate, onContextMenu, onMenuClick, onPrefetchDirectory } = data
  const index = rowIndex * columnCount + columnIndex
  const item = items[index]

  // Out of bounds
  if (index >= items.length) {
    return null
  }

  const { name, extension } = item ? splitFilename(item.name) : { name: '', extension: '' }

  return (
    <div style={{ ...style, padding: GAP / 2 }}>
      <Box
        onContextMenu={(e) => item && onContextMenu(e, item)}
        onClick={() => item?.isDirectory && onNavigate(item)}
        onMouseEnter={() => item?.isDirectory && onPrefetchDirectory?.(item)}
        sx={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          p: 2,
          borderRadius: 1,
          cursor: item?.isDirectory ? 'pointer' : 'default',
          position: 'relative',
          '&:hover': {
            bgcolor: item ? 'action.hover' : 'transparent',
          },
        }}
      >
        {!item ? (
          <>
            <Skeleton variant="circular" width={64} height={64} sx={{ mb: 1.5 }} />
            <Skeleton variant="text" width="80%" />
          </>
        ) : (
          <>
            <Box sx={{ mb: 1.5 }}>
              {React.cloneElement(
                resourceTypeIcons[item.resourceType] || <FileIcon />,
                { sx: { fontSize: 64, color: 'action.active' } }
              )}
            </Box>
            <Typography
              variant="body2"
              title={item.name}
              fontWeight={item.isDirectory ? 500 : 400}
              sx={{
                textAlign: 'center',
                width: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {name}{extension}
            </Typography>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation()
                onMenuClick(e, item)
              }}
              sx={{ position: 'absolute', top: 4, right: 4 }}
            >
              <MoreVertIcon fontSize="small" />
            </IconButton>
          </>
        )}
      </Box>
    </div>
  )
}

interface FileGalleryViewProps {
  items: (FileNode | null)[]
  totalCount?: number
  onNavigate: (item: FileNode) => void
  onContextMenu: (event: React.MouseEvent, item: FileNode) => void
  onMenuClick: (event: React.MouseEvent, item: FileNode) => void
  onItemsRendered?: (startIndex: number, stopIndex: number) => void
  onPrefetchDirectory?: (item: FileNode) => void
}

export default function FileGalleryView({
  items,
  totalCount = 0,
  onNavigate,
  onContextMenu,
  onMenuClick,
  onItemsRendered,
  onPrefetchDirectory,
}: FileGalleryViewProps) {
  const gridRef = useRef<Grid>(null)

  const itemCount = totalCount || items.length

  const handleItemsRendered = useCallback(({
    visibleRowStartIndex,
    visibleRowStopIndex,
    visibleColumnStartIndex,
    visibleColumnStopIndex,
  }: {
    visibleRowStartIndex: number
    visibleRowStopIndex: number
    visibleColumnStartIndex: number
    visibleColumnStopIndex: number
  }) => {
    if (!onItemsRendered) return
    // We need the column count to calculate indices, but we'll get it from itemData
    // For now, approximate using visible columns
    const columnCount = visibleColumnStopIndex - visibleColumnStartIndex + 1
    const startIndex = visibleRowStartIndex * columnCount
    const stopIndex = (visibleRowStopIndex + 1) * columnCount - 1
    onItemsRendered(startIndex, Math.min(stopIndex, itemCount - 1))
  }, [onItemsRendered, itemCount])

  const GridComponent = useMemo(() => {
    return ({ height, width }: { height: number | undefined; width: number | undefined }) => {
      const effectiveWidth = width || 800
      const effectiveHeight = height || 600

      // Calculate columns based on available width
      const columnCount = Math.max(1, Math.floor((effectiveWidth + GAP) / (ITEM_WIDTH + GAP)))
      const rowCount = Math.ceil(itemCount / columnCount)

      const itemData: GridItemData = {
        items,
        columnCount,
        onNavigate,
        onContextMenu,
        onMenuClick,
        onPrefetchDirectory,
      }

      return (
        <Grid
          ref={gridRef}
          height={effectiveHeight}
          width={effectiveWidth}
          columnCount={columnCount}
          columnWidth={ITEM_WIDTH + GAP}
          rowCount={rowCount}
          rowHeight={ITEM_HEIGHT + GAP}
          itemData={itemData}
          onItemsRendered={({ visibleRowStartIndex, visibleRowStopIndex }) => {
            if (!onItemsRendered) return
            const startIndex = visibleRowStartIndex * columnCount
            const stopIndex = Math.min((visibleRowStopIndex + 1) * columnCount - 1, itemCount - 1)
            onItemsRendered(startIndex, stopIndex)
          }}
          style={{ overflowX: 'hidden' }}
        >
          {GridCell}
        </Grid>
      )
    }
  }, [items, itemCount, onNavigate, onContextMenu, onMenuClick, onItemsRendered, onPrefetchDirectory])

  return (
    <Box sx={{ height: '100%', width: '100%' }}>
      <AutoSizer ChildComponent={GridComponent} />
    </Box>
  )
}
