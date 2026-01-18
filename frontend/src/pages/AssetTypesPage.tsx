import { useState, useEffect, useCallback, useRef } from 'react'
import { useLoaderData, useNavigate, useParams } from 'react-router-dom'
import {
  Box,
  TextField,
  InputAdornment,
  Button,
  Paper,
  Typography,
  CircularProgress,
} from '@mui/material'
import {
  Search as SearchIcon,
  Add as AddIcon,
  Clear as ClearIcon,
} from '@mui/icons-material'
import AssetTypeList from '@app/components/AssetTypeList'
import { fetchAssetTypes } from '@app/api/assets'
import type { AssetType } from '@app/types'

interface LoaderData {
  results: AssetType[]
  count: number
}

const PAGE_SIZE = 50
const SEARCH_DEBOUNCE_MS = 300

export default function AssetTypesPage() {
  const loaderData = useLoaderData() as LoaderData
  const navigate = useNavigate()
  const { organizationId, workspaceId } = useParams()

  // Virtualized list state - Map for sparse data
  const [items, setItems] = useState<Map<number, AssetType>>(new Map())
  const [totalCount, setTotalCount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const loadingPagesRef = useRef<Set<number>>(new Set())

  // Search state
  const [searchInput, setSearchInput] = useState('')
  const [activeSearch, setActiveSearch] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Initialize from loader data
  useEffect(() => {
    if (activeSearch) return // Don't reset if we're searching

    const results = loaderData?.results || []
    const count = loaderData?.count || 0

    const newItems = new Map<number, AssetType>()
    results.forEach((item, idx) => newItems.set(idx, item))
    setItems(newItems)
    setTotalCount(count)
    loadingPagesRef.current.clear()
  }, [loaderData, activeSearch])

  // Perform server-side search
  const performSearch = useCallback(
    async (query: string) => {
      if (!organizationId) return

      setIsSearching(true)
      setActiveSearch(query)
      loadingPagesRef.current.clear()

      try {
        const data = await fetchAssetTypes(
          organizationId,
          workspaceId,
          PAGE_SIZE,
          0,
          query || undefined
        )

        const newItems = new Map<number, AssetType>()
        ;(data.results || []).forEach((item, idx) => newItems.set(idx, item))
        setItems(newItems)
        setTotalCount(data.count || 0)
      } catch (error) {
        console.error('Failed to search asset types:', error)
      } finally {
        setIsSearching(false)
      }
    },
    [organizationId, workspaceId]
  )

  // Handle search input change with debounce
  const handleSearchChange = (value: string) => {
    setSearchInput(value)

    // Clear existing debounce timer
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current)
    }

    // Debounce the search
    searchDebounceRef.current = setTimeout(() => {
      performSearch(value)
    }, SEARCH_DEBOUNCE_MS)
  }

  // Clear search
  const handleClearSearch = () => {
    setSearchInput('')
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current)
    }
    performSearch('')
  }

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current)
      }
    }
  }, [])

  // Load items for a specific range
  const handleLoadRange = useCallback(
    async (startIndex: number, endIndex: number) => {
      if (!organizationId || isLoading) return

      // Calculate which page(s) we need to fetch
      const startPage = Math.floor(startIndex / PAGE_SIZE)
      const endPage = Math.floor(endIndex / PAGE_SIZE)

      const pagesToLoad: number[] = []

      for (let page = startPage; page <= endPage; page++) {
        const offset = page * PAGE_SIZE
        const firstIndexOfPage = offset

        // Skip if already loading or loaded
        if (loadingPagesRef.current.has(page)) continue
        if (items.has(firstIndexOfPage)) continue

        loadingPagesRef.current.add(page)
        pagesToLoad.push(page)
      }

      if (pagesToLoad.length === 0) return

      setIsLoading(true)

      try {
        // Fetch all pages that need loading
        for (const page of pagesToLoad) {
          const offset = page * PAGE_SIZE

          const data = await fetchAssetTypes(
            organizationId,
            workspaceId,
            PAGE_SIZE,
            offset,
            activeSearch || undefined
          )
          const newResults = data.results || []

          setItems((prev) => {
            const updated = new Map(prev)
            newResults.forEach((item, idx) => updated.set(offset + idx, item))
            return updated
          })
        }
      } catch (error) {
        console.error('Failed to load asset types:', error)
        // Remove failed pages from loading set so they can be retried
        pagesToLoad.forEach((page) => loadingPagesRef.current.delete(page))
      } finally {
        setIsLoading(false)
      }
    },
    [organizationId, workspaceId, isLoading, items, activeSearch]
  )

  const handleEdit = (assetType: AssetType) => {
    if (!workspaceId || !organizationId) return
    navigate(`/organizations/${organizationId}/workspaces/${workspaceId}/asset-types/${assetType.id}`, {
      state: { assetTypeName: assetType.name },
    })
  }

  const handleDelete = (assetType: AssetType) => {
    // TODO: Implement delete confirmation dialog
    console.log('Delete asset type:', assetType.id)
  }

  const handleAdd = () => {
    // TODO: Implement add asset type dialog/page
    console.log('Add new asset type')
  }

  return (
    <Box sx={{ flexGrow: 1, p: 3, display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Page header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Asset Types</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleAdd}
        >
          Add Asset Type
        </Button>
      </Box>

      {/* Search bar */}
      <Box sx={{ mb: 2 }}>
        <TextField
          size="small"
          placeholder="Search asset types..."
          value={searchInput}
          onChange={(e) => handleSearchChange(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                {isSearching ? (
                  <CircularProgress size={20} />
                ) : (
                  <SearchIcon color="action" />
                )}
              </InputAdornment>
            ),
            endAdornment: searchInput && (
              <InputAdornment position="end">
                <ClearIcon
                  sx={{ cursor: 'pointer', fontSize: 20 }}
                  onClick={handleClearSearch}
                />
              </InputAdornment>
            ),
          }}
          sx={{ width: 300 }}
        />
      </Box>

      {/* Table */}
      <Paper sx={{ flexGrow: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <AssetTypeList
          items={items}
          totalCount={totalCount}
          onLoadRange={handleLoadRange}
          isLoading={isLoading || isSearching}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      </Paper>
    </Box>
  )
}
