import React, { useEffect, useRef, useCallback, useMemo, useState, forwardRef, createContext, useContext, type ReactNode, type CSSProperties } from 'react'
import { Box, Skeleton, Typography, Snackbar, IconButton, Popover, TextField, MenuItem, Select, FormControl, InputLabel, Checkbox, ListItemText, Chip, InputAdornment, Badge } from '@mui/material'
import { FilterList as FilterIcon, Clear as ClearIcon } from '@mui/icons-material'
import { VariableSizeGrid as Grid } from 'react-window'
import { AutoSizer } from 'react-virtualized-auto-sizer'

// Cell selection types
interface CellPosition {
  rowIndex: number
  columnIndex: number
}

interface SelectionRange {
  start: CellPosition
  end: CellPosition
}

// Helper to check if a cell is within a selection range
function isCellInRange(cell: CellPosition, range: SelectionRange): boolean {
  const minRow = Math.min(range.start.rowIndex, range.end.rowIndex)
  const maxRow = Math.max(range.start.rowIndex, range.end.rowIndex)
  const minCol = Math.min(range.start.columnIndex, range.end.columnIndex)
  const maxCol = Math.max(range.start.columnIndex, range.end.columnIndex)

  return cell.rowIndex >= minRow && cell.rowIndex <= maxRow &&
    cell.columnIndex >= minCol && cell.columnIndex <= maxCol
}

// Helper to get which borders should be shown for a selected cell (Excel-style outline)
interface SelectionBorders {
  top: boolean
  right: boolean
  bottom: boolean
  left: boolean
}

function getSelectionBorders(cell: CellPosition, selection: SelectionRange | null): SelectionBorders | null {
  if (!selection) return null
  if (!isCellInRange(cell, selection)) return null

  const minRow = Math.min(selection.start.rowIndex, selection.end.rowIndex)
  const maxRow = Math.max(selection.start.rowIndex, selection.end.rowIndex)
  const minCol = Math.min(selection.start.columnIndex, selection.end.columnIndex)
  const maxCol = Math.max(selection.start.columnIndex, selection.end.columnIndex)

  return {
    top: cell.rowIndex === minRow,
    bottom: cell.rowIndex === maxRow,
    left: cell.columnIndex === minCol,
    right: cell.columnIndex === maxCol,
  }
}


// Default skeleton placeholder for loading cells
const DefaultLoadingPlaceholder = (
  <Box sx={{ py: 1, px: 2 }}>
    <Skeleton variant="text" width="80%" height={20} />
  </Box>
)

