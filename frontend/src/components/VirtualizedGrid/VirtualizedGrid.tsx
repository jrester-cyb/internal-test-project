import React, { useEffect, useRef, useCallback, useMemo, useState, type CSSProperties } from 'react'
import { Box, Skeleton, Typography, Snackbar } from '@mui/material'
import { VariableSizeGrid as Grid } from 'react-window'
import { AutoSizer } from 'react-virtualized-auto-sizer'
import type {
  ColumnDefinition,
  ColumnFilterValue,
  VirtualizedGridProps,
  CellPosition,
} from '@app/components/VirtualizedGrid/types'
import type { StickyHeaderContextValue } from '@app/components/VirtualizedGrid/StickyHeader'
import { useGridKeyboardNavigation } from '@app/components/VirtualizedGrid/useGridKeyboardNavigation'
import { CellSelectionProvider, useCellSelection } from '@app/components/VirtualizedGrid/CellSelectionContext'
import { KeyboardShortcutsProvider } from '@app/components/VirtualizedGrid/KeyboardShortcuts'
import { ColumnFilterPopover } from '@app/components/VirtualizedGrid/ColumnFilterPopover'
import {
  StickyHeaderContext,
  defaultStickyHeaderContext,
  StickyInnerElement,
  StickyHeaderOuterElement,
} from '@app/components/VirtualizedGrid/StickyHeader'
import GridCell from '@app/components/VirtualizedGrid/GridCell'


// Default skeleton placeholder for loading cells
const DefaultLoadingPlaceholder = (
  <Box sx={{ py: 1, px: 2 }}>
    <Skeleton variant="text" width="80%" height={20} />
  </Box>
)

interface VirtualizedGridInnerProps<T> extends VirtualizedGridProps<T> {
  gridContainerRef: React.RefObject<HTMLDivElement | null>
}

