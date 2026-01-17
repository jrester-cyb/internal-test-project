// Main component
export { default } from '@app/components/VirtualizedGrid/VirtualizedGrid'
export { default as VirtualizedGrid } from '@app/components/VirtualizedGrid/VirtualizedGrid'

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
} from '@app/components/VirtualizedGrid/types'

// Selection utilities
export { isCellInRange, getSelectionBorders } from '@app/components/VirtualizedGrid/selection'

// Components
export { ResizeHandle } from '@app/components/VirtualizedGrid/ResizeHandle'
export { ColumnFilterPopover } from '@app/components/VirtualizedGrid/ColumnFilterPopover'
export { default as GridCell, DefaultCellWrapper } from '@app/components/VirtualizedGrid/GridCell'
export type { GridCellProps, DefaultCellWrapperProps } from '@app/components/VirtualizedGrid/GridCell'
export { Editor } from '@app/components/VirtualizedGrid/Editor'
export type { EditorProps } from '@app/components/VirtualizedGrid/Editor'
export {
  StickyHeaderContext,
  defaultStickyHeaderContext,
  StickyInnerElement,
  StickyHeaderOuterElement,
} from '@app/components/VirtualizedGrid/StickyHeader'
export type { StickyHeaderContextValue } from '@app/components/VirtualizedGrid/StickyHeader'

// Hooks
export { useGridKeyboardNavigation } from '@app/components/VirtualizedGrid/useGridKeyboardNavigation'
export type { UseGridKeyboardNavigationOptions } from '@app/components/VirtualizedGrid/useGridKeyboardNavigation'

// Cell Selection Context
export {
  CellSelectionProvider,
  useCellSelection,
  useCellSelectionOptional,
} from '@app/components/VirtualizedGrid/CellSelectionContext'
export type { CellSelectionContextValue, CellSelectionProviderProps } from '@app/components/VirtualizedGrid/CellSelectionContext'

// Keyboard Shortcuts
export {
  KeyboardShortcutsProvider,
  useKeyboardShortcuts,
} from '@app/components/VirtualizedGrid/KeyboardShortcuts'
export type {
  KeyboardAction,
  KeyboardShortcutsContextValue,
  KeyboardShortcutsProviderProps,
} from '@app/components/VirtualizedGrid/KeyboardShortcuts'
