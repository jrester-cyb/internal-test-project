import { useState } from 'react'
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
} from '@mui/icons-material'
import { useLoaderData, useNavigate, useParams, useRevalidator } from 'react-router-dom'
import {
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

  const children = currentDir.children?.results || []

  return (
    <Box
      sx={{
        flexGrow: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        bgcolor: 'background.default',
        p: 3,
      }}
    >
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h5" component="h2">
          Library
        </Typography>
        <Button
          variant="outlined"
          startIcon={<CreateNewFolderIcon />}
          onClick={() => setNewFolderDialog(true)}
        >
          New Folder
        </Button>
      </Stack>

      {/* Breadcrumbs */}
      <Paper sx={{ p: 1.5, mb: 2 }}>
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
      </Paper>

      {/* File List */}
      <Paper sx={{ flexGrow: 1, overflow: 'auto' }}>
        {children.length === 0 ? (
          <Box
            display="flex"
            flexDirection="column"
            justifyContent="center"
            alignItems="center"
            height="200px"
          >
            <FolderOpenIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
            <Typography color="text.secondary">This folder is empty</Typography>
          </Box>
        ) : (
          <List disablePadding>
            {children.map((item) => (
              <ListItem
                key={item.id}
                disablePadding
                onContextMenu={(e) => handleContextMenu(e, item)}
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
                  onClick={() => item.isDirectory && handleNavigate(item)}
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
            ))}
          </List>
        )}
      </Paper>

      {/* Pagination info */}
      {currentDir.children && currentDir.children.count > 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Showing {children.length} of {currentDir.children.count} items
        </Typography>
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
    </Box>
  )
}
