import React, { useEffect, useRef, useCallback, useMemo, useState, forwardRef, createContext, useContext, type ReactNode, type CSSProperties } from 'react'
import { Box, Skeleton, Typography } from '@mui/material'
import { VariableSizeGrid as Grid } from 'react-window'
import { AutoSizer } from 'react-virtualized-auto-sizer'

// Default skeleton placeholder for loading cells
const DefaultLoadingPlaceholder = (
  <Box sx={{ py: 1, px: 2 }}>
    <Skeleton variant="text" width="80%" height={20} />
  </Box>
)

// Context to pass header config to the custom outer element
interface StickyHeaderContextValue {
  columns: ColumnDefinition<any>[]
  columnWidths: number[]
  headerHeight: number
  headerBgColor: string
  totalColumnsWidth: number
  getColumnStartWidth: (columnIndex: number) => number
  onColumnResize: (columnIndex: number, newWidth: number) => void
  onColumnResizeEnd: (columnIndex: number) => void
}

const StickyHeaderContext = createContext<StickyHeaderContextValue | null>(null)

// Custom inner element that adds top padding for the sticky header
const StickyInnerElement = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { style?: CSSProperties }>(
  ({ style, children, ...rest }, ref) => {
    const ctx = useContext(StickyHeaderContext)
    const headerHeight = ctx?.headerHeight ?? 0

    return (
      <div
        ref={ref}
        style={{
          ...style,
          // Add header height to the total height so scrolling works correctly
          height: `${Number.parseFloat(String(style?.height || 0)) + headerHeight}px`,
        }}
        {...rest}
      >
        {children}
      </div>
    )
  }
)

