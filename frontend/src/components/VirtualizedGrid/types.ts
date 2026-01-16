import type { ReactNode, CSSProperties } from 'react'
import type { KeyboardAction } from './KeyboardShortcuts'

/** Props passed to custom cell renderers */
export interface CellRendererProps<T> {
  /** The item data for this row */
  item: T
  /** Row index in the grid */
  rowIndex: number
  /** Column index in the grid */
  columnIndex: number
  /** Style object for positioning (must be applied to root element) */
  style: CSSProperties
  /** The column definition */
  column: ColumnDefinition<T>
  /** Whether this cell is selected */
  isSelected: boolean
  /** Selection border info (null if not on selection edge) */
  selectionBorders: SelectionBorders | null
  /** Mouse down handler for selection */
  onMouseDown: (e: React.MouseEvent) => void
}

/** Props passed to custom cell editors */
export interface CellEditorProps<T> {
  /** The item data for this row */
  item: T
  /** The current cell value */
  value: string
  /** Row index in the grid */
  rowIndex: number
  /** Column index in the grid */
  columnIndex: number
  /** Style object for positioning (must be applied to root element) */
  style: CSSProperties
  /** The column definition */
  column: ColumnDefinition<T>
  /** Selection border info (null if not on selection edge) */
  selectionBorders: SelectionBorders | null
  /** Called when editing is complete with the new value */
  onSave: (newValue: string) => void
  /** Called when editing is cancelled */
  onCancel: () => void
}

// Cell selection types
export interface CellPosition {
  rowIndex: number
  columnIndex: number
}

export interface SelectionRange {
  start: CellPosition
  end: CellPosition
}

// Helper to get which borders should be shown for a selected cell (Excel-style outline)
export interface SelectionBorders {
  top: boolean
  right: boolean
  bottom: boolean
  left: boolean
}

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
  /** Custom cell renderer component - replaces the entire cell wrapper */
  cellRenderer?: (props: CellRendererProps<T>) => ReactNode
  /** Whether this column is editable */
  editable?: boolean
  /** Custom editor component for this column */
  editor?: (props: CellEditorProps<T>) => ReactNode
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
  /** Whether to disable clickaway selection clearing */
  disableClickaway?: boolean
  /** Whether to enable default keyboard shortcuts (default: true) */
  enableKeyboardShortcuts?: boolean
  /** Custom keyboard actions to register */
  keyboardActions?: KeyboardAction[]
  /** Called when a cell value is edited */
  onCellEdit?: (item: T, columnKey: string, newValue: string, rowIndex: number) => void
}

export interface GridHandle {
  scrollToItem: (options: { rowIndex?: number; columnIndex?: number; align?: 'auto' | 'smart' | 'center' | 'end' | 'start' }) => void
  resetAfterIndices: (options: { rowIndex: number; columnIndex?: number; shouldForceUpdate?: boolean }) => void
}
