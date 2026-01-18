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
    const children = currentDir.children?.results || []
    const newItems = new Map<number, FileNode>()
    children.forEach((child, idx) => newItems.set(idx, child))
    setItems(newItems)
    setTotalCount(currentDir.children?.count || 0)
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
      if (!organizationId || !workspaceId) return

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
  const basePath = `/organizations/${organizationId}/workspaces/${workspaceId}/library`
  const breadcrumbs: Breadcrumb[] = [
    { id: '', name: 'Library', path: basePath },
  ]
  if (currentDir.ancestors) {
    for (const ancestor of currentDir.ancestors) {
      if (ancestor.name === 'Root') continue
      breadcrumbs.push({
        id: ancestor.id,
        name: ancestor.name,
        path: `${basePath}/${ancestor.id}`,
      })
    }
  }
  if (currentDir.name !== 'Root') {
    breadcrumbs.push({
      id: currentDir.id,
      name: currentDir.name,
      path: `${basePath}/${currentDir.id}`,
    })
  }

  const handleNavigate = (item: FileNode) => {
    if (!item.isDirectory) return
    navigate(`/organizations/${organizationId}/workspaces/${workspaceId}/library/${item.id}`)
  }

  const handleBreadcrumbClick = (path: string) => {
    navigate(path)
  }

  const reloadCurrentDir = () => {
    revalidator.revalidate()
  }

  const handleCreateFolder = async (name: string) => {
    if (!organizationId || !workspaceId) return
    await createDirectory(organizationId, workspaceId, {
      name,
      parent: currentDir.id,
    })
    reloadCurrentDir()
  }

  const handleDelete = async (item: FileNode) => {
    if (!organizationId || !workspaceId) return
    await deleteFileNode(organizationId, workspaceId, item.id)
    reloadCurrentDir()
  }

  const handleRename = async (item: FileNode, newName: string) => {
    if (!organizationId || !workspaceId) return
    await renameFileNode(organizationId, workspaceId, item.id, newName)
    reloadCurrentDir()
  }

  const handleSearchChange = (query: string) => {
    setSearchQuery(query)
  }

  // Load items for a specific range when they come into view
  const loadItemsInRange = useCallback(
    async (startIndex: number, stopIndex: number) => {
      if (!organizationId || !workspaceId || searchQuery) return

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
        onCreateFolder={handleCreateFolder}
        onDelete={handleDelete}
        onRename={handleRename}
        onSearchChange={handleSearchChange}
        searchQuery={searchQuery}
        isSearching={isSearching}
        onItemsRendered={loadItemsInRange}
      />
    </Box>
  )
}