// Custom outer element that includes a sticky header row
const StickyHeaderOuterElement = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ children, ...rest }, ref) => {
    const ctx = useContext(StickyHeaderContext)
    if (!ctx) return <div ref={ref} {...rest}>{children}</div>

    const { columns, columnWidths, headerHeight, headerBgColor, totalColumnsWidth, getColumnStartWidth, onColumnResize, onColumnResizeEnd } = ctx

    return (
      <div ref={ref} {...rest}>
        {/* Sticky header - positioned inside scroll container so it scrolls horizontally with content */}
        <Box
          sx={{
            position: 'sticky',
            top: 0,
            zIndex: 2,
            height: headerHeight,
            bgcolor: headerBgColor,
            borderBottom: '1px solid',
            borderColor: 'divider',
            minWidth: totalColumnsWidth,
          }}
        >
          <Box
            sx={{
              display: 'flex',
              position: 'relative',
              width: totalColumnsWidth,
              height: '100%',
            }}
          >
            {columns.map((col, index) => {
              const colWidth = columnWidths[index]
              const left = columnWidths.slice(0, index).reduce((sum, w) => sum + w, 0)
              const isResizable = col.resizable !== false
              const minWidth = col.minWidth ?? 50

              return (
                <Box
                  key={col.key}
                  sx={{
                    position: 'absolute',
                    left,
                    top: 0,
                    width: colWidth,
                    minWidth,
                    height: headerHeight,
                    display: 'flex',
                    alignItems: 'center',
                    fontWeight: 600,
                    overflow: 'hidden',
                    ...col.headerSx
                  }}
                >
                  <Box
                    sx={{
                      flex: 1,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {col.header}
                  </Box>
                  {isResizable && (
                    <ResizeHandle
                      onResizeStart={() => getColumnStartWidth(index)}
                      onResize={(newWidth) => onColumnResize(index, newWidth)}
                      onResizeEnd={() => onColumnResizeEnd(index)}
                    />
                  )}
                </Box>
              )
            })}
          </Box>
        </Box>
        {children}
      </div>
    )
  }
)

export interface ColumnDefinition<T> {
  /** Unique key for this column */
  key: string
  /** Header label for the column */
  header: ReactNode
  /** Width of the column in pixels */
  width: number
  /** Minimum width for resizing */
  minWidth?: number
  /** Maximum width for resizing */
  maxWidth?: number
  /** Whether this column can be resized */
  resizable?: boolean
  /** Render function for cell content */
  render: (item: T, rowIndex: number) => ReactNode
  /** Optional cell styles */
  cellSx?: Record<string, any>
  /** Optional header styles */
  headerSx?: Record<string, any>
}

export interface VirtualizedGridProps<T> {
  /** Map of row index to item for sparse data */
  items: Map<number, T>
  /** Unique key extractor for each row */
  getRowKey: (item: T, rowIndex: number) => string | number
  /** Column definitions */
  columns: ColumnDefinition<T>[]
  /** Estimated height for rows (used before measurement) */
  estimatedRowHeight?: number
  /** Called when rows at specific indices need to be loaded */
  onLoadRange?: (startIndex: number, endIndex: number) => void
  /** Total count of rows (required for virtualized scrolling) */
  totalCount: number
  /** Whether currently loading items */
  isLoading?: boolean
  /** Message to show when grid is empty */
  emptyMessage?: string
  /** Description to show when grid is empty */
  emptyDescription?: string
  /** Optional header element rendered above the grid */
  header?: ReactNode
  /** Optional footer element rendered below the grid */
  footer?: ReactNode
  /** Called when a row is clicked */
  onRowClick?: (item: T, rowIndex: number) => void
  /** Class name for the grid container */
  className?: string
  /** Placeholder element to show for rows not yet loaded */
  loadingPlaceholder?: ReactNode
  /** Whether to show a sticky header row */
  stickyHeader?: boolean
  /** Header row height */
  headerHeight?: number
  /** Row hover styles */
  rowHoverSx?: Record<string, any>
  /** Header row background color */
  headerBgColor?: string
  /** Called when column widths change due to resizing */
  onColumnResize?: (columnKey: string, newWidth: number) => void
}

interface GridHandle {
  scrollToItem: (options: { rowIndex?: number; columnIndex?: number; align?: 'auto' | 'smart' | 'center' | 'end' | 'start' }) => void
  resetAfterIndices: (options: { rowIndex: number; columnIndex?: number; shouldForceUpdate?: boolean }) => void
}

// Resize handle component
function ResizeHandle({
  onResizeStart,
  onResize,
  onResizeEnd
}: {
  onResizeStart: () => number  // Returns the starting width
  onResize: (newWidth: number) => void
  onResizeEnd: () => void
}) {
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const startX = e.clientX
    const startWidth = onResizeStart()

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX
      onResize(startWidth + delta)
    }

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      onResizeEnd()
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [onResizeStart, onResize, onResizeEnd])

  return (
    <Box
      onMouseDown={handleMouseDown}
      sx={{
        position: 'absolute',
        right: -4,  // Center the 8px handle over the 1px border
        top: 0,
        bottom: 0,
        width: 8,
        cursor: 'col-resize',
        zIndex: 3,
        '&:hover::after': {
          bgcolor: 'primary.main',
        },
        '&::after': {
          content: '""',
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          top: 0,
          bottom: 0,
          width: 2,
          bgcolor: 'divider',
          transition: 'background-color 0.15s',
        }
      }}
    />
  )
}

