import React, { useRef, useCallback } from 'react'
import {
  Box,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  IconButton,
  CircularProgress,
} from '@mui/material'
import {
  Folder as FolderIcon,
  InsertDriveFile as FileIcon,
  Image as ImageIcon,
  Description as DocumentIcon,
  VideoFile as VideoIcon,
  AudioFile as AudioIcon,
  MoreVert as MoreVertIcon,
} from '@mui/icons-material'
import { FixedSizeList as VirtualList } from 'react-window'
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

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

interface VirtualListItemData {
  items: (FileNode | null)[]
  onNavigate: (item: FileNode) => void
  onContextMenu: (event: React.MouseEvent, item: FileNode) => void
  onMenuClick: (event: React.MouseEvent, item: FileNode) => void
}

interface VirtualListItemProps {
  index: number
  style: React.CSSProperties
  data: VirtualListItemData
}

const VirtualListItem: React.FC<VirtualListItemProps> = ({ index, style, data }) => {
  const { items, onNavigate, onContextMenu, onMenuClick } = data
  const item = items[index]

  // Show loading placeholder for unloaded items
  if (!item) {
    return (
      <div style={style}>
        <ListItem disablePadding>
          <ListItemButton sx={{ py: 1.5 }}>
            <ListItemIcon>
              <CircularProgress size={20} />
            </ListItemIcon>
            <ListItemText primary="Loading..." secondary=" " />
          </ListItemButton>
        </ListItem>
      </div>
    )
  }

  return (
    <div style={style}>
      <ListItem
        disablePadding
        onContextMenu={(e) => onContextMenu(e, item)}
        secondaryAction={
          <IconButton
            edge="end"
            onClick={(e) => {
              e.stopPropagation()
              onMenuClick(e, item)
            }}
          >
            <MoreVertIcon />
          </IconButton>
        }
      >
        <ListItemButton
          onClick={() => item.isDirectory && onNavigate(item)}
          sx={{ py: 1.5 }}
        >
          <ListItemIcon>
            {resourceTypeIcons[item.resourceType] || <FileIcon />}
          </ListItemIcon>
          <ListItemText
            primary={item.name}
            secondary={formatDate(item.updatedAt)}
            primaryTypographyProps={{ fontWeight: item.isDirectory ? 500 : 400 }}
          />
        </ListItemButton>
      </ListItem>
    </div>
  )
}

interface FileListViewProps {
  items: (FileNode | null)[]
  totalCount?: number
  onNavigate: (item: FileNode) => void
  onContextMenu: (event: React.MouseEvent, item: FileNode) => void
  onMenuClick: (event: React.MouseEvent, item: FileNode) => void
  onItemsRendered?: (startIndex: number, stopIndex: number) => void
}

export default function FileListView({
  items,
  totalCount = 0,
  onNavigate,
  onContextMenu,
  onMenuClick,
  onItemsRendered,
}: FileListViewProps) {
  const itemSize = 73
  const listRef = useRef<VirtualList>(null)

  const itemCount = totalCount || items.length

  const handleItemsRendered = useCallback(({ visibleStartIndex, visibleStopIndex }: { visibleStartIndex: number, visibleStopIndex: number }) => {
    if (onItemsRendered) {
      onItemsRendered(visibleStartIndex, visibleStopIndex)
    }
  }, [onItemsRendered])

  const ListComponent = ({ height, width }: { height: number | undefined; width: number | undefined }) => (
    <VirtualList
      ref={listRef}
      height={height || 600}
      width={width || 800}
      itemCount={itemCount}
      itemSize={itemSize}
      itemData={{
        items,
        onNavigate,
        onContextMenu,
        onMenuClick,
      }}
      onItemsRendered={handleItemsRendered}
    >
      {({ index, style, data }) => {
        return <VirtualListItem index={index} style={style} data={data} />
      }}
    </VirtualList>
  )

  return <AutoSizer ChildComponent={ListComponent} />
}
