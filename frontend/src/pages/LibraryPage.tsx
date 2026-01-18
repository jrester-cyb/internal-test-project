import { useState, useEffect, useCallback, useRef } from 'react'
import { Box } from '@mui/material'
import { useLoaderData, useNavigate, useParams, useRevalidator } from 'react-router-dom'
import {
  fetchFileTree,
  createDirectory,
  deleteFileNode,
  renameFileNode,
  type DirectoryResponse,
  type FileNode,
} from '@app/api/assets'
import FileExplorer, { type Breadcrumb } from '@app/components/FileExplorer'

export default function LibraryPage() {
  const currentDir = useLoaderData<DirectoryResponse>()
  const { organizationId, workspaceId, directoryId } = useParams()
  const navigate = useNavigate()
  const revalidator = useRevalidator()

  // Determine if we're at the organization level (no workspaceId in URL)
  const isOrgLevel = !workspaceId

  // Virtual scroll state - totalCount determines scrollbar size, items loaded on demand
  const [items, setItems] = useState<Map<number, FileNode>>(new Map())
  const [totalCount, setTotalCount] = useState(0)
  const loadingPagesRef = useRef<Set<number>>(new Set())
  const PAGE_SIZE = 100

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<FileNode[] | null>(null)
  const [isSearching, setIsSearching] = useState(false)

  // Initialize items when directory changes
  useEffect(() => {
    const children = currentDir?.children?.results || []
    const newItems = new Map<number, FileNode>()
    children.forEach((child, idx) => newItems.set(idx, child))
    setItems(newItems)
    setTotalCount(currentDir?.children?.count || 0)
    loadingPagesRef.current = new Set()
    // Clear search when navigating
    setSearchQuery('')
    setSearchResults(null)
  }, [directoryId, currentDir])

  // Debounced search effect
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null)
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    const timeoutId = setTimeout(async () => {
      if (!organizationId) return

      try {
        const results = await fetchFileTree(organizationId, workspaceId, directoryId, searchQuery, 100, 0)
        setSearchResults(results.children?.results || [])
      } catch (error) {
        console.error('Search failed:', error)
      } finally {
        setIsSearching(false)
      }
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [searchQuery, organizationId, workspaceId, directoryId])

  // Build breadcrumbs from ancestors
  const getBasePath = (itemWorkspaceId?: string) => {
    if (isOrgLevel) {
      return `/organizations/${organizationId}/library`
    }
    return `/organizations/${organizationId}/workspaces/${itemWorkspaceId || workspaceId}/library`
  }

  const basePath = getBasePath()
  const breadcrumbs: Breadcrumb[] = [
    { id: '', name: 'Library', path: basePath },
  ]

  // Track the root directory ID so we can skip it in ancestors
  const rootDirectoryId = currentDir?.ancestors?.[0]?.id

  // For org-level, if we're viewing a directory, add the workspace as a breadcrumb
  if (isOrgLevel && directoryId && currentDir?.workspace) {
    // We're inside a workspace's directory tree at org level
    // Use workspaceName from the response, or fall back to the directory name
    const workspaceName = currentDir.workspaceName || currentDir.name
    breadcrumbs.push({
      id: rootDirectoryId || currentDir.id,
      name: workspaceName,
      path: `${basePath}/${rootDirectoryId || currentDir.id}`,
    })
  }

  if (currentDir?.ancestors) {
    for (const ancestor of currentDir.ancestors) {
      // Skip if this ancestor is already in breadcrumbs (e.g., workspace root we added above)
      if (breadcrumbs.some(b => b.id === ancestor.id)) continue
      breadcrumbs.push({
        id: ancestor.id,
        name: ancestor.name,
        path: `${basePath}/${ancestor.id}`,
      })
    }
  }
  if (currentDir && !currentDir.isOrganizationRoot) {
    // Don't add current dir to breadcrumbs if it's already there
    if (!breadcrumbs.some(b => b.id === currentDir.id)) {
      // Use workspaceName for root directories, otherwise use the directory name
      const displayName = (currentDir.parent === null && currentDir.workspaceName)
        ? currentDir.workspaceName
        : currentDir.name
      breadcrumbs.push({
        id: currentDir.id,
        name: displayName,
        path: `${basePath}/${currentDir.id}`,
      })
    }
  }

  const handleNavigate = (item: FileNode) => {
    if (!item.isDirectory) return

    // Use the item's workspace if available, otherwise fall back to URL workspace
    const targetWorkspaceId = item.workspace || workspaceId

    if (isOrgLevel) {
      // At org level, navigate within org-level library route
      navigate(`/organizations/${organizationId}/library/${item.id}`)
    } else {
      // At workspace level, stay in workspace context
      navigate(`/organizations/${organizationId}/workspaces/${targetWorkspaceId}/library/${item.id}`)
    }
  }

  const handleBreadcrumbClick = (path: string) => {
    navigate(path)
  }

  const reloadCurrentDir = () => {
    revalidator.revalidate()
  }

  // Get the effective workspace ID for operations (from current dir or URL)
  const effectiveWorkspaceId = currentDir?.workspace || workspaceId

  const handleCreateFolder = async (name: string) => {
    if (!organizationId || !effectiveWorkspaceId) return
    await createDirectory(organizationId, effectiveWorkspaceId, {
      name,
      parent: currentDir.id,
    })
    reloadCurrentDir()
  }

  const handleDelete = async (item: FileNode) => {
    if (!organizationId) return
    const itemWorkspaceId = item.workspace || effectiveWorkspaceId
    if (!itemWorkspaceId) return
    await deleteFileNode(organizationId, itemWorkspaceId, item.id)
    reloadCurrentDir()
  }

  const handleRename = async (item: FileNode, newName: string) => {
    if (!organizationId) return
    const itemWorkspaceId = item.workspace || effectiveWorkspaceId
    if (!itemWorkspaceId) return
    await renameFileNode(organizationId, itemWorkspaceId, item.id, newName)
    reloadCurrentDir()
  }

  const handleSearchChange = (query: string) => {
    setSearchQuery(query)
  }

  // Load items for a specific range when they come into view
  const loadItemsInRange = useCallback(
    async (startIndex: number, stopIndex: number) => {
      if (!organizationId || searchQuery) return

      // Calculate which page(s) we need to fetch
      const startPage = Math.floor(startIndex / PAGE_SIZE)
      const endPage = Math.floor(stopIndex / PAGE_SIZE)

      const pagesToLoad: number[] = []

      for (let page = startPage; page <= endPage; page++) {
        const offset = page * PAGE_SIZE
        const firstIndexOfPage = offset

        // Skip if already loading or already loaded
        if (loadingPagesRef.current.has(page)) continue

        // Check current items state
        setItems((currentItems) => {
          if (currentItems.has(firstIndexOfPage)) {
            return currentItems // Already have data
          }
          // Mark as loading and queue for fetch
          loadingPagesRef.current.add(page)
          pagesToLoad.push(page)
          return currentItems
        })
      }

      // Fetch all pages that need loading
      for (const page of pagesToLoad) {
        const offset = page * PAGE_SIZE

        try {
          const data = await fetchFileTree(organizationId, workspaceId, directoryId, undefined, PAGE_SIZE, offset)
          const newChildren = data.children?.results || []

          setItems((prev) => {
            const updated = new Map(prev)
            newChildren.forEach((child, idx) => updated.set(offset + idx, child))
            return updated
          })
        } catch (error) {
          console.error('Failed to load items:', error)
        } finally {
          loadingPagesRef.current.delete(page)
        }
      }
    },
    [organizationId, workspaceId, directoryId, searchQuery, PAGE_SIZE]
  )

  // Convert Map to array for display, with placeholders for unloaded items
  const displayedItems = searchResults ?? Array.from({ length: totalCount }, (_, i) => items.get(i) || null)

  // Disable folder creation at the organization root (can only navigate into workspaces)
  const canCreateFolder = !currentDir?.isOrganizationRoot && !!effectiveWorkspaceId
  // Disable delete/rename at org root level
  const canModifyItems = !currentDir?.isOrganizationRoot

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
      <FileExplorer
        items={displayedItems}
        totalCount={totalCount}
        breadcrumbs={breadcrumbs}
        onBreadcrumbClick={handleBreadcrumbClick}
        onNavigate={handleNavigate}
        onCreateFolder={canCreateFolder ? handleCreateFolder : undefined}
        onDelete={canModifyItems ? handleDelete : undefined}
        onRename={canModifyItems ? handleRename : undefined}
        onSearchChange={handleSearchChange}
        searchQuery={searchQuery}
        isSearching={isSearching}
        onItemsRendered={loadItemsInRange}
      />
    </Box>
  )
}
