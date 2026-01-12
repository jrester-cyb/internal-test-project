import React, { useState } from 'react'
import {
  Box,
  Typography,
  Paper,
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
  LinearProgress,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material'
import {
  FolderOpen as FolderOpenIcon,
  CreateNewFolder as CreateNewFolderIcon,
  Home as HomeIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
  ViewList as ViewListIcon,
  ViewModule as ViewModuleIcon,
} from '@mui/icons-material'
import FileGalleryView from './FileGalleryView'
import FileListView from './FileListView'
import type { FileNode } from '../api/assets'

export interface Breadcrumb {
  id: string
  name: string
  path: string
}

export interface FileExplorerProps {
  /** Items to display (can contain nulls for unloaded items) */
  items: (FileNode | null)[]
  /** Total count of items */
  totalCount?: number
  /** Array of breadcrumb items for navigation */
  breadcrumbs: Breadcrumb[]
  /** Callback when a breadcrumb is clicked */
  onBreadcrumbClick: (path: string) => void
  /** Callback when navigating into a directory */
  onNavigate: (item: FileNode) => void
  /** Callback to create a new folder */
  onCreateFolder: (name: string) => Promise<void>
  /** Callback to delete a file/folder */
  onDelete: (item: FileNode) => Promise<void>
  /** Callback to rename a file/folder */
  onRename: (item: FileNode, newName: string) => Promise<void>
  /** Callback when search query changes */
  onSearchChange?: (query: string) => void
  /** Current search query (controlled) */
  searchQuery?: string
  /** Whether search is in progress */
  isSearching?: boolean
  /** Callback when items are rendered (for lazy loading) */
  onItemsRendered?: (startIndex: number, stopIndex: number) => void
  /** Optional callback when a file is selected (clicked) */
  onFileSelect?: (item: FileNode) => void
  /** Whether to show the search field */
  showSearch?: boolean
  /** Whether to show the new folder button */
  showNewFolder?: boolean
  /** Whether to show the view toggle */
  showViewToggle?: boolean
  /** Default view mode */
  defaultViewMode?: 'list' | 'grid'
}

export default function FileExplorer({
  items,
  totalCount = 0,
  breadcrumbs,
  onBreadcrumbClick,
  onNavigate,
  onCreateFolder,
  onDelete,
  onRename,
  onSearchChange,
  searchQuery = '',
  isSearching = false,
  onItemsRendered,
  onFileSelect,
  showSearch = true,
  showNewFolder = true,
  showViewToggle = true,
  defaultViewMode = 'list',
}: FileExplorerProps) {
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

  // View mode state
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(defaultViewMode)

  const handleNavigate = (item: FileNode) => {
    if (item.isDirectory) {
      onNavigate(item)
    } else if (onFileSelect) {
      onFileSelect(item)
    }
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
    if (!newFolderName.trim()) return
    try {
      await onCreateFolder(newFolderName.trim())
      setNewFolderDialog(false)
      setNewFolderName('')
    } catch (error) {
      console.error('Failed to create folder:', error)
    }
  }

  const handleDelete = async () => {
    if (!contextMenu?.item) return
    try {
      await onDelete(contextMenu.item)
      handleCloseContextMenu()
    } catch (error) {
      console.error('Failed to delete:', error)
    }
  }

  const handleRename = async () => {
    if (!renameItem || !renameName.trim()) return
    try {
      await onRename(renameItem, renameName.trim())
      setRenameDialog(false)
      setRenameItem(null)
      setRenameName('')
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

  const handleSearchInput = (query: string) => {
    onSearchChange?.(query)
  }

  const clearSearch = () => {
    onSearchChange?.('')
  }

  const isActiveSearch = searchQuery.length > 0

  // Filter out null items for display (when not in search mode)
  const displayItems = isActiveSearch ? items.filter((item): item is FileNode => item !== null) : items.filter((item): item is FileNode => item !== null)

  return (
    <Paper sx={{ flexGrow: 1, overflow: 'hidden', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {/* Header with Breadcrumbs / Search */}
      <Box sx={{ px: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: 1, borderColor: 'divider', minWidth: 0 }}>
        {!isActiveSearch ? (
          <Breadcrumbs
            maxItems={4}
            itemsBeforeCollapse={1}
            itemsAfterCollapse={2}
            separator="/"
            sx={{
              minWidth: 0,
              '& .MuiBreadcrumbs-ol': { alignItems: 'center', gap: 0.5, flexWrap: 'nowrap' },
              '& .MuiBreadcrumbs-li': { display: 'flex', alignItems: 'center', minWidth: 0 },
              '& .MuiBreadcrumbs-li:last-of-type': { overflow: 'hidden' },
              '& .MuiBreadcrumbs-separator': { mx: 0, fontSize: 14, color: 'text.secondary', flexShrink: 0 },
            }}
          >
            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1
              const icon = index === 0 ? <HomeIcon sx={{ fontSize: 14, flexShrink: 0 }} /> : null

              return isLast ? (
                <Box
                  key={crumb.path}
                  component="span"
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.5,
                    fontSize: 14,
                    lineHeight: '14px',
                    fontWeight: 500,
                    color: 'text.primary',
                    minWidth: 0,
                    '& > span': {
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }
                  }}
                >
                  {icon}
                  <span>{crumb.name}</span>
                </Box>
              ) : (
                <Link
                  key={crumb.path}
                  component="button"
                  underline="hover"
                  color="inherit"
                  onClick={() => onBreadcrumbClick(crumb.path)}
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.5,
                    fontSize: 14,
                    lineHeight: '14px',
                  }}
                >
                  {icon}
                  {crumb.name}
                </Link>
              )
            })}
          </Breadcrumbs>
        ) : (
          <Typography variant="body2" color="text.secondary">
            Search results for "{searchQuery}" ({items.length} items found)
          </Typography>
        )}
        <Stack direction="row" spacing={1} alignItems="center">
          {showSearch && (
            <TextField
              size="small"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => handleSearchInput(e.target.value)}
              InputProps={{
                startAdornment: <SearchIcon sx={{ mr: 0.5, color: 'text.secondary', fontSize: 18 }} />,
                endAdornment: searchQuery && (
                  <IconButton size="small" onClick={clearSearch} sx={{ p: 0.25 }}>
                    <ClearIcon fontSize="small" />
                  </IconButton>
                ),
              }}
              sx={{ width: 180, '& .MuiInputBase-root': { py: 0.25 } }}
            />
          )}
          {showViewToggle && (
            <ToggleButtonGroup
              value={viewMode}
              exclusive
              onChange={(_, newView) => newView && setViewMode(newView)}
              size="small"
            >
              <ToggleButton value="list" aria-label="list view" sx={{ py: 0.25 }}>
                <ViewListIcon fontSize="small" />
              </ToggleButton>
              <ToggleButton value="grid" aria-label="grid view" sx={{ py: 0.25 }}>
                <ViewModuleIcon fontSize="small" />
              </ToggleButton>
            </ToggleButtonGroup>
          )}
          {showNewFolder && (
            <IconButton
              size="small"
              onClick={() => setNewFolderDialog(true)}
              disabled={isSearching || isActiveSearch}
              title="New Folder"
            >
              <CreateNewFolderIcon fontSize="small" />
            </IconButton>
          )}
        </Stack>
      </Box>

      {/* Progress bar */}
      <Box sx={{ height: 4 }}>
        {isSearching && <LinearProgress />}
      </Box>

      {displayItems.length === 0 ? (
        <Box
          display="flex"
          flexDirection="column"
          justifyContent="center"
          alignItems="center"
          height="200px"
        >
          <FolderOpenIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
          <Typography color="text.secondary">
            {isActiveSearch ? 'No files found matching your search' : 'This folder is empty'}
          </Typography>
        </Box>
      ) : viewMode === 'grid' ? (
        <Box sx={{ flexGrow: 1, minHeight: 0, overflow: 'hidden' }}>
          <FileGalleryView
            items={items}
            totalCount={totalCount}
            onNavigate={handleNavigate}
            onContextMenu={handleContextMenu}
            onMenuClick={(e, item) => {
              setContextMenu({
                mouseX: e.clientX,
                mouseY: e.clientY,
                item,
              })
            }}
            onItemsRendered={onItemsRendered}
          />
        </Box>
      ) : (
        <Box sx={{ flexGrow: 1, minHeight: 0, height: '100%' }}>
          <FileListView
            items={items}
            totalCount={totalCount}
            onNavigate={handleNavigate}
            onContextMenu={handleContextMenu}
            onMenuClick={(e, item) => {
              setContextMenu({
                mouseX: e.clientX,
                mouseY: e.clientY,
                item,
              })
            }}
            onItemsRendered={onItemsRendered}
          />
        </Box>
      )}

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
    </Paper>
  )
}