function VirtualizedGridInner<T>({
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
  filters,
  onFiltersChange,
  gridContainerRef,
  enableKeyboardShortcuts = true,
  onCellEdit,
  onPasteRange,
}: VirtualizedGridInnerProps<T>) {
  const gridRef = useRef<Grid>(null)
  const outerRef = useRef<HTMLDivElement>(null)
  const rowHeights = useRef<Map<number, number>>(new Map())
  const loadingRangesRef = useRef<Set<string>>(new Set())

  // Track column widths for resizing - map column key to width for persistence across column changes
  const columnWidthsByKey = useRef<Map<string, number>>(new Map())

  // Track columns to detect changes
  const prevColumnsRef = useRef<ColumnDefinition<T>[]>(columns)

  // Force re-render counter for resize updates
  const [resizeCounter, setResizeCounter] = useState(0)

  // Compute widths - recompute when columns change or resize happens
  const columnWidths = useMemo(() => {
    // resizeCounter is used to trigger recomputation on resize
    void resizeCounter
    return columns.map(col => {
      // Use stored width if available, otherwise use default
      const storedWidth = columnWidthsByKey.current.get(col.key)
      return storedWidth ?? col.width
    })
  }, [columns, resizeCounter])

  // Reset grid when columns change
  useEffect(() => {
    // Only reset if columns actually changed (not just on mount)
    if (prevColumnsRef.current !== columns) {
      prevColumnsRef.current = columns
      gridRef.current?.resetAfterColumnIndex(0)
    }
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

  // Cell selection from context
  const {
    selection,
    selectionRef,
    setSelection,
    handleCellMouseDown,
    handleHeaderMouseDown,
    copySelectionToClipboard,
    copyNotification,
    hideCopyNotification,
  } = useCellSelection()

  // Filter popover state
  const [filterAnchorEl, setFilterAnchorEl] = useState<HTMLElement | null>(null)
  const [activeFilterColumn, setActiveFilterColumn] = useState<string | null>(null)

  // Column resize state
  const [resizingColumnIndex, setResizingColumnIndex] = useState<number | null>(null)

  // Cell editing state
  const [editingCell, setEditingCell] = useState<CellPosition | null>(null)
  // Initial value when starting to edit via keyboard (to replace content)
  const [editingInitialValue, setEditingInitialValue] = useState<string | undefined>(undefined)

  const handleCellMouseDownRef = useRef(handleCellMouseDown)
  handleCellMouseDownRef.current = handleCellMouseDown

  // Cell editing handlers
  const handleCellEditSave = useCallback((rowIndex: number, columnIndex: number, newValue: string) => {
    if (!onCellEdit) return
    const item = items.get(rowIndex)
    const column = columns[columnIndex]
    if (item && column) {
      onCellEdit(item, column.key, newValue, rowIndex)
    }
    setEditingCell(null)
    setEditingInitialValue(undefined)
  }, [onCellEdit, items, columns])

  const handleCellEditCancel = useCallback(() => {
    setEditingCell(null)
    setEditingInitialValue(undefined)
  }, [])

  // Start editing on double-click or keyboard (if column is editable)
  const handleCellDoubleClick = useCallback((rowIndex: number, columnIndex: number, initialValue?: string) => {
    const column = columns[columnIndex]
    if (column?.editable && onCellEdit) {
      setEditingCell({ rowIndex, columnIndex })
      setEditingInitialValue(initialValue)
    }
  }, [columns, onCellEdit])

  // Ref for editing cell
  const editingCellRef = useRef(editingCell)
  editingCellRef.current = editingCell
  const editingInitialValueRef = useRef(editingInitialValue)
  editingInitialValueRef.current = editingInitialValue
  const handleCellEditSaveRef = useRef(handleCellEditSave)
  handleCellEditSaveRef.current = handleCellEditSave
  const handleCellEditCancelRef = useRef(handleCellEditCancel)
  handleCellEditCancelRef.current = handleCellEditCancel
  const handleCellDoubleClickRef = useRef(handleCellDoubleClick)
  handleCellDoubleClickRef.current = handleCellDoubleClick

  // Keyboard navigation (arrow keys, copy, escape)
  useGridKeyboardNavigation({
    selectionRef,
    setSelection,
    copySelectionToClipboard,
    totalCount,
    columnsRef,
    gridRef,
    enabled: enableKeyboardShortcuts,
    startEditing: handleCellDoubleClick,
    editingEnabled: !!onCellEdit,
    onPasteRange,
  })

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
    columnWidthsRef.current[columnIndex] = clampedWidth

    // Trigger re-render so header and grid stay in sync
    setResizeCounter(c => c + 1)

    // Reset grid to recalculate column positions during resize
    gridRef.current?.resetAfterColumnIndex(columnIndex)
  }, [columns])

  const handleColumnResizeStart = useCallback((columnIndex: number) => {
    setResizingColumnIndex(columnIndex)
  }, [])

  const handleColumnResizeEnd = useCallback((columnIndex: number) => {
    setResizingColumnIndex(null)
    const column = columnsRef.current[columnIndex]
    const newWidth = columnWidthsRef.current[columnIndex]
    onColumnResize?.(column.key, newWidth)
  }, [onColumnResize])

  // Filter handlers
  const handleFilterClick = useCallback((columnKey: string, anchorEl: HTMLElement) => {
    setActiveFilterColumn(columnKey)
    setFilterAnchorEl(anchorEl)
  }, [])

  const handleFilterClose = useCallback(() => {
    setFilterAnchorEl(null)
    setActiveFilterColumn(null)
  }, [])

  const handleFilterChange = useCallback((columnKey: string, value: ColumnFilterValue) => {
    if (!onFiltersChange) return
    const newFilters = { ...filters }
    if (value === null) {
      delete newFilters[columnKey]
    } else {
      newFilters[columnKey] = value
    }
    onFiltersChange(newFilters)
  }, [filters, onFiltersChange])

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

  // Selection ref for Cell to access
  const selectionRefForCell = useRef(selection)
  selectionRefForCell.current = selection
  const handleCellMouseDownRefForCell = useRef(handleCellMouseDown)
  handleCellMouseDownRefForCell.current = handleCellMouseDown

  // Force grid to re-render when selection changes
  useEffect(() => {
    if (gridRef.current) {
      gridRef.current.resetAfterIndices({ rowIndex: 0, columnIndex: 0 })
    }
  }, [selection])

  // Cell renderer - passes refs to GridCell component
  const Cell = useCallback(({ columnIndex, rowIndex, style }: { columnIndex: number; rowIndex: number; style: CSSProperties }) => {
    return (
      <GridCell
        columnIndex={columnIndex}
        rowIndex={rowIndex}
        style={style}
        itemsRef={itemsRef}
        columnsRef={columnsRef}
        selectionRef={selectionRefForCell}
        handleCellMouseDownRef={handleCellMouseDownRefForCell}
        onRowClickRef={onRowClickRef}
        placeholderContentRef={placeholderContentRef}
        headerHeight={headerHeightRef.current}
        resizingColumnIndex={resizingColumnIndex}
        editingCell={editingCellRef.current}
        editingInitialValue={editingInitialValueRef.current}
        onCellEditSave={handleCellEditSaveRef.current}
        onCellEditCancel={handleCellEditCancelRef.current}
        onCellDoubleClick={handleCellDoubleClickRef.current}
      />
    )
  }, [resizingColumnIndex, editingCell, editingInitialValue])

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
    onColumnResizeStart: handleColumnResizeStart,
    resizingColumnIndex,
    filters,
    onFilterClick: onFiltersChange ? handleFilterClick : undefined,
    selection,
    onHeaderMouseDown: handleHeaderMouseDown,
  }), [columns, columnWidths, headerHeight, headerBgColor, totalColumnsWidth, getColumnStartWidth, handleColumnResize, handleColumnResizeEnd, handleColumnResizeStart, resizingColumnIndex, filters, onFiltersChange, handleFilterClick, selection, handleHeaderMouseDown])

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
      <Box
        ref={gridContainerRef}
        sx={{
          flex: 1,
          minHeight: 0,
          position: 'relative',
          height: '100%',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          overflow: 'hidden',
        }}
      >
        <AutoSizer
          renderProp={({ height, width }) => {
            if (!height || !width) return null

            return (
              <StickyHeaderContext.Provider value={stickyHeader ? headerContextValue : defaultStickyHeaderContext}>
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
      <Snackbar
        open={copyNotification}
        autoHideDuration={2000}
        onClose={hideCopyNotification}
        message="Copied to clipboard"
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
      {activeFilterColumn && (
        <ColumnFilterPopover
          column={columns.find(c => c.key === activeFilterColumn)!}
          value={filters?.[activeFilterColumn] ?? null}
          onChange={(value: ColumnFilterValue) => handleFilterChange(activeFilterColumn, value)}
          anchorEl={filterAnchorEl}
          onClose={handleFilterClose}
        />
      )}
    </Box>
  )
}

// Wrapper component that provides contexts
export default function VirtualizedGrid<T>(props: VirtualizedGridProps<T>) {
  const itemsRef = useRef(props.items)
  const columnsRef = useRef(props.columns)
  const gridContainerRef = useRef<HTMLDivElement>(null)

  // Keep refs updated
  itemsRef.current = props.items
  columnsRef.current = props.columns

  // Custom keyboard actions passed by consumer
  const keyboardActions = props.keyboardActions ?? []

  const content = (
    <CellSelectionProvider
      totalCount={props.totalCount}
      itemsRef={itemsRef}
      columnsRef={columnsRef}
      disableClickaway={props.disableClickaway}
      gridContainerRef={gridContainerRef}
    >
      <VirtualizedGridInner {...props} gridContainerRef={gridContainerRef} />
    </CellSelectionProvider>
  )

  // Wrap with KeyboardShortcutsProvider if custom actions are provided
  if (keyboardActions.length > 0) {
    return (
      <KeyboardShortcutsProvider actions={keyboardActions}>
        {content}
      </KeyboardShortcutsProvider>
    )
  }

  return content
}
