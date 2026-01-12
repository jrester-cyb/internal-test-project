import { useState } from 'react'
import { useEffect, useRef, useCallback } from 'react'
import {
  Box,
  Typography,
  Paper,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  IconButton,
  Breadcrumbs,
  Link,
  Stack,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  CircularProgress,
  LinearProgress,
} from '@mui/material'
import {
  Folder as FolderIcon,
  FolderOpen as FolderOpenIcon,
  InsertDriveFile as FileIcon,
  Image as ImageIcon,
  Description as DocumentIcon,
  VideoFile as VideoIcon,
  AudioFile as AudioIcon,
  ChevronRight as ChevronRightIcon,
  MoreVert as MoreVertIcon,
  CreateNewFolder as CreateNewFolderIcon,
  Home as HomeIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
} from '@mui/icons-material'
import { useLoaderData, useNavigate, useParams, useRevalidator } from 'react-router-dom'
import { FixedSizeList as VirtualList } from 'react-window'
import {
  fetchFileTree,
  createDirectory,
  deleteFileNode,
  renameFileNode,
  type DirectoryResponse,
  type FileNode,
} from '../api/assets'

const resourceTypeIcons: Record<string, React.ReactElement> = {
  directory: <FolderIcon />,
  file: <FileIcon />,
  image: <ImageIcon color="primary" />,
  document: <DocumentIcon color="error" />,
  video: <VideoIcon color="secondary" />,
  audio: <AudioIcon color="success" />,
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

interface VirtualListItemProps {
  index: number
  style: React.CSSProperties
  data: {
    items: FileNode[]
    onNavigate: (item: FileNode) => void
    onContextMenu: (event: React.MouseEvent, item: FileNode) => void
    setContextMenu: (menu: any) => void
    resourceTypeIcons: Record<string, React.ReactElement>
    isLastItemRef?: React.RefObject<HTMLDivElement>
  }
}

const VirtualListItem: React.FC<VirtualListItemProps> = ({ index, style, data }) => {
  const { items, onNavigate, onContextMenu, setContextMenu, resourceTypeIcons, isLastItemRef } = data
  const item = items[index]
  const isLastItem = index === items.length - 1

  if (!item) return null

  return (
    <div
      style={style}
      ref={isLastItem ? isLastItemRef : null}
    >
      <ListItem
        disablePadding
        onContextMenu={(e) => onContextMenu(e, item)}
        secondaryAction={
          <IconButton
            edge="end"
            onClick={(e) => {
              e.stopPropagation()
              setContextMenu({
                mouseX: e.clientX,
                mouseY: e.clientY,
                item,
              })
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

export default function LibraryPage() {
  const currentDir = useLoaderData() as DirectoryResponse
  const { workspaceId, directoryId } = useParams()
  const navigate = useNavigate()
  const revalidator = useRevalidator()

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number
    mouseY: number
    item: FileNode | null
  } | null>(null)

  // New folder dialog state
  const [newFolderDialog, setNewFolderDialog] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')

  // Rename dialog state
  const [renameDialog, setRenameDialog] = useState(false)
  const [renameItem, setRenameItem] = useState<FileNode | null>(null)
  const [renameName, setRenameName] = useState('')

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchData, setSearchData] = useState<DirectoryResponse | null>(null)
  const [isSearching, setIsSearching] = useState(false)

  // Infinite scroll state
  const [allChildren, setAllChildren] = useState<FileNode[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [hasNextPage, setHasNextPage] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  // Initialize and clear search when directory changes
  useEffect(() => {
    clearSearch()
    // Initialize children from loader data
    const children = currentDir.children?.results || []
    setAllChildren(children)
    setCurrentPage(1)
    setHasNextPage(!!currentDir.children?.next)
  }, [directoryId, currentDir])

  // Debounced search effect
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchData(null)
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    const timeoutId = setTimeout(async () => {
      if (!workspaceId) return

      try {
        const searchResults = await fetchFileTree(workspaceId, directoryId, searchQuery, 1, 100)
        setSearchData(searchResults)
      } catch (error) {
        console.error('Search failed:', error)
      } finally {
        setIsSearching(false)
      }
    }, 300) // 300ms debounce delay

    return () => clearTimeout(timeoutId)
  }, [searchQuery, workspaceId, directoryId])

  // Reference for virtual list container
  const lastItemRef = useRef<HTMLDivElement>(null)


  // Build breadcrumbs from ancestors
  const basePath = `/workspaces/${workspaceId}/library`
  const breadcrumbs = [
    { id: '', name: 'Library', path: basePath },
  ]
  // Add ancestors (they come in order from root to parent)
  if (currentDir.ancestors) {
    for (const ancestor of currentDir.ancestors) {
      // Skip the root directory in breadcrumbs (it's represented by "Library")
      if (ancestor.name === 'Root') continue
      breadcrumbs.push({
        id: ancestor.id,
        name: ancestor.name,
        path: `${basePath}/${ancestor.id}`,
      })
    }
  }
  // Add current directory if not root
  if (currentDir.name !== 'Root') {
    breadcrumbs.push({
      id: currentDir.id,
      name: currentDir.name,
      path: `${basePath}/${currentDir.id}`,
    })
  }

  const handleNavigate = (item: FileNode) => {
    if (!item.isDirectory) return
    navigate(`/workspaces/${workspaceId}/library/${item.id}`)
  }

  const handleBreadcrumbClick = (path: string) => {
    navigate(path)
  }

  const reloadCurrentDir = () => {
    revalidator.revalidate()
  }

  const handleContextMenu = (event: React.MouseEvent, item: FileNode) => {
    event.preventDefault()
    setContextMenu({
      mouseX: event.clientX,
      mouseY: event.clientY,
      item,
    })
  }

  const handleCloseContextMenu = () => {
    setContextMenu(null)
  }

  const handleCreateFolder = async () => {
    if (!workspaceId || !newFolderName.trim()) return
    try {
      await createDirectory(workspaceId, {
        name: newFolderName.trim(),
        parent: currentDir.id,
      })
      setNewFolderDialog(false)
      setNewFolderName('')
      reloadCurrentDir()
    } catch (error) {
      console.error('Failed to create folder:', error)
    }
  }

  const handleDelete = async () => {
    if (!workspaceId || !contextMenu?.item) return
    try {
      await deleteFileNode(workspaceId, contextMenu.item.id)
      handleCloseContextMenu()
      reloadCurrentDir()
    } catch (error) {
      console.error('Failed to delete:', error)
    }
  }

  const handleRename = async () => {
    if (!workspaceId || !renameItem || !renameName.trim()) return
    try {
      await renameFileNode(workspaceId, renameItem.id, renameName.trim())
      setRenameDialog(false)
      setRenameItem(null)
      setRenameName('')
      reloadCurrentDir()
    } catch (error) {
      console.error('Failed to rename:', error)
    }
  }

  const openRenameDialog = () => {
    if (contextMenu?.item) {
      setRenameItem(contextMenu.item)
      setRenameName(contextMenu.item.name)
      setRenameDialog(true)
    }
    handleCloseContextMenu()
  }

  // Handle search functionality
  const handleSearch = (query: string) => {
    setSearchQuery(query)
  }

  const clearSearch = () => {
    setSearchQuery('')
    setSearchData(null)
    setIsSearching(false)
  }

  // Load more items for infinite scroll
  const loadMore = async () => {
    if (!workspaceId || isLoadingMore || !hasNextPage || searchData) return

    try {
      setIsLoadingMore(true)
      const nextPage = currentPage + 1
      const moreData = await fetchFileTree(workspaceId, directoryId, undefined, nextPage, 100)

      const newChildren = moreData.children?.results || []
      setAllChildren(prev => [...prev, ...newChildren])
      setCurrentPage(nextPage)
      setHasNextPage(!!moreData.children?.next)
    } catch (error) {
      console.error('Failed to load more:', error)
    } finally {
      setIsLoadingMore(false)
    }
  }

  // Use search data if available, otherwise use accumulated children data
  const sortedChildren = searchData ? (searchData.children?.results || []) : allChildren

  return (
    <Box
      sx={{
        flexGrow: 1,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        bgcolor: 'background.default',
        p: 2,
      }}
    >
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h5" component="h2">
          Library
        </Typography>
        <Stack direction="row" spacing={2} alignItems="center">
          <TextField
            size="small"
            placeholder="Search files and folders..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            InputProps={{
              startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
              endAdornment: searchQuery && (
                <IconButton size="small" onClick={clearSearch}>
                  <ClearIcon fontSize="small" />
                </IconButton>
              ),
            }}
            sx={{ minWidth: 300 }}
          />
          <Button
            variant="outlined"
            startIcon={<CreateNewFolderIcon />}
            onClick={() => setNewFolderDialog(true)}
            disabled={isSearching || !!searchData}
          >
            New Folder
          </Button>
        </Stack>
      </Stack>

      {/* Breadcrumbs */}
      {!searchData && (
        <Paper sx={{ mb: 2 }}>
          <Box sx={{ p: 1.5 }}>
            <Breadcrumbs separator={<ChevronRightIcon fontSize="small" />}>
              {breadcrumbs.map((crumb, index) => {
                const isLast = index === breadcrumbs.length - 1
                return isLast ? (
                  <Stack key={crumb.path} direction="row" alignItems="center" spacing={0.5}>
                    {index === 0 && <HomeIcon fontSize="small" />}
                    <Typography color="text.primary" fontWeight={500}>
                      {crumb.name}
                    </Typography>
                  </Stack>
                ) : (
                  <Link
                    key={crumb.path}
                    component="button"
                    underline="hover"
                    color="inherit"
                    onClick={() => handleBreadcrumbClick(crumb.path)}
                    sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                  >
                    {index === 0 && <HomeIcon fontSize="small" />}
                    {crumb.name}
                  </Link>
                )
              })}
            </Breadcrumbs>
          </Box>
          {/* Progress bar integrated into breadcrumbs */}
          <Box sx={{ height: 4 }}>
            {(isSearching || isLoadingMore) && <LinearProgress />}
          </Box>
        </Paper>
      )}

      {/* Search Results Header */}
      {searchData && (
        <Paper sx={{ mb: 2 }}>
          <Box sx={{ p: 1.5 }}>
            <Typography variant="body1" color="text.secondary">
              Search results for "{searchQuery}" ({sortedChildren.length} items found)
            </Typography>
          </Box>
          {/* Progress bar integrated into search header */}
          <Box sx={{ height: 4 }}>
            {(isSearching || isLoadingMore) && <LinearProgress />}
          </Box>
        </Paper>
      )}


      {/* File List */}
      <Paper sx={{ flexGrow: 1, overflow: 'hidden' }}>
        {sortedChildren.length === 0 ? (
          <Box
            display="flex"
            flexDirection="column"
            justifyContent="center"
            alignItems="center"
            height="200px"
          >
            <FolderOpenIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
            <Typography color="text.secondary">
              {searchData ? 'No files found matching your search' : 'This folder is empty'}
            </Typography>
          </Box>
        ) : (
          <VirtualList
            height={600} // Fixed height for virtual scrolling
            itemCount={sortedChildren.length + (isLoadingMore ? 1 : 0)}
            itemSize={73} // Height of each list item
            itemData={{
              items: sortedChildren,
              onNavigate: handleNavigate,
              onContextMenu: handleContextMenu,
              setContextMenu,
              resourceTypeIcons,
              isLastItemRef: lastItemRef,
            }}
            onScroll={({ scrollOffset, scrollDirection }) => {
              // Trigger load more when scrolled near bottom
              const threshold = 600 * 0.8 // 80% of container height
              const maxScroll = (sortedChildren.length * 73) - 600
              if (scrollOffset > maxScroll - threshold && scrollDirection === 'forward') {
                loadMore()
              }
            }}
          >
            {({ index, style, data }) => {
              // Show loading indicator as last item
              if (index === sortedChildren.length && isLoadingMore) {
                return (
                  <div style={style}>
                    <Box display="flex" justifyContent="center" py={2}>
                      <CircularProgress size={24} />
                    </Box>
                  </div>
                )
              }
              return <VirtualListItem index={index} style={style} data={data} />
            }}
          </VirtualList>
        )}
      </Paper>

      {/* Context Menu */}
      <Menu
        open={contextMenu !== null}
        onClose={handleCloseContextMenu}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu !== null
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : undefined
        }
      >
        <MenuItem onClick={openRenameDialog}>Rename</MenuItem>
        <MenuItem onClick={handleDelete} sx={{ color: 'error.main' }}>
          Delete
        </MenuItem>
      </Menu>

      {/* New Folder Dialog */}
      <Dialog open={newFolderDialog} onClose={() => setNewFolderDialog(false)}>
        <DialogTitle>Create New Folder</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Folder Name"
            fullWidth
            variant="outlined"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewFolderDialog(false)}>Cancel</Button>
          <Button onClick={handleCreateFolder} variant="contained">
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={renameDialog} onClose={() => setRenameDialog(false)}>
        <DialogTitle>Rename</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="New Name"
            fullWidth
            variant="outlined"
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameDialog(false)}>Cancel</Button>
          <Button onClick={handleRename} variant="contained">
            Rename
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