export default function VirtualizedGrid<T>({
  items,
  getRowKey,
  columns,
  estimatedRowHeight = 52,
  onLoadRange,
  totalCount,
  isLoading = false,
  emptyMessage = 'No items',
  emptyDescription,
  header,
  footer,
  onRowClick,
  className,
  loadingPlaceholder,
  stickyHeader = true,
  headerHeight = 48,
  rowHoverSx = { bgcolor: 'action.hover' },
  headerBgColor = 'background.paper',
  onColumnResize,
}: VirtualizedGridProps<T>) {
  const gridRef = useRef<Grid>(null)
  const outerRef = useRef<HTMLDivElement>(null)
  const rowHeights = useRef<Map<number, number>>(new Map())
  const loadingRangesRef = useRef<Set<string>>(new Set())

  // Track column widths for resizing - map column key to width for persistence across column changes
  const columnWidthsByKey = useRef<Map<string, number>>(new Map())

  // Initialize width map from columns
  const [columnWidths, setColumnWidths] = useState<number[]>(() => {
    const widths = columns.map(col => {
      // Use stored width if available, otherwise use default
      const storedWidth = columnWidthsByKey.current.get(col.key)
      return storedWidth ?? col.width
    })
    return widths
  })

  // Update column widths when columns prop changes, preserving resized widths
  useEffect(() => {
    // Create new widths array, preserving existing widths for columns that still exist
    const newWidths = columns.map(col => {
      // First check our persistent map for any previously resized width
      const storedWidth = columnWidthsByKey.current.get(col.key)
      if (storedWidth !== undefined) {
        return storedWidth
      }
      // Fall back to the column's default width
      return col.width
    })

    setColumnWidths(newWidths)
  }, [columns])

  // Use refs for values that shouldn't cause re-renders
  const itemsRef = useRef(items)
  const columnsRef = useRef(columns)
  // Initialize ref with same value as state to avoid first-render mismatch
  const columnWidthsRef = useRef<number[]>(columns.map(col => columnWidthsByKey.current.get(col.key) ?? col.width))
  const onRowClickRef = useRef(onRowClick)
  const getRowKeyRef = useRef(getRowKey)
  const onLoadRangeRef = useRef(onLoadRange)
  const placeholderContentRef = useRef(loadingPlaceholder ?? DefaultLoadingPlaceholder)
  const isLoadingRef = useRef(isLoading)
  const rowHoverSxRef = useRef(rowHoverSx)

  // Update refs on each render
  itemsRef.current = items
  columnsRef.current = columns
  columnWidthsRef.current = columnWidths
  onRowClickRef.current = onRowClick
  getRowKeyRef.current = getRowKey
  onLoadRangeRef.current = onLoadRange
  placeholderContentRef.current = loadingPlaceholder ?? DefaultLoadingPlaceholder
  isLoadingRef.current = isLoading
  rowHoverSxRef.current = rowHoverSx

  // Handle column resize - returns starting width
  const getColumnStartWidth = useCallback((columnIndex: number) => {
    return columnWidthsRef.current[columnIndex]
  }, [])

  // Handle column resize - called with the new width
  const handleColumnResize = useCallback((columnIndex: number, newWidth: number) => {
    const column = columns[columnIndex]
    if (!column) return

    const minWidth = column.minWidth ?? 50
    const maxWidth = column.maxWidth ?? 1000
    const clampedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth))

    // Store in persistent map so it survives column changes (e.g., showing/hiding columns)
    columnWidthsByKey.current.set(column.key, clampedWidth)

    // Update the ref immediately so getColumnWidth returns the new value
    const updated = [...columnWidthsRef.current]
    updated[columnIndex] = clampedWidth
    columnWidthsRef.current = updated

    setColumnWidths(updated)

    // Reset grid to recalculate column positions during resize
    gridRef.current?.resetAfterColumnIndex(columnIndex)
  }, [columns])

  const handleColumnResizeEnd = useCallback((columnIndex: number) => {
    const column = columnsRef.current[columnIndex]
    const newWidth = columnWidthsRef.current[columnIndex]
    onColumnResize?.(column.key, newWidth)
  }, [onColumnResize])

  // Get row height (measured or estimated)
  const getRowHeight = useCallback((rowIndex: number): number => {
    return rowHeights.current.get(rowIndex) ?? estimatedRowHeight
  }, [estimatedRowHeight])

  // Get column width - use ref for immediate access during resize
  const getColumnWidth = useCallback((index: number): number => {
    return columnWidthsRef.current[index] ?? columns[index]?.width ?? 100
  }, [columns])

  // Track when items were last loaded to prevent immediate re-requests
  const lastLoadTimeRef = useRef<number>(Date.now())

  // Update last load time when items change
  useEffect(() => {
    lastLoadTimeRef.current = Date.now()
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
    visibleRowStartIndex,
    visibleRowStopIndex
  }: {
    visibleRowStartIndex: number
    visibleRowStopIndex: number
    visibleColumnStartIndex: number
    visibleColumnStopIndex: number
  }) => {
    const currentOnLoadRange = onLoadRangeRef.current
    if (!currentOnLoadRange) return

    if (isLoadingRef.current) return

    const timeSinceLastLoad = Date.now() - lastLoadTimeRef.current
    if (timeSinceLastLoad < 500) return

    const currentItems = itemsRef.current

    // Find ranges of missing items within visible area (with some buffer)
    const bufferSize = 5
    const startIndex = Math.max(0, visibleRowStartIndex - bufferSize)
    const endIndex = Math.min(totalCount - 1, visibleRowStopIndex + bufferSize)

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

    if (missingStart !== null && missingEnd === null) {
      missingEnd = endIndex
    }

    if (missingStart !== null && missingEnd !== null) {
      const rangeKey = `${missingStart}-${missingEnd}`

      if (loadingRangesRef.current.has(rangeKey)) return

      pendingRangeRef.current = { start: missingStart, end: missingEnd }

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

  // Store header height in a ref for the Cell to access
  const headerHeightRef = useRef(stickyHeader ? headerHeight : 0)
  headerHeightRef.current = stickyHeader ? headerHeight : 0

  // Cell renderer
  const Cell = useCallback(({ columnIndex, rowIndex, style }: { columnIndex: number; rowIndex: number; style: CSSProperties }) => {
    const currentItems = itemsRef.current
    const currentColumns = columnsRef.current
    const currentOnRowClick = onRowClickRef.current
    const currentPlaceholder = placeholderContentRef.current
    const currentRowHoverSx = rowHoverSxRef.current

    // Offset cell position by header height
    const offsetStyle: CSSProperties = {
      ...style,
      top: typeof style.top === 'number' ? style.top + headerHeightRef.current : style.top,
    }

    const item = currentItems.get(rowIndex)
    const column = currentColumns[columnIndex]

    if (!column) return null

    const isLastColumn = columnIndex === currentColumns.length - 1

    // Show placeholder for items not yet loaded
    if (item === undefined) {
      return (
        <Box
          style={offsetStyle}
          sx={{
            display: 'flex',
            alignItems: 'center',
            bgcolor: 'background.paper',
            borderBottom: '1px solid',
            borderRight: isLastColumn ? 'none' : '1px solid',
            borderColor: 'divider',
            ...column.cellSx
          }}
        >
          {currentPlaceholder}
        </Box>
      )
    }

    const handleClick = currentOnRowClick ? () => currentOnRowClick(item, rowIndex) : undefined

    return (
      <Box
        style={offsetStyle}
        onClick={handleClick}
        sx={{
          display: 'flex',
          alignItems: 'center',
          bgcolor: 'background.paper',
          borderBottom: '1px solid',
          borderRight: isLastColumn ? 'none' : '1px solid',
          borderColor: 'divider',
          cursor: currentOnRowClick ? 'pointer' : undefined,
          '&:hover': currentOnRowClick ? currentRowHoverSx : undefined,
          ...column.cellSx
        }}
      >
        {column.render(item, rowIndex)}
      </Box>
    )
  }, [])

  // Calculate total width of all columns
  const totalColumnsWidth = useMemo(() => columnWidths.reduce((sum, w) => sum + w, 0), [columnWidths])

  // Memoize header context value to prevent unnecessary re-renders
  const headerContextValue = useMemo<StickyHeaderContextValue>(() => ({
    columns,
    columnWidths,
    headerHeight,
    headerBgColor,
    totalColumnsWidth,
    getColumnStartWidth,
    onColumnResize: handleColumnResize,
    onColumnResizeEnd: handleColumnResizeEnd,
  }), [columns, columnWidths, headerHeight, headerBgColor, totalColumnsWidth, getColumnStartWidth, handleColumnResize, handleColumnResizeEnd])

  if (totalCount === 0 && !isLoading) {
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
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1
          }}
        >
          <Typography variant="body1" color="text.secondary">
            {emptyMessage}
          </Typography>
          {emptyDescription && (
            <Typography variant="body2" color="text.secondary">
              {emptyDescription}
            </Typography>
          )}
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
      <Box sx={{
        flex: 1,
        minHeight: 0,
        position: 'relative',
        height: '100%',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        overflow: 'hidden',
      }}>
        <AutoSizer
          renderProp={({ height, width }) => {
            if (!height || !width) return null

            return (
              <StickyHeaderContext.Provider value={stickyHeader ? headerContextValue : null}>
                <Grid
                  ref={gridRef}
                  outerRef={outerRef}
                  outerElementType={stickyHeader ? StickyHeaderOuterElement : undefined}
                  innerElementType={stickyHeader ? StickyInnerElement : undefined}
                  height={height}
                  width={width}
                  columnCount={columns.length}
                  columnWidth={getColumnWidth}
                  rowCount={totalCount}
                  rowHeight={getRowHeight}
                  estimatedColumnWidth={150}
                  estimatedRowHeight={estimatedRowHeight}
                  onItemsRendered={handleItemsRendered}
                  style={{
                    overscrollBehavior: 'none'
                  }}
                >
                  {Cell}
                </Grid>
              </StickyHeaderContext.Provider>
            )
          }}
        />
      </Box>
      {footer}
    </Box>
  )
}

export type { GridHandle as VirtualizedGridHandle }
