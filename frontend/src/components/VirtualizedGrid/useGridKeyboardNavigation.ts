import { useEffect, type RefObject } from 'react'
import type { VariableSizeGrid as Grid } from 'react-window'
import type { CellPosition, SelectionRange, ColumnDefinition } from './types'

export interface UseGridKeyboardNavigationOptions<T> {
  /** Ref to the current selection */
  selectionRef: RefObject<SelectionRange | null>
  /** Function to update selection */
  setSelection: (selection: SelectionRange | null) => void
  /** Function to copy selection to clipboard */
  copySelectionToClipboard: () => void
  /** Total number of rows */
  totalCount: number
  /** Ref to columns array */
  columnsRef: RefObject<ColumnDefinition<T>[]>
  /** Ref to the grid component for scrolling */
  gridRef: RefObject<Grid | null>
  /** Whether keyboard shortcuts are enabled (default: true) */
  enabled?: boolean
}

/**
 * Hook that handles keyboard navigation for the virtualized grid.
 * Supports:
 * - Arrow keys for single-cell navigation
 * - Shift+Arrow for extending selection
 * - Ctrl/Cmd+Arrow for jumping to edges
 * - Ctrl/Cmd+C for copying selection
 * - Escape for clearing selection
 */
export function useGridKeyboardNavigation<T>({
  selectionRef,
  setSelection,
  copySelectionToClipboard,
  totalCount,
  columnsRef,
  gridRef,
  enabled = true,
}: UseGridKeyboardNavigationOptions<T>) {
  useEffect(() => {
    if (!enabled) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const arrowKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
      const currentSelection = selectionRef.current
      if (!currentSelection) return

      // Copy with Ctrl/Cmd+C
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        e.preventDefault()
        copySelectionToClipboard()
        return
      }

      // Escape to clear selection
      if (e.key === 'Escape') {
        setSelection(null)
        return
      }

      // Ctrl+Arrow key navigation (jump to edges)
      if ((e.ctrlKey || e.metaKey) && arrowKeys.includes(e.key)) {
        e.preventDefault()

        const currentColumns = columnsRef.current
        if (!currentColumns) return

        let newRow = currentSelection.start.rowIndex
        let newCol = currentSelection.start.columnIndex

        switch (e.key) {
          case 'ArrowUp':
            newRow = 0
            break
          case 'ArrowDown':
            newRow = totalCount - 1
            break
          case 'ArrowLeft':
            newCol = 0
            break
          case 'ArrowRight':
            newCol = currentColumns.length - 1
            break
        }

        const newCell: CellPosition = { rowIndex: newRow, columnIndex: newCol }

        if (e.shiftKey) {
          setSelection({ start: newCell, end: newCell })
        } else {
          setSelection({ start: newCell, end: newCell })
        }

        gridRef.current?.scrollToItem({
          columnIndex: newCol,
          rowIndex: newRow,
          align: 'auto'
        })
        return
      }

      if (!arrowKeys.includes(e.key)) return

      e.preventDefault()

      const currentColumns = columnsRef.current
      if (!currentColumns) return

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
        setSelection({ start: currentSelection.start, end: newCell })
      } else {
        setSelection({ start: newCell, end: newCell })
      }

      gridRef.current?.scrollToItem({
        rowIndex: newRow,
        columnIndex: newCol,
        align: 'smart'
      })
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [enabled, selectionRef, setSelection, copySelectionToClipboard, totalCount, columnsRef, gridRef])
}
