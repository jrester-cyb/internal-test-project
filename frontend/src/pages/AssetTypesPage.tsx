import { useState, useEffect, useCallback, useRef } from 'react'
import { useLoaderData, useNavigate, useParams } from 'react-router-dom'
import { useTheme } from '@mui/material/styles'
import {
  Box,
  TextField,
  InputAdornment,
  Button,
  Paper,
  Typography,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Slider,
  Popover,
  IconButton,
  Stack,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material'
import {
  Search as SearchIcon,
  Add as AddIcon,
  Clear as ClearIcon,
  FilterList as FilterIcon,
  Sort as SortIcon,
} from '@mui/icons-material'
import AssetTypeList from '@app/components/AssetTypeList'
import ResponsiveButton from '@app/components/ResponsiveButton'
import { fetchAssetTypes, type AssetTypesQueryParams } from '@app/api/assets'
import type { AssetType } from '@app/types'
import { useLayout } from '@app/contexts/LayoutContext'

interface LoaderData {
  results: AssetType[]
  count: number
}

const PAGE_SIZE = 50
const SEARCH_DEBOUNCE_MS = 300

type SortOption = 'name' | '-name' | 'created_at' | '-created_at'

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'name', label: 'Name (A-Z)' },
  { value: '-name', label: 'Name (Z-A)' },
  { value: '-created_at', label: 'Newest first' },
  { value: 'created_at', label: 'Oldest first' },
]

interface FilterState {
  workspaceCountRange: [number, number] | null
  assetCountRange: [number, number] | null
}

