import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode, type CSSProperties } from 'react'
import { Box, Skeleton, Typography, TextField } from '@mui/material'
import { VariableSizeList as List } from 'react-window'
import { AutoSizer } from 'react-virtualized-auto-sizer'

// Default skeleton placeholder for loading more items
const DefaultLoadingPlaceholder = (
  <Box sx={{ py: 1.5, px: 2 }}>
    <Skeleton variant="text" width="60%" height={24} />
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
      <Skeleton variant="rounded" width={80} height={24} />
      <Skeleton variant="text" width={100} height={16} />
    </Box>
  </Box>
)

export interface InfiniteLoaderListProps<T> {
  /** Map of index to item for sparse data */
  items: Map<number, T>
  /** Unique key extractor for each item */
  getItemKey: (item: T, index: number) => string | number
  /** Render function for each item - receives item, index, and style to apply */
  renderItem: (item: T, index: number, style: CSSProperties) => ReactNode
  /** Estimated height for items (used before measurement) */
  estimatedItemHeight?: number
  /** Called when items at specific indices need to be loaded */
  onLoadRange?: (startIndex: number, endIndex: number) => void
  /** Total count of items (required for virtualized scrolling) */
  totalCount: number
  /** Whether currently loading items */
  isLoading?: boolean
  /** Message to show when list is empty */
  emptyMessage?: string
  /** Description to show when list is empty */
  emptyDescription?: string
  /** Optional header element rendered above the list */
  header?: ReactNode
  /** Optional footer element rendered below the list (e.g., loading indicator) */
  footer?: ReactNode
  /** Called when an item is clicked */
  onItemClick?: (item: T, index: number) => void
  /** Gap between items in pixels */
  itemGap?: number
  /** Outer element type for the list */
  outerElementType?: React.ComponentType<any>
  /** Inner element type for the list */
  innerElementType?: React.ComponentType<any>
  /** Class name for the list container */
  className?: string
  /** Padding for the list container */
  padding?: number | string
  /** Placeholder element to show for items not yet loaded */
  loadingPlaceholder?: ReactNode
  /** Whether to show the search box */
  showSearch?: boolean
  /** Placeholder text for search input */
  searchPlaceholder?: string
  /** Function to extract searchable text from an item (required if showSearch is true) */
  getSearchableText?: (item: T) => string
  /** External search value (controlled mode) */
  searchValue?: string
  /** Callback when search value changes (controlled mode) */
  onSearchChange?: (value: string) => void
  /** Message to show when no items match search */
  emptySearchMessage?: string
  /**
   * Called when server-side search should be performed (debounced).
   * When provided, client-side filtering via getSearchableText is disabled.
   * The parent component should update items and totalCount based on search results.
   */
  onServerSearch?: (searchValue: string) => void
  /** Debounce delay for server-side search in milliseconds (default: 300) */
  serverSearchDebounce?: number
}

interface ListHandle {
  scrollToItem: (index: number, align?: 'auto' | 'smart' | 'center' | 'end' | 'start') => void
  resetAfterIndex: (index: number, shouldForceUpdate?: boolean) => void
}

