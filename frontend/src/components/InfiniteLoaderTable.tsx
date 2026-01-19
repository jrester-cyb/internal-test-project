import React, { useEffect, useRef, useCallback, useMemo, useState, forwardRef, createContext, useContext, type ReactNode, type CSSProperties } from 'react'
import { Box, Skeleton, Typography } from '@mui/material'
import { VariableSizeList as List } from 'react-window'
import { AutoSizer } from 'react-virtualized-auto-sizer'
import { ResizeHandle } from './VirtualizedGrid/ResizeHandle'

// Context to pass header config to the custom outer element
interface StickyHeaderContextValue {
  columns: TableColumn<unknown>[]
  columnWidths: number[]
  headerHeight: number
  totalWidth: number
  resizable: boolean
  getColumnStartWidth: (columnIndex: number) => number
  onColumnResize: (columnIndex: number, newWidth: number) => void
  onColumnResizeStart: (columnIndex: number) => void
  onColumnResizeEnd: (columnIndex: number) => void
  resizingColumnIndex: number | null
}

const StickyHeaderContext = createContext<StickyHeaderContextValue | null>(null)

// Custom outer element that includes a sticky header row
const StickyHeaderOuterElement = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ children, ...rest }, ref) => {
    const ctx = useContext(StickyHeaderContext)
    if (!ctx) return <div ref={ref} {...rest}>{children}</div>

    const {
      columns,
      columnWidths,
      headerHeight,
      totalWidth,
      resizable,
      getColumnStartWidth,
      onColumnResize,
      onColumnResizeStart,
      onColumnResizeEnd,
      resizingColumnIndex,
    } = ctx

    return (
      <div ref={ref} {...rest}>
        {/* Sticky header - positioned inside scroll container so it scrolls horizontally with content */}
        <Box
          sx={{
            position: 'sticky',
            top: 0,
            zIndex: 2,
            height: headerHeight,
            bgcolor: 'background.paper',
            minWidth: totalWidth,
          }}
        >
          <Box
            sx={{
              display: 'flex',
              position: 'relative',
              width: totalWidth,
              height: '100%',
            }}
          >
            {columns.map((col, index) => {
              const colWidth = columnWidths[index]
              const isColumnResizable = resizable && col.resizable === true
              const isBeingResized = resizingColumnIndex === index

              return (
                <Box
                  key={col.key}
                  sx={{
                    position: 'relative',
                    width: colWidth,
                    minWidth: col.minWidth ?? 50,
                    flexShrink: 0,
                    height: headerHeight,
                    display: 'flex',
                    alignItems: 'center',
                    px: 2,
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    color: 'text.secondary',
                    boxSizing: 'border-box',
                    // Disable pointer events on content during resize for smoother experience
                    pointerEvents: resizingColumnIndex !== null ? 'none' : undefined,
                    // Show resize indicator on hover or while resizing
                    ...(isColumnResizable && {
                      // Always show when this column is being resized
                      ...(isBeingResized && {
                        '&::after': {
                          content: '""',
                          position: 'absolute',
                          right: 0,
                          top: '25%',
                          bottom: '25%',
                          width: 3,
                          bgcolor: (theme) => theme.palette.mode === 'dark' ? 'secondary.main' : 'primary.main',
                          borderRadius: 1,
                          opacity: 0.8,
                        },
                      }),
                      // Show on hover when not resizing
                      ...(!isBeingResized && {
                        '&:hover::after': {
                          content: '""',
                          position: 'absolute',
                          right: 0,
                          top: '25%',
                          bottom: '25%',
                          width: 3,
                          bgcolor: (theme) => theme.palette.mode === 'dark' ? 'secondary.main' : 'primary.main',
                          borderRadius: 1,
                          opacity: 0.6,
                        },
                      }),
                    }),
                    ...col.headerSx,
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
                  {isColumnResizable && (
                    <ResizeHandle
                      onResizeStart={() => {
                        onColumnResizeStart(index)
                        return getColumnStartWidth(index)
                      }}
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

// Custom inner element that adjusts height to account for sticky header
const StickyInnerElement = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { style?: CSSProperties }>(
  ({ style, children, ...rest }, ref) => {
    const ctx = useContext(StickyHeaderContext)
    const headerHeight = ctx?.headerHeight ?? 0

    // Reduce the height by the header height to prevent extra space at bottom
    const adjustedStyle = style ? {
      ...style,
      height: typeof style.height === 'number' ? style.height - headerHeight : style.height,
    } : style

    return (
      <div
        ref={ref}
        style={adjustedStyle}
        {...rest}
      >
        {children}
      </div>
    )
  }
)

// Column definition for the table
export interface TableColumn<T> {
  /** Unique key for this column */
  key: string
  /** Header label for the column */
  header: ReactNode
  /** Base width of the column in pixels (will be scaled to fill container) */
  width: number
  /** Minimum width for the column */
  minWidth?: number
  /** Maximum width for the column */
  maxWidth?: number
  /** Flex grow factor - columns share extra space proportionally (default: 1, use 0 for fixed width) */
  flex?: number
  /** Whether this column can be resized (default: true if table resizable is true) */
  resizable?: boolean
  /** Render function for cell content */
  render: (item: T, rowIndex: number) => ReactNode
  /** Optional cell styles */
  cellSx?: Record<string, unknown>
  /** Optional header styles */
  headerSx?: Record<string, unknown>
}

export interface InfiniteLoaderTableProps<T> {
  /** Map of index to item for sparse data */
  items: Map<number, T>
  /** Unique key extractor for each row */
  getRowKey: (item: T, rowIndex: number) => string | number
  /** Column definitions */
  columns: TableColumn<T>[]
  /** Estimated height for rows (used before measurement) */
  estimatedRowHeight?: number
  /** Called when rows at specific indices need to be loaded */
  onLoadRange?: (startIndex: number, endIndex: number) => void
  /** Total count of rows (required for virtualized scrolling) */
  totalCount: number
  /** Whether currently loading items */
  isLoading?: boolean
  /** Message to show when table is empty */
  emptyMessage?: string
  /** Description to show when table is empty */
  emptyDescription?: string
  /** Called when a row is clicked */
  onRowClick?: (item: T, rowIndex: number) => void
  /** Class name for the table container */
  className?: string
  /** Placeholder element to show for rows not yet loaded */
  loadingPlaceholder?: ReactNode
  /** Header row height */
  headerHeight?: number
  /** Whether columns can be resized by dragging (default: true) */
  resizable?: boolean
  /** Called when a column width changes due to resizing */
  onColumnResize?: (columnKey: string, newWidth: number) => void
}

// Default skeleton placeholder for loading rows
const DefaultLoadingPlaceholder = (
  <Box sx={{ py: 1, px: 2 }}>
    <Skeleton variant="text" width="80%" height={20} />
  </Box>
)

export default function InfiniteLoaderTable<T>({
  items,
  getRowKey,
  columns,
  estimatedRowHeight = 52,
  onLoadRange,
  totalCount,
  isLoading = false,
  emptyMessage = 'No items',
  emptyDescription,
  onRowClick,
  className,
  loadingPlaceholder,
  headerHeight = 44,
  resizable = true,
  onColumnResize: onColumnResizeCallback,
}: InfiniteLoaderTableProps<T>) {
  const listRef = useRef<List>(null)
  const outerRef = useRef<HTMLDivElement>(null)
  const rowHeights = useRef<Map<number, number>>(new Map())
  const loadingRangesRef = useRef<Set<string>>(new Set())

  // Track container width for auto-sizing columns
  const [containerWidth, setContainerWidth] = useState(0)

  // Track column widths for resizing - map column key to width
  const columnWidthsByKey = useRef<Map<string, number>>(new Map())

  // Force re-render counter for resize updates
  const [resizeCounter, setResizeCounter] = useState(0)

  // Track which column is being resized
  const [resizingColumnIndex, setResizingColumnIndex] = useState<number | null>(null)

  // Calculate column widths - distribute extra space proportionally to flex columns
  const columnWidths = useMemo(() => {
    // resizeCounter is used to trigger recomputation on resize
    void resizeCounter

    // Get base widths (from stored or default) and track which have been manually resized
    const baseWidths: number[] = []
    const isManuallyResized: boolean[] = []

    columns.forEach(col => {
      const storedWidth = columnWidthsByKey.current.get(col.key)
      baseWidths.push(storedWidth ?? col.width)
      isManuallyResized.push(storedWidth !== undefined)
    })

    const totalBaseWidth = baseWidths.reduce((sum, w) => sum + w, 0)

    // If container is wider than total base width, distribute extra space to non-resized flex columns
    if (containerWidth > totalBaseWidth) {
      const extraSpace = containerWidth - totalBaseWidth

      // Calculate total flex value only for columns that haven't been manually resized
      const totalFlex = columns.reduce((sum, col, i) => {
        if (isManuallyResized[i]) return sum
        const flex = col.flex ?? 1
        if (flex === 0) return sum
        return sum + flex
      }, 0)

      if (totalFlex > 0) {
        // Distribute extra space proportionally to non-resized flex columns
        return baseWidths.map((baseWidth, i) => {
          if (isManuallyResized[i]) return baseWidth
          const flex = columns[i].flex ?? 1
          if (flex === 0) return baseWidth
          const extraForColumn = (flex / totalFlex) * extraSpace
          return baseWidth + extraForColumn
        })
      }
    }

    return baseWidths
  }, [columns, containerWidth, resizeCounter])

  // Calculate total table width (use container width if columns fill it)
  const totalWidth = useMemo(() => {
    const colTotal = columnWidths.reduce((sum, w) => sum + w, 0)
    return Math.max(colTotal, containerWidth)
  }, [columnWidths, containerWidth])

  // Use refs for values that shouldn't cause re-renders
  const itemsRef = useRef(items)
  const columnsRef = useRef(columns)
  const columnWidthsRef = useRef(columnWidths)
  const onRowClickRef = useRef(onRowClick)
  const getRowKeyRef = useRef(getRowKey)
  const onLoadRangeRef = useRef(onLoadRange)
  const placeholderContentRef = useRef(loadingPlaceholder ?? DefaultLoadingPlaceholder)
  const isLoadingRef = useRef(isLoading)

  // Update refs on each render
  itemsRef.current = items
  columnsRef.current = columns
  columnWidthsRef.current = columnWidths
  onRowClickRef.current = onRowClick
  getRowKeyRef.current = getRowKey
  onLoadRangeRef.current = onLoadRange
  placeholderContentRef.current = loadingPlaceholder ?? DefaultLoadingPlaceholder
  isLoadingRef.current = isLoading

  // Column resize handlers
  const getColumnStartWidth = useCallback((columnIndex: number) => {
    return columnWidthsRef.current[columnIndex]
  }, [])

  const handleColumnResize = useCallback((columnIndex: number, newWidth: number) => {
    const column = columns[columnIndex]
    if (!column) return

    const minWidth = column.minWidth ?? 50
    const maxWidth = column.maxWidth ?? 2000
    const clampedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth))

    // Store in persistent map
    columnWidthsByKey.current.set(column.key, clampedWidth)

    // Update the ref immediately
    columnWidthsRef.current[columnIndex] = clampedWidth

    // Trigger re-render
    setResizeCounter(c => c + 1)
  }, [columns])

  const handleColumnResizeStart = useCallback((columnIndex: number) => {
    setResizingColumnIndex(columnIndex)
  }, [])

  const handleColumnResizeEnd = useCallback((columnIndex: number) => {
    setResizingColumnIndex(null)
    const column = columns[columnIndex]
    const newWidth = columnWidthsRef.current[columnIndex]
    onColumnResizeCallback?.(column.key, newWidth)
  }, [columns, onColumnResizeCallback])

  // Memoize header context value
  const headerContextValue = useMemo<StickyHeaderContextValue>(() => ({
    columns: columns as TableColumn<unknown>[],
    columnWidths,
    headerHeight,
    totalWidth,
    resizable,
    getColumnStartWidth,
    onColumnResize: handleColumnResize,
    onColumnResizeStart: handleColumnResizeStart,
    onColumnResizeEnd: handleColumnResizeEnd,
    resizingColumnIndex,
  }), [columns, columnWidths, headerHeight, totalWidth, resizable, getColumnStartWidth, handleColumnResize, handleColumnResizeStart, handleColumnResizeEnd, resizingColumnIndex])

  // Get row height (measured or estimated)
  const getRowHeight = useCallback((rowIndex: number): number => {
    return rowHeights.current.get(rowIndex) ?? estimatedRowHeight
  }, [estimatedRowHeight])

  // Set row height after measurement
  const setRowHeight = useCallback((rowIndex: number, height: number) => {
    const currentHeight = rowHeights.current.get(rowIndex)
    if (currentHeight !== height) {
      rowHeights.current.set(rowIndex, height)
      listRef.current?.resetAfterIndex(rowIndex)
    }
  }, [])

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
    visibleStartIndex,
    visibleStopIndex
  }: {
    visibleStartIndex: number
    visibleStopIndex: number
  }) => {
    const currentOnLoadRange = onLoadRangeRef.current
    if (!currentOnLoadRange) return

    if (isLoadingRef.current) return

    const timeSinceLastLoad = Date.now() - lastLoadTimeRef.current
    if (timeSinceLastLoad < 500) return

    const currentItems = itemsRef.current

    const bufferSize = 5
    const startIndex = Math.max(0, visibleStartIndex - bufferSize)
    const endIndex = Math.min(totalCount - 1, visibleStopIndex + bufferSize)

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

  // Stable itemKey function
  const stableItemKey = useCallback((index: number): string | number => {
    const currentItems = itemsRef.current
    const currentGetRowKey = getRowKeyRef.current
    const item = currentItems.get(index)
    return item !== undefined
      ? currentGetRowKey(item, index)
      : `__placeholder_${index}__`
  }, [])

  // Row renderer
  const RowWrapper = useCallback(({ index, style }: { index: number; style: CSSProperties }) => {
    const currentItems = itemsRef.current
    const currentColumns = columnsRef.current
    const currentWidths = columnWidthsRef.current
    const currentOnRowClick = onRowClickRef.current
    const currentPlaceholder = placeholderContentRef.current

    const item = currentItems.get(index)

    // Offset the row position by the header height to account for the sticky header
    const adjustedStyle = {
      ...style,
      top: typeof style.top === 'number' ? style.top + headerHeight : style.top,
    }

    // Show placeholder for items not yet loaded
    if (item === undefined) {
      return (
        <div style={adjustedStyle}>
          {currentPlaceholder}
        </div>
      )
    }

    const measureRef = (node: HTMLDivElement | null) => {
      if (node) {
        const height = node.getBoundingClientRect().height
        setRowHeight(index, height)
      }
    }

    const handleClick = currentOnRowClick ? () => currentOnRowClick(item, index) : undefined

    return (
      <div style={adjustedStyle}>
        <Box
          ref={measureRef}
          onClick={handleClick}
          sx={{
            display: 'flex',
            cursor: currentOnRowClick ? 'pointer' : undefined,
            minWidth: currentWidths.reduce((sum, w) => sum + w, 0),
          }}
        >
          {currentColumns.map((column, colIndex) => (
            <Box
              key={column.key}
              sx={{
                width: currentWidths[colIndex],
                minWidth: currentWidths[colIndex],
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                px: 2,
                py: 1,
                borderBottom: '1px solid',
                borderColor: 'divider',
                overflow: 'hidden',
                ...column.cellSx,
              }}
            >
              {column.render(item, index)}
            </Box>
          ))}
        </Box>
      </div>
    )
  }, [setRowHeight, headerHeight])


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
      </Box>
    )
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        bgcolor: 'background.paper',
      }}
      className={className}
    >
      {/* Virtualized list with sticky header inside scroll container */}
      <Box sx={{ flex: 1, minHeight: 0, position: 'relative', height: '100%', overflow: 'hidden' }}>
        <AutoSizer
          onResize={({ width }) => {
            if (width && width !== containerWidth) {
              setContainerWidth(width)
            }
          }}
          renderProp={({ height, width }) => {
            if (!height || !width) return null
            return (
              <StickyHeaderContext.Provider value={headerContextValue}>
                <List
                  ref={listRef}
                  outerRef={outerRef}
                  outerElementType={StickyHeaderOuterElement}
                  innerElementType={StickyInnerElement}
                  height={height}
                  width={width}
                  itemCount={totalCount}
                  itemSize={getRowHeight}
                  estimatedItemSize={estimatedRowHeight}
                  itemKey={stableItemKey}
                  onItemsRendered={handleItemsRendered}
                  style={{
                    overflowX: 'auto',
                    overflowY: 'scroll',
                  }}
                >
                  {RowWrapper}
                </List>
              </StickyHeaderContext.Provider>
            )
          }}
        />
      </Box>
    </Box>
  )
}
