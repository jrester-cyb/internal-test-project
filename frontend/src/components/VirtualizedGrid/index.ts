// Main component
export { default } from './VirtualizedGrid'
export { default as VirtualizedGrid } from './VirtualizedGrid'

// Types
export type {
  CellPosition,
  SelectionRange,
  SelectionBorders,
  ColumnFilterType,
  ColumnFilterValue,
  ColumnFilterConfig,
  ColumnDefinition,
  ColumnFilters,
  VirtualizedGridProps,
  GridHandle as VirtualizedGridHandle,
  CellRendererProps,
  CellEditorProps,
} from './types'

// Selection utilities
export { isCellInRange, getSelectionBorders } from './selection'

// Components
export { ResizeHandle } from './ResizeHandle'
export { ColumnFilterPopover } from './ColumnFilterPopover'
export { default as GridCell, DefaultCellWrapper } from './GridCell'
export type { GridCellProps, DefaultCellWrapperProps } from './GridCell'
export { Editor } from './Editor'
export type { EditorProps } from './Editor'
export {
  StickyHeaderContext,
  defaultStickyHeaderContext,
  StickyInnerElement,
  StickyHeaderOuterElement,
} from './StickyHeader'
export type { StickyHeaderContextValue } from './StickyHeader'

// Hooks
export { useGridKeyboardNavigation } from './useGridKeyboardNavigation'
export type { UseGridKeyboardNavigationOptions } from './useGridKeyboardNavigation'

// Cell Selection Context
export {
  CellSelectionProvider,
  useCellSelection,
  useCellSelectionOptional,
} from './CellSelectionContext'
export type { CellSelectionContextValue, CellSelectionProviderProps } from './CellSelectionContext'

// Keyboard Shortcuts
export {
  KeyboardShortcutsProvider,
  useKeyboardShortcuts,
} from './KeyboardShortcuts'
export type {
  KeyboardAction,
  KeyboardShortcutsContextValue,
  KeyboardShortcutsProviderProps,
} from './KeyboardShortcuts'