export default function AssetTypesPage() {
  const loaderData = useLoaderData() as LoaderData
  const navigate = useNavigate()
  const { organizationId, workspaceId } = useParams()
  const theme = useTheme()
  const { isMobile } = useLayout()

  // Virtualized list state - Map for sparse data
  // Initialize directly from loader data to avoid flash of empty content
  const [items, setItems] = useState<Map<number, AssetType>>(() => {
    const results = loaderData?.results || []
    const newItems = new Map<number, AssetType>()
    results.forEach((item, idx) => newItems.set(idx, item))
    return newItems
  })
  const [totalCount, setTotalCount] = useState(loaderData?.count || 0)
  const [isLoading, setIsLoading] = useState(false)
  const loadingPagesRef = useRef<Set<number>>(new Set())

  // Search state
  const [searchInput, setSearchInput] = useState('')
  const [activeSearch, setActiveSearch] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sort state
  const [sortBy, setSortBy] = useState<SortOption>('name')

  // Filter state
  const [filterAnchorEl, setFilterAnchorEl] = useState<HTMLButtonElement | null>(null)
  const [workspaceCountRange, setWorkspaceCountRange] = useState<[number, number]>([0, 100])
  const [assetCountRange, setAssetCountRange] = useState<[number, number]>([0, 100000])
  const [activeFilters, setActiveFilters] = useState<FilterState>({
    workspaceCountRange: null,
    assetCountRange: null,
  })

  const [sortAnchorEl, setSortAnchorEl] = useState<HTMLButtonElement | null>(null)
  const [searchDialogOpen, setSearchDialogOpen] = useState(false)

  const hasActiveFilters = activeFilters.workspaceCountRange !== null || activeFilters.assetCountRange !== null

  // Track the loaderData identity to detect when we get fresh data from navigation
  const loaderDataRef = useRef(loaderData)

  // Re-initialize from loader data when it changes (e.g., navigating back to this page)
  useEffect(() => {
    // Skip if loaderData hasn't actually changed (same reference)
    if (loaderDataRef.current === loaderData) return
    loaderDataRef.current = loaderData

    // Don't reset if we have active filters/search - user is in the middle of filtering
    if (activeSearch || sortBy !== 'name' || hasActiveFilters) return

    const results = loaderData?.results || []
    const count = loaderData?.count || 0

    const newItems = new Map<number, AssetType>()
    results.forEach((item, idx) => newItems.set(idx, item))
    setItems(newItems)
    setTotalCount(count)
    loadingPagesRef.current.clear()
  }, [loaderData, activeSearch, sortBy, hasActiveFilters])

  // Build query params for API calls
  const buildQueryParams = useCallback((
    offset: number,
    overrides: Partial<AssetTypesQueryParams> = {}
  ): AssetTypesQueryParams => {
    const params: AssetTypesQueryParams = {
      limit: PAGE_SIZE,
      offset,
      ordering: sortBy,
    }
    if (activeSearch) {
      params.search = activeSearch
    }
    if (activeFilters.workspaceCountRange) {
      params.workspaceCountMin = activeFilters.workspaceCountRange[0]
      params.workspaceCountMax = activeFilters.workspaceCountRange[1]
    }
    if (activeFilters.assetCountRange) {
      params.assetCountMin = activeFilters.assetCountRange[0]
      params.assetCountMax = activeFilters.assetCountRange[1]
    }
    return { ...params, ...overrides }
  }, [sortBy, activeSearch, activeFilters])

  // Fetch data with current filters/sort
  const fetchData = useCallback(async (resetItems = true) => {
    if (!organizationId) return

    setIsSearching(true)
    loadingPagesRef.current.clear()

    try {
      const data = await fetchAssetTypes(
        organizationId,
        workspaceId,
        buildQueryParams(0)
      )

      if (resetItems) {
        const newItems = new Map<number, AssetType>()
          ; (data.results || []).forEach((item, idx) => newItems.set(idx, item))
        setItems(newItems)
      }
      setTotalCount(data.count || 0)
    } catch (error) {
      console.error('Failed to fetch asset types:', error)
    } finally {
      setIsSearching(false)
    }
  }, [organizationId, workspaceId, buildQueryParams])

  // Refetch when sort or filters change
  const isFirstRender = useRef(true)
  useEffect(() => {
    // Skip initial render - loader data handles that
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    fetchData()
  }, [sortBy, activeFilters]) // eslint-disable-line react-hooks/exhaustive-deps

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
          buildQueryParams(0, { search: query || undefined })
        )

        const newItems = new Map<number, AssetType>()
          ; (data.results || []).forEach((item, idx) => newItems.set(idx, item))
        setItems(newItems)
        setTotalCount(data.count || 0)
      } catch (error) {
        console.error('Failed to search asset types:', error)
      } finally {
        setIsSearching(false)
      }
    },
    [organizationId, workspaceId, buildQueryParams]
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

  // Handle sort change
  const handleSortChange = (newSort: SortOption) => {
    setSortBy(newSort)
  }

  // Handle filter popover
  const handleFilterClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setFilterAnchorEl(event.currentTarget)
  }

  const handleFilterClose = () => {
    setFilterAnchorEl(null)
  }

  const handleApplyFilters = () => {
    setActiveFilters({
      workspaceCountRange: workspaceCountRange[0] === 0 && workspaceCountRange[1] === 100 ? null : workspaceCountRange,
      assetCountRange: assetCountRange[0] === 0 && assetCountRange[1] === 100000 ? null : assetCountRange,
    })
    handleFilterClose()
  }

  const handleClearFilters = () => {
    setWorkspaceCountRange([0, 100])
    setAssetCountRange([0, 100000])
    setActiveFilters({
      workspaceCountRange: null,
      assetCountRange: null,
    })
    handleFilterClose()
  }

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
            buildQueryParams(offset)
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
    [organizationId, workspaceId, isLoading, items, buildQueryParams]
  )

  const handleEdit = (assetType: AssetType) => {
    if (!organizationId) return
    const basePath = workspaceId
      ? `/organizations/${organizationId}/workspaces/${workspaceId}`
      : `/organizations/${organizationId}`
    navigate(`${basePath}/asset-types/${assetType.id}`, {
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

  const filterOpen = Boolean(filterAnchorEl)

  // Build active filter description
  const getActiveFilterDescription = () => {
    const parts: string[] = []
    if (activeFilters.workspaceCountRange) {
      const [min, max] = activeFilters.workspaceCountRange
      parts.push(`${min}-${max === 100 ? '100+' : max} workspaces`)
    }
    if (activeFilters.assetCountRange) {
      const [min, max] = activeFilters.assetCountRange
      parts.push(`${min}-${max === 100000 ? '100k+' : max.toLocaleString()} assets`)
    }
    return parts.join(', ')
  }

  return (
    <Box sx={{ flexGrow: 1, p: 3, display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Page header */}
      <Typography variant="h4" sx={{ mb: 2 }}>Asset Types</Typography>

      {/* Search bar, Sort, Filter, and Add button */}
      <Box sx={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', mb: 2, gap: 2, flexWrap: 'wrap' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {!isMobile && (
            <TextField
              size={isMobile ? "small" : "medium"}
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
              sx={{ width: { xs: 200, md: 300 }, flexShrink: 0 }}
            />
          )}

          {isMobile ? (
            <>
              <IconButton onClick={(e) => setSortAnchorEl(e.currentTarget)} size="small">
                <SortIcon />
              </IconButton>
              <Popover
                open={!!sortAnchorEl}
                anchorEl={sortAnchorEl}
                onClose={() => setSortAnchorEl(null)}
              >
                <Box sx={{ p: 1 }}>
                  {SORT_OPTIONS.map((option) => (
                    <MenuItem key={option.value} onClick={() => { handleSortChange(option.value); setSortAnchorEl(null) }}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Box>
              </Popover>
            </>
          ) : (
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Sort by</InputLabel>
              <Select
                value={sortBy}
                label="Sort by"
                onChange={(e) => handleSortChange(e.target.value as SortOption)}
              >
                {SORT_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          <IconButton onClick={handleFilterClick} size="small" color={hasActiveFilters ? (theme.palette.mode === 'light' ? 'primary' : 'secondary') : 'default'}>
            <FilterIcon />
          </IconButton>

          <Popover
            open={filterOpen}
            anchorEl={filterAnchorEl}
            onClose={handleFilterClose}
            anchorOrigin={{
              vertical: 'bottom',
              horizontal: 'left',
            }}
          >
            <Box sx={{ p: 2, width: 320 }}>
              <Typography variant="subtitle2" sx={{ mb: 2 }}>
                Workspace Count
              </Typography>
              <Box sx={{ px: 1 }}>
                <Slider
                  value={workspaceCountRange}
                  onChange={(_, value) => setWorkspaceCountRange(value as [number, number])}
                  valueLabelDisplay="auto"
                  min={0}
                  max={100}
                  marks={[
                    { value: 0, label: '0' },
                    { value: 50, label: '50' },
                    { value: 100, label: '100+' },
                  ]}
                />
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2, textAlign: 'center' }}>
                {workspaceCountRange[0]} - {workspaceCountRange[1] === 100 ? '100+' : workspaceCountRange[1]} workspaces
              </Typography>

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle2" sx={{ mb: 2 }}>
                Asset Count
              </Typography>
              <Box sx={{ px: 1 }}>
                <Slider
                  value={assetCountRange}
                  onChange={(_, value) => setAssetCountRange(value as [number, number])}
                  valueLabelDisplay="auto"
                  valueLabelFormat={(value) => value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}
                  min={0}
                  max={100000}
                  step={1000}
                  marks={[
                    { value: 0, label: '0' },
                    { value: 50000, label: '50k' },
                    { value: 100000, label: '100k+' },
                  ]}
                />
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2, textAlign: 'center' }}>
                {assetCountRange[0].toLocaleString()} - {assetCountRange[1] === 100000 ? '100k+' : assetCountRange[1].toLocaleString()} assets
              </Typography>

              <Stack direction="row" spacing={1} justifyContent="flex-end">
                <Button size="small" onClick={handleClearFilters}>
                  Clear
                </Button>
                <Button size="small" variant="contained" onClick={handleApplyFilters}>
                  Apply
                </Button>
              </Stack>
            </Box>
          </Popover>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ResponsiveButton
            icon={<AddIcon />}
            text="Add Asset Type"
            onClick={handleAdd}
            variant="contained"
          />
          {isMobile && (
            <IconButton onClick={() => setSearchDialogOpen(true)} size="small">
              <SearchIcon />
            </IconButton>
          )}
        </Box>

        <Dialog open={searchDialogOpen} onClose={() => setSearchDialogOpen(false)} fullWidth maxWidth="sm">
          <DialogTitle>Search Asset Types</DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              placeholder="Search asset types..."
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              fullWidth
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
                    <IconButton size="small" onClick={handleClearSearch}>
                      <ClearIcon />
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setSearchDialogOpen(false)}>Close</Button>
          </DialogActions>
        </Dialog>
      </Box>

      {/* Active filters display */}
      {hasActiveFilters && (
        <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Filtering: {getActiveFilterDescription()}
          </Typography>
          <Button size="small" onClick={handleClearFilters}>
            Clear filters
          </Button>
        </Box>
      )}

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