export default function InfiniteLoaderList<T>({
  items,
  getItemKey,
  renderItem,
  estimatedItemHeight = 50,
  onLoadRange,
  totalCount,
  isLoading = false,
  emptyMessage = 'No items',
  emptyDescription,
  header,
  footer,
  onItemClick,
  itemGap = 0,
  outerElementType,
  innerElementType,
  className,
  padding = 0,
  loadingPlaceholder,
  showSearch = false,
  searchPlaceholder = 'Search...',
  getSearchableText,
  searchValue: controlledSearchValue,
  onSearchChange,
  emptySearchMessage = 'No matches found',
  onServerSearch,
  serverSearchDebounce = 300,
}: InfiniteLoaderListProps<T>) {
  const [internalSearchValue, setInternalSearchValue] = useState('')
  const listRef = useRef<List>(null)
  const outerRef = useRef<HTMLDivElement>(null)
  const itemHeights = useRef<Map<number, number>>(new Map())
  const loadingRangesRef = useRef<Set<string>>(new Set())
  const serverSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastServerSearchRef = useRef<string>('')

  // Use controlled or internal search value
  const searchValue = controlledSearchValue !== undefined ? controlledSearchValue : internalSearchValue
  const setSearchValue = onSearchChange || setInternalSearchValue

  // Determine if we're using server-side search
  const isServerSearch = !!onServerSearch

  // Debounced server-side search
  useEffect(() => {
    if (!isServerSearch) return

    // Clear any pending timer
    if (serverSearchTimerRef.current) {
      clearTimeout(serverSearchTimerRef.current)
    }

    // Skip if search value hasn't changed
    if (searchValue === lastServerSearchRef.current) return

    // Debounce the server search call
    serverSearchTimerRef.current = setTimeout(() => {
      lastServerSearchRef.current = searchValue
      onServerSearch(searchValue)
    }, serverSearchDebounce)

    return () => {
      if (serverSearchTimerRef.current) {
        clearTimeout(serverSearchTimerRef.current)
      }
    }
  }, [searchValue, isServerSearch, onServerSearch, serverSearchDebounce])

  // Track if we're waiting for server search results
  const isAwaitingServerResults = isServerSearch && searchValue !== lastServerSearchRef.current

  // Filter items based on search - creates a new map with filtered items
  // For server-side search: optimistically filter client-side while waiting for server results
  const { filteredItems, filteredTotalCount, isFiltering, isOptimisticFilter } = useMemo(() => {
    const search = searchValue.trim().toLowerCase()

    // No search query - show all items
    if (!search) {
      return { filteredItems: items, filteredTotalCount: totalCount, isFiltering: false, isOptimisticFilter: false }
    }

    // If we have getSearchableText, filter client-side (either as primary or optimistic)
    if (getSearchableText) {
      const newMap = new Map<number, T>()
      let matchCount = 0
      items.forEach((item) => {
        if (getSearchableText(item).toLowerCase().includes(search)) {
          newMap.set(matchCount, item)
          matchCount++
        }
      })
      return {
        filteredItems: newMap,
        filteredTotalCount: matchCount,
        isFiltering: true,
        // It's optimistic if server search is enabled (client filter is temporary)
        isOptimisticFilter: isServerSearch
      }
    }

    // Server search without getSearchableText - can't filter optimistically
    return { filteredItems: items, filteredTotalCount: totalCount, isFiltering: false, isOptimisticFilter: false }
  }, [items, searchValue, getSearchableText, totalCount, isServerSearch])

  // Use refs for values that shouldn't cause re-renders of ItemWrapper
  const itemsRef = useRef(filteredItems)
  const renderItemRef = useRef(renderItem)
  const onItemClickRef = useRef(onItemClick)
  const getItemKeyRef = useRef(getItemKey)
  const onLoadRangeRef = useRef(onLoadRange)
  const placeholderContentRef = useRef(loadingPlaceholder ?? DefaultLoadingPlaceholder)
  const isLoadingRef = useRef(isLoading)
  const isFilteringRef = useRef(isFiltering)
  const isServerSearchRef = useRef(isServerSearch)

  // Update refs on each render
  itemsRef.current = filteredItems
  renderItemRef.current = renderItem
  onItemClickRef.current = onItemClick
  getItemKeyRef.current = getItemKey
  onLoadRangeRef.current = onLoadRange
  placeholderContentRef.current = loadingPlaceholder ?? DefaultLoadingPlaceholder
  isLoadingRef.current = isLoading
  isFilteringRef.current = isFiltering
  isServerSearchRef.current = isServerSearch

  // Get item height (measured or estimated)
  const getItemHeight = useCallback((index: number): number => {
    return itemHeights.current.get(index) ?? estimatedItemHeight + itemGap
  }, [estimatedItemHeight, itemGap])

  // Set item height after measurement
  const setItemHeight = useCallback((index: number, height: number) => {
    const currentHeight = itemHeights.current.get(index)
    const newHeight = height + itemGap
    if (currentHeight !== newHeight) {
      itemHeights.current.set(index, newHeight)
      listRef.current?.resetAfterIndex(index)
    }
  }, [itemGap])

  // Track when items were last loaded to prevent immediate re-requests
  // Initialize to current time to prevent immediate request on mount
  const lastLoadTimeRef = useRef<number>(Date.now())

  // Update last load time when items change
  useEffect(() => {
    lastLoadTimeRef.current = Date.now()
    // Clear loading ranges after a delay
    const timer = setTimeout(() => {
      loadingRangesRef.current.clear()
    }, 300)
    return () => clearTimeout(timer)
  }, [items.size])

  // Track pending range to load (for debouncing)
  const pendingRangeRef = useRef<{ start: number; end: number } | null>(null)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced function to actually trigger the load
  const debouncedLoadRange = useMemo(() => {
    return () => {
      const currentOnLoadRange = onLoadRangeRef.current
      const pendingRange = pendingRangeRef.current

      if (!currentOnLoadRange || !pendingRange) return

      // Check cooldown again before actually firing (items may have loaded while debouncing)
      if (isLoadingRef.current) return
      if (Date.now() - lastLoadTimeRef.current < 500) return

      const rangeKey = `${pendingRange.start}-${pendingRange.end}`

      if (!loadingRangesRef.current.has(rangeKey)) {
        loadingRangesRef.current.add(rangeKey)
        currentOnLoadRange(pendingRange.start, pendingRange.end)
      }

      pendingRangeRef.current = null
    }
  }, [])

  // Handle visible range changes - load missing items (debounced)
  const handleItemsRendered = useCallback(({
    visibleStartIndex,
    visibleStopIndex
  }: {
    visibleStartIndex: number
    visibleStopIndex: number
  }) => {
    const currentOnLoadRange = onLoadRangeRef.current
    if (!currentOnLoadRange) return

    // Skip loading when filtering - we only search within already loaded items
    if (isFilteringRef.current) return

    // Skip if already loading
    if (isLoadingRef.current) return

    // Skip if items were just loaded (prevent immediate re-request after load completes)
    const timeSinceLastLoad = Date.now() - lastLoadTimeRef.current
    if (timeSinceLastLoad < 500) return

    const currentItems = itemsRef.current

    // Find ranges of missing items within visible area (with some buffer)
    const bufferSize = 5
    const startIndex = Math.max(0, visibleStartIndex - bufferSize)
    const endIndex = Math.min(totalCount - 1, visibleStopIndex + bufferSize)

    // Find first missing item in range
    let missingStart: number | null = null
    let missingEnd: number | null = null

    for (let i = startIndex; i <= endIndex; i++) {
      const hasItem = currentItems.has(i)

      if (!hasItem && missingStart === null) {
        missingStart = i
      }

      if (hasItem && missingStart !== null && missingEnd === null) {
        missingEnd = i - 1
        break
      }
    }

    // If we started a range but didn't end it, end at endIndex
    if (missingStart !== null && missingEnd === null) {
      missingEnd = endIndex
    }

    // If we found a missing range, debounce the load request
    if (missingStart !== null && missingEnd !== null) {
      const rangeKey = `${missingStart}-${missingEnd}`

      // Skip if already loading this range
      if (loadingRangesRef.current.has(rangeKey)) return

      // Update pending range
      pendingRangeRef.current = { start: missingStart, end: missingEnd }

      // Clear existing timer and set new one
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }

      debounceTimerRef.current = setTimeout(debouncedLoadRange, 150)
    }
  }, [totalCount, debouncedLoadRange])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  // Stable itemKey function that reads from refs
  const stableItemKey = useCallback((index: number): string | number => {
    const currentItems = itemsRef.current
    const currentGetItemKey = getItemKeyRef.current
    const item = currentItems.get(index)
    return item !== undefined
      ? currentGetItemKey(item, index)
      : `__placeholder_${index}__`
  }, [])

  // Item wrapper that measures height - use refs to avoid re-creating on data changes
  const ItemWrapper = useCallback(({ index, style }: { index: number; style: CSSProperties }) => {
    const currentItems = itemsRef.current
    const currentRenderItem = renderItemRef.current
    const currentOnItemClick = onItemClickRef.current
    const currentPlaceholder = placeholderContentRef.current

    const item = currentItems.get(index)

    // Show placeholder for items not yet loaded
    if (item === undefined) {
      return (
        <div style={style}>
          {currentPlaceholder}
        </div>
      )
    }

    const measureRef = (node: HTMLDivElement | null) => {
      if (node) {
        const height = node.getBoundingClientRect().height
        setItemHeight(index, height)
      }
    }

    const handleClick = currentOnItemClick ? () => currentOnItemClick(item, index) : undefined

    return (
      <div style={style}>
        <div ref={measureRef} onClick={handleClick} style={{ cursor: currentOnItemClick ? 'pointer' : undefined }}>
          {currentRenderItem(item, index, {})}
        </div>
      </div>
    )
  }, [setItemHeight])

  // Determine if we're showing search results (for empty state message)
  const hasSearchQuery = searchValue.trim().length > 0
  // Show "Searching..." if optimistic filter has no results but server search is pending
  const isSearchPending = isOptimisticFilter && filteredTotalCount === 0 && (isLoading || isAwaitingServerResults)
  const showSearchEmptyMessage = (isFiltering || (isServerSearch && hasSearchQuery)) && filteredTotalCount === 0 && !isSearchPending

  // Empty state when no items at all (or no search results)
  if (filteredTotalCount === 0 && !isLoading && !isSearchPending) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          overflow: 'hidden'
        }}
        className={className}
      >
        {header}
        {showSearch && (
          <TextField
            size="small"
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            sx={{ mb: 1, flexShrink: 0 }}
          />
        )}
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1,
            p: padding
          }}
        >
          <Typography variant="body1" color="text.secondary">
            {showSearchEmptyMessage ? emptySearchMessage : emptyMessage}
          </Typography>
          {!showSearchEmptyMessage && emptyDescription && (
            <Typography variant="body2" color="text.secondary">
              {emptyDescription}
            </Typography>
          )}
        </Box>
        {footer}
      </Box>
    )
  }

  // Show "Searching..." state when optimistic filter has no results but server is searching
  if (isSearchPending) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          overflow: 'hidden'
        }}
        className={className}
      >
        {header}
        {showSearch && (
          <TextField
            size="small"
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            sx={{ mb: 1, flexShrink: 0 }}
          />
        )}
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1,
            p: padding
          }}
        >
          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
            Searching...
          </Typography>
        </Box>
        {footer}
      </Box>
    )
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden'
      }}
      className={className}
    >
      {header}
      {showSearch && (
        <TextField
          size="small"
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          sx={{ mb: 1, flexShrink: 0 }}
        />
      )}
      <Box sx={{ flex: 1, minHeight: 0, position: 'relative', height: '100%' }}>
        <AutoSizer
          renderProp={({ height, width }) => {
            // Don't render until AutoSizer has measured the container
            if (!height || !width) return null
            return (
              <List
                ref={listRef}
                outerRef={outerRef}
                height={height}
                width={width}
                itemCount={filteredTotalCount}
                itemSize={getItemHeight}
                estimatedItemSize={estimatedItemHeight + itemGap}
                itemKey={stableItemKey}
                outerElementType={outerElementType}
                innerElementType={innerElementType}
                style={{ padding: typeof padding === 'number' ? padding : undefined }}
                onItemsRendered={handleItemsRendered}
              >
                {ItemWrapper}
              </List>
            )
          }}
        />

      </Box>
      {footer}
    </Box>
  )
}

// Export the handle type for consumers who want to control the list
export type { ListHandle as InfiniteLoaderListHandle }