// Column filter popover component
function ColumnFilterPopover({
  column,
  value,
  onChange,
  anchorEl,
  onClose,
}: {
  column: ColumnDefinition<any>
  value: ColumnFilterValue
  onChange: (value: ColumnFilterValue) => void
  anchorEl: HTMLElement | null
  onClose: () => void
}) {
  const filter = column.filter
  if (!filter) return null

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    onChange(newValue || null)
  }

  const handleSelectChange = (e: any) => {
    const newValue = e.target.value
    if (filter.multiple) {
      onChange(newValue.length > 0 ? newValue : null)
    } else {
      onChange(newValue || null)
    }
  }

  const handleBooleanChange = (e: any) => {
    const val = e.target.value
    if (val === '') {
      onChange(null)
    } else {
      onChange(val === 'true')
    }
  }

  const handleClear = () => {
    onChange(null)
    onClose()
  }

  return (
    <Popover
      open={Boolean(anchorEl)}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      slotProps={{
        paper: {
          sx: { p: 1.5, minWidth: 200 }
        }
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {filter.type === 'text' && (
          <TextField
            size="small"
            placeholder={filter.placeholder || 'Filter...'}
            value={(value as string) || ''}
            onChange={handleTextChange}
            autoFocus
            InputProps={{
              endAdornment: value ? (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={handleClear} edge="end">
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : null,
            }}
          />
        )}

        {filter.type === 'select' && !filter.multiple && (
          <FormControl size="small" fullWidth>
            <InputLabel>{filter.placeholder || 'Select'}</InputLabel>
            <Select
              value={(value as string) || ''}
              onChange={handleSelectChange}
              label={filter.placeholder || 'Select'}
            >
              <MenuItem value="">
                <em>All</em>
              </MenuItem>
              {filter.options?.map(opt => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        {filter.type === 'select' && filter.multiple && (
          <FormControl size="small" fullWidth>
            <InputLabel>{filter.placeholder || 'Select'}</InputLabel>
            <Select
              multiple
              value={(value as string[]) || []}
              onChange={handleSelectChange}
              label={filter.placeholder || 'Select'}
              renderValue={(selected) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {(selected as string[]).map((val) => {
                    const opt = filter.options?.find(o => o.value === val)
                    return <Chip key={val} label={opt?.label || val} size="small" />
                  })}
                </Box>
              )}
            >
              {filter.options?.map(opt => (
                <MenuItem key={opt.value} value={opt.value}>
                  <Checkbox checked={((value as string[]) || []).includes(opt.value)} />
                  <ListItemText primary={opt.label} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        {filter.type === 'boolean' && (
          <FormControl size="small" fullWidth>
            <InputLabel>{filter.placeholder || 'Value'}</InputLabel>
            <Select
              value={value === null ? '' : String(value)}
              onChange={handleBooleanChange}
              label={filter.placeholder || 'Value'}
            >
              <MenuItem value="">
                <em>All</em>
              </MenuItem>
              <MenuItem value="true">Yes</MenuItem>
              <MenuItem value="false">No</MenuItem>
            </Select>
          </FormControl>
        )}

        {value !== null && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <IconButton size="small" onClick={handleClear} title="Clear filter">
              <ClearIcon fontSize="small" />
            </IconButton>
          </Box>
        )}
      </Box>
    </Popover>
  )
}

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
  onColumnResizeStart: (columnIndex: number) => void
  resizingColumnIndex?: number | null
  filters?: ColumnFilters
  onFilterClick?: (columnKey: string, anchorEl: HTMLElement) => void
  selection?: SelectionRange | null
  onHeaderMouseDown?: (columnIndex: number, event: React.MouseEvent) => void
}

const StickyHeaderContext = createContext<StickyHeaderContextValue | null>(null)

// Default context value for when sticky header is disabled
const defaultStickyHeaderContext: StickyHeaderContextValue = {
  columns: [],
  columnWidths: [],
  headerHeight: 0,
  headerBgColor: 'background.paper',
  totalColumnsWidth: 0,
  getColumnStartWidth: () => 0,
  onColumnResize: () => { },
  onColumnResizeEnd: () => { },
  onColumnResizeStart: () => { },
  resizingColumnIndex: null,
  selection: null,
}

// Context for cell selection
interface CellSelectionContextValue {
  selection: SelectionRange | null
  onCellClick: (rowIndex: number, columnIndex: number, event: React.MouseEvent) => void
}

const CellSelectionContext = createContext<CellSelectionContextValue | null>(null)

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
    const ctx = useContext(StickyHeaderContext) ?? defaultStickyHeaderContext
    if (!ctx) return <div ref={ref} {...rest}>{children}</div>

    const columns = ctx.columns
    const columnWidths = ctx.columnWidths
    const headerHeight = ctx.headerHeight
    const headerBgColor = ctx.headerBgColor
    const totalColumnsWidth = ctx.totalColumnsWidth
    const getColumnStartWidth = ctx.getColumnStartWidth
    const onColumnResize = ctx.onColumnResize
    const onColumnResizeEnd = ctx.onColumnResizeEnd
    const onColumnResizeStart = ctx.onColumnResizeStart
    const resizingColumnIndex = ctx.resizingColumnIndex ?? null
    const filters = ctx.filters
    const onFilterClick = ctx.onFilterClick
    const selection = ctx.selection ?? null
    const onHeaderMouseDown = ctx.onHeaderMouseDown

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
              const hasFilter = col.filter !== undefined
              const filterValue = filters?.[col.key]
              const hasActiveFilter = filterValue !== undefined && filterValue !== null
              const isResizing = resizingColumnIndex === index
              const isLastColumn = index === columns.length - 1

              // Check if this column has any selected cells
              const hasSelectedCells = selection ? (() => {
                const minCol = Math.min(selection.start.columnIndex, selection.end.columnIndex)
                const maxCol = Math.max(selection.start.columnIndex, selection.end.columnIndex)
                return index >= minCol && index <= maxCol
              })() : false

              return (
                <Box
                  key={col.key}
                  data-header-column-index={index}
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
                    borderRight: isLastColumn ? 'none' : '1px solid',
                    borderRightColor: 'divider',
                    borderLeft: 'none',
                    borderBottom: '1px solid',
                    borderBottomColor: 'divider',
                    boxSizing: 'border-box',
                    bgcolor: hasSelectedCells ? 'action.selected' : headerBgColor,
                    cursor: 'pointer',
                    userSelect: 'none',
                    ...col.headerSx
                  }}
                  onMouseDown={(e) => {
                    onHeaderMouseDown?.(index, e)
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
                  {hasFilter && onFilterClick && (
                    <IconButton
                      size="small"
                      onClick={(e) => onFilterClick(col.key, e.currentTarget)}
                      sx={{
                        p: 0.5,
                        mr: 0.5,
                        color: hasActiveFilter ? 'primary.main' : 'action.active',
                        '&:hover': { bgcolor: 'action.hover' },
                      }}
                    >
                      <Badge
                        variant="dot"
                        color="primary"
                        invisible={!hasActiveFilter}
                        sx={{
                          '& .MuiBadge-badge': {
                            right: 2,
                            top: 2,
                          }
                        }}
                      >
                        <FilterIcon fontSize="small" />
                      </Badge>
                    </IconButton>
                  )}
                  {isResizable && (
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

/** Filter type for a column */
export type ColumnFilterType = 'text' | 'select' | 'boolean' | 'number' | 'date'

/** Filter value can be string, array of strings (for multi-select), boolean, or number range */
export type ColumnFilterValue = string | string[] | boolean | { min?: number; max?: number } | { from?: string; to?: string } | null

/** Filter configuration for a column */
export interface ColumnFilterConfig {
  /** Type of filter control to show */
  type: ColumnFilterType
  /** Placeholder text for the filter input */
  placeholder?: string
  /** Options for select filter type */
  options?: { value: string; label: string }[]
  /** Whether to allow multiple selections (for select type) */
  multiple?: boolean
}

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
  /** Get the text value of a cell for copying (defaults to String(value)) */
  getCellValue?: (item: T, rowIndex: number) => string
  /** Optional cell styles */
  cellSx?: Record<string, any>
  /** Optional header styles */
  headerSx?: Record<string, any>
  /** Filter configuration for this column (if filterable) */
  filter?: ColumnFilterConfig
}

/** Map of column key to filter value */
export type ColumnFilters = Record<string, ColumnFilterValue>

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
  /** Current column filters (controlled) */
  filters?: ColumnFilters
  /** Called when filters change */
  onFiltersChange?: (filters: ColumnFilters) => void
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
  filters,
  onFiltersChange,
}: VirtualizedGridProps<T>) {
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

  // Cell selection state
  const [selection, setSelection] = useState<SelectionRange | null>(null)
  const [copyNotification, setCopyNotification] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isHeaderColumnSelecting, setIsHeaderColumnSelecting] = useState(false)

  // Filter popover state
  const [filterAnchorEl, setFilterAnchorEl] = useState<HTMLElement | null>(null)
  const [activeFilterColumn, setActiveFilterColumn] = useState<string | null>(null)

  // Column resize state
  const [resizingColumnIndex, setResizingColumnIndex] = useState<number | null>(null)

  const selectionRef = useRef(selection)
  selectionRef.current = selection
  const isDraggingRef = useRef(isDragging)
  isDraggingRef.current = isDragging
  const dragStartCellRef = useRef<CellPosition | null>(null)
  const isHeaderColumnSelectingRef = useRef(isHeaderColumnSelecting)
  isHeaderColumnSelectingRef.current = isHeaderColumnSelecting

  // Helper to find cell position from a mouse event target
  const getCellFromElement = useCallback((element: Element | null): CellPosition | null => {
    let cellElement = element as HTMLElement | null
    while (cellElement && !cellElement.dataset.rowIndex) {
      cellElement = cellElement.parentElement
    }
    if (cellElement && cellElement.dataset.rowIndex && cellElement.dataset.columnIndex) {
      return {
        rowIndex: parseInt(cellElement.dataset.rowIndex, 10),
        columnIndex: parseInt(cellElement.dataset.columnIndex, 10)
      }
    }
    return null
  }, [])

  // Handle mouse down on a cell - starts selection or drag
  const handleCellMouseDown = useCallback((rowIndex: number, columnIndex: number, event: React.MouseEvent) => {
    // Only handle left mouse button
    if (event.button !== 0) return
    event.stopPropagation()

    const newCell: CellPosition = { rowIndex, columnIndex }

    if (event.shiftKey && selectionRef.current) {
      // Extend selection from start to clicked cell
      setSelection({
        start: selectionRef.current.start,
        end: newCell
      })
      dragStartCellRef.current = selectionRef.current.start
    } else {
      // Start new selection
      setSelection({
        start: newCell,
        end: newCell
      })
      dragStartCellRef.current = newCell
    }

    setIsDragging(true)
  }, [])

  // Handle mouse down on header - starts column selection
  const handleHeaderMouseDown = useCallback((columnIndex: number, event: React.MouseEvent) => {
    // Only handle left mouse button
    if (event.button !== 0) return
    event.stopPropagation()

    setIsHeaderColumnSelecting(true)
    setIsDragging(true)

    // Select entire column (all rows for this column)
    const newSelection: SelectionRange = {
      start: { rowIndex: 0, columnIndex },
      end: { rowIndex: totalCount - 1, columnIndex }
    }

    setSelection(newSelection)
    dragStartCellRef.current = { rowIndex: 0, columnIndex }
  }, [totalCount])

  // Handle mouse move during drag - extend selection
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !dragStartCellRef.current) return

      const target = document.elementFromPoint(e.clientX, e.clientY)

      if (isHeaderColumnSelectingRef.current) {
        // Header column selection mode - look for header cells or grid cells
        let columnIndex = -1

        // Check if we're over a header cell
        let headerElement = target as HTMLElement
        while (headerElement && !headerElement.dataset.headerColumnIndex) {
          headerElement = headerElement.parentElement as HTMLElement
          if (!headerElement) break
        }

        if (headerElement?.dataset.headerColumnIndex) {
          columnIndex = parseInt(headerElement.dataset.headerColumnIndex, 10)
        } else {
          // Check if we're over a grid cell
          const cell = getCellFromElement(target)
          if (cell) {
            columnIndex = cell.columnIndex
          }
        }

        if (columnIndex >= 0) {
          const startColumn = dragStartCellRef.current.columnIndex
          const endColumn = columnIndex

          setSelection({
            start: { rowIndex: 0, columnIndex: Math.min(startColumn, endColumn) },
            end: { rowIndex: totalCount - 1, columnIndex: Math.max(startColumn, endColumn) }
          })
        }
      } else {
        // Normal cell selection mode
        const cell = getCellFromElement(target)

        if (cell) {
          setSelection({
            start: dragStartCellRef.current,
            end: cell
          })
        }
      }
    }

    const handleMouseUp = () => {
      if (isDraggingRef.current) {
        setIsDragging(false)
        if (isHeaderColumnSelectingRef.current) {
          setIsHeaderColumnSelecting(false)
        }
        dragStartCellRef.current = null
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [getCellFromElement])

  // Handle mouse move during header drag - extend column selection
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isHeaderColumnSelectingRef.current || !isDraggingRef.current || !dragStartCellRef.current) return

      const target = document.elementFromPoint(e.clientX, e.clientY)
      if (!target) return

      // Check if we're over a header cell
      let headerElement = target as HTMLElement
      while (headerElement && !headerElement.dataset.headerColumnIndex) {
        headerElement = headerElement.parentElement as HTMLElement
        if (!headerElement) return
      }

      const headerColumnIndex = headerElement.dataset.headerColumnIndex
      if (headerColumnIndex !== undefined) {
        const columnIndex = parseInt(headerColumnIndex, 10)
        const startColumn = dragStartCellRef.current.columnIndex
        const endColumn = columnIndex

        setSelection({
          start: { rowIndex: 0, columnIndex: Math.min(startColumn, endColumn) },
          end: { rowIndex: totalCount - 1, columnIndex: Math.max(startColumn, endColumn) }
        })
      }
    }

    const handleMouseUp = () => {
      if (isHeaderColumnSelectingRef.current) {
        setIsHeaderColumnSelecting(false)
        setIsDragging(false)
        dragStartCellRef.current = null
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [totalCount])

  const handleCellMouseDownRef = useRef(handleCellMouseDown)
  handleCellMouseDownRef.current = handleCellMouseDown

  // Copy selected cells to clipboard
  const copySelectionToClipboard = useCallback(() => {
    const currentSelection = selectionRef.current
    if (!currentSelection) return

    const currentItems = itemsRef.current
    const currentColumns = columnsRef.current

    const minRow = Math.min(currentSelection.start.rowIndex, currentSelection.end.rowIndex)
    const maxRow = Math.max(currentSelection.start.rowIndex, currentSelection.end.rowIndex)
    const minCol = Math.min(currentSelection.start.columnIndex, currentSelection.end.columnIndex)
    const maxCol = Math.max(currentSelection.start.columnIndex, currentSelection.end.columnIndex)

    const rows: string[] = []

    for (let row = minRow; row <= maxRow; row++) {
      const item = currentItems.get(row)
      if (!item) continue

      const cellValues: string[] = []
      for (let col = minCol; col <= maxCol; col++) {
        const column = currentColumns[col]
        if (!column) continue

        // Use getCellValue if provided, otherwise try to stringify the rendered content
        const value = column.getCellValue
          ? column.getCellValue(item, row)
          : ''
        cellValues.push(value)
      }
      rows.push(cellValues.join('\t'))
    }

    const text = rows.join('\n')
    navigator.clipboard.writeText(text).then(() => {
      setCopyNotification(true)
    })
  }, [])

  // Keyboard handler for copy and arrow key navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Copy with Ctrl/Cmd+C
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selectionRef.current) {
        e.preventDefault()
        copySelectionToClipboard()
        return
      }

      // Escape to clear selection
      if (e.key === 'Escape') {
        setSelection(null)
        return
      }

      // Arrow key navigation
      const currentSelection = selectionRef.current
      if (!currentSelection) return

      const arrowKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
      if (!arrowKeys.includes(e.key)) return

      e.preventDefault()

      const currentColumns = columnsRef.current
      const { end } = currentSelection

      let newRow = end.rowIndex
      let newCol = end.columnIndex

      switch (e.key) {
        case 'ArrowUp':
          newRow = Math.max(0, end.rowIndex - 1)
          break
        case 'ArrowDown':
          newRow = Math.min(totalCount - 1, end.rowIndex + 1)
          break
        case 'ArrowLeft':
          newCol = Math.max(0, end.columnIndex - 1)
          break
        case 'ArrowRight':
          newCol = Math.min(currentColumns.length - 1, end.columnIndex + 1)
          break
      }

      const newCell: CellPosition = { rowIndex: newRow, columnIndex: newCol }

      if (e.shiftKey) {
        // Extend selection
        setSelection({
          start: currentSelection.start,
          end: newCell
        })
      } else {
        // Move selection (single cell)
        setSelection({
          start: newCell,
          end: newCell
        })
      }

      // Scroll the cell into view if needed
      gridRef.current?.scrollToItem({
        rowIndex: newRow,
        columnIndex: newCol,
        align: 'smart'
      })
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [copySelectionToClipboard, totalCount])

  // Clear selection when clicking outside the grid
  const gridContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      // Only clear if there's a selection and click is outside the grid container
      if (selectionRef.current && gridContainerRef.current) {
        if (!gridContainerRef.current.contains(e.target as Node)) {
          setSelection(null)
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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
  const resizingColumnIndexRefForCell = useRef(resizingColumnIndex)
  resizingColumnIndexRefForCell.current = resizingColumnIndex

  // Force grid to re-render when selection changes
  useEffect(() => {
    if (gridRef.current) {
      gridRef.current.resetAfterIndices({ rowIndex: 0, columnIndex: 0 })
    }
  }, [selection])

  // Cell renderer
  const Cell = useCallback(({ columnIndex, rowIndex, style }: { columnIndex: number; rowIndex: number; style: CSSProperties }) => {
    const currentItems = itemsRef.current
    const currentColumns = columnsRef.current
    const currentOnRowClick = onRowClickRef.current
    const currentPlaceholder = placeholderContentRef.current
    const currentSelection = selectionRefForCell.current
    const currentHandleCellMouseDown = handleCellMouseDownRefForCell.current
    const currentResizingColumnIndex = resizingColumnIndexRefForCell.current

    // Get selection border info for Excel-style outline
    const selectionBorders = getSelectionBorders({ rowIndex, columnIndex }, currentSelection)
    // Check if this cell is selected but not the start of the selection
    const isSelectedNotStart = selectionBorders !== null && currentSelection !== null &&
      !(rowIndex === currentSelection.start.rowIndex && columnIndex === currentSelection.start.columnIndex)

    // Offset cell position by header height
    const offsetStyle: CSSProperties = {
      ...style,
      top: typeof style.top === 'number' ? style.top + headerHeightRef.current : style.top,
    }

    const item = currentItems.get(rowIndex)
    const column = currentColumns[columnIndex]

    if (!column) return null

    const isLastColumn = columnIndex === currentColumns.length - 1
    // Hide right border only if it's the last column
    const hideRightBorder = isLastColumn

    // Show placeholder for items not yet loaded
    if (item === undefined) {
      return (
        <Box
          data-row-index={rowIndex}
          data-column-index={columnIndex}
          style={offsetStyle}
          sx={{
            display: 'flex',
            alignItems: 'center',
            bgcolor: 'background.paper',
            position: 'relative',
            // Standard borders for grid lines
            borderBottom: '1px solid',
            borderBottomColor: 'divider',
            borderRight: hideRightBorder ? 'none' : '1px solid',
            borderRightColor: 'divider',
            borderLeft: undefined,
            boxSizing: 'border-box',
            ...column.cellSx
          }}
        >
          {currentPlaceholder}
        </Box>
      )
    }

    const handleMouseDown = (e: React.MouseEvent) => {
      // Handle cell selection (starts drag)
      currentHandleCellMouseDown(rowIndex, columnIndex, e)
      // Also trigger row click if defined
      if (currentOnRowClick) {
        currentOnRowClick(item, rowIndex)
      }
    }

    return (
      <Box
        data-row-index={rowIndex}
        data-column-index={columnIndex}
        style={offsetStyle}
        onMouseDown={handleMouseDown}
        sx={{
          display: 'flex',
          alignItems: 'center',
          bgcolor: isSelectedNotStart ? 'action.selected' : 'background.paper',
          position: 'relative',
          // Raise z-index when selected so pseudo-elements appear above all borders
          zIndex: selectionBorders ? 1 : undefined,
          // Standard borders for grid lines - hide perimeter borders when selected to show clean selection outline
          borderBottom: selectionBorders?.bottom ? 'none' : '1px solid',
          borderRight: hideRightBorder || selectionBorders?.right ? 'none' : '1px solid',
          borderRightColor: 'divider',
          borderLeft: selectionBorders?.left ? 'none' : undefined,
          borderBottomColor: 'divider',
          // Selection highlight using pseudo-elements
          '&::after': selectionBorders ? {
            content: '""',
            position: 'absolute',
            top: -1,
            right: -1,
            bottom: -1,
            left: -1,
            borderTop: `${selectionBorders?.top ? 2 : 0}px solid`,
            borderRight: `${selectionBorders?.right ? 2 : 0}px solid`,
            borderBottom: `${selectionBorders?.bottom ? 2 : 0}px solid`,
            borderLeft: `${selectionBorders?.left ? 2 : 0}px solid`,
            borderColor: (theme: any) => theme.palette.mode === 'dark' ? theme.palette.secondary.main : theme.palette.primary.main,
            pointerEvents: 'none',
            zIndex: 10,
          } : undefined,
          cursor: 'pointer',
          boxSizing: 'border-box',
          userSelect: 'none', // Prevent text selection during drag
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
        onClose={() => setCopyNotification(false)}
        message="Copied to clipboard"
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
      {activeFilterColumn && (
        <ColumnFilterPopover
          column={columns.find(c => c.key === activeFilterColumn)!}
          value={filters?.[activeFilterColumn] ?? null}
          onChange={(value) => handleFilterChange(activeFilterColumn, value)}
          anchorEl={filterAnchorEl}
          onClose={handleFilterClose}
        />
      )}
    </Box>
  )
}

export type { GridHandle as VirtualizedGridHandle }
