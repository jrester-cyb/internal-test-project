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
  /** Function to start editing a cell, optionally with an initial value to replace content */
  startEditing?: (rowIndex: number, columnIndex: number, initialValue?: string) => void
  /** Whether cell editing is enabled */
  editingEnabled?: boolean
  /** Function to paste data into a range of cells. Called with parsed clipboard data (rows of columns), starting position, and end position for tiling */
  onPasteRange?: (data: string[][], startRow: number, startCol: number, endRow: number, endCol: number) => void
}

/**
 * Hook that handles keyboard navigation for the virtualized grid.
 * Supports:
 * - Arrow keys for single-cell navigation
 * - Shift+Arrow for extending selection
 * - Ctrl/Cmd+Arrow for jumping to edges
 * - Ctrl/Cmd+C for copying selection
 * - Ctrl/Cmd+V for pasting (single cell or multi-cell range from spreadsheet)
 * - Escape for clearing selection
 * - F2/Enter to start editing
 * - Printable keys to start editing and replace content
 * - Delete/Backspace to clear cell content
 */
export function useGridKeyboardNavigation<T>({
  selectionRef,
  setSelection,
  copySelectionToClipboard,
  totalCount,
  columnsRef,
  gridRef,
  enabled = true,
  startEditing,
  editingEnabled = false,
  onPasteRange,
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

      // Check if we should start editing (only for single-cell selection)
      const isSingleCell =
        currentSelection.start.rowIndex === currentSelection.end.rowIndex &&
        currentSelection.start.columnIndex === currentSelection.end.columnIndex

      if (editingEnabled && startEditing && isSingleCell) {
        const { rowIndex, columnIndex } = currentSelection.start
        const currentColumns = columnsRef.current
        const column = currentColumns?.[columnIndex]

        // Check if the column is editable
        if (column?.editable) {
          // F2 or Enter to start editing (keep current value)
          if (e.key === 'F2' || e.key === 'Enter') {
            e.preventDefault()
            startEditing(rowIndex, columnIndex)
            return
          }

          // Printable character - start editing and replace content with the typed character
          // Check for single printable character (not modifier keys, function keys, etc.)
          const isPrintable = e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey
          if (isPrintable) {
            e.preventDefault()
            startEditing(rowIndex, columnIndex, e.key)
            return
          }

          // Delete or Backspace - clear cell and enter edit mode
          if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault()
            // Start editing with empty value to clear and focus
            startEditing(rowIndex, columnIndex, '')
            return
          }
        }
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

    // Handle paste event - uses clipboardData directly (no permission prompt)
    const handlePaste = (e: ClipboardEvent) => {
      if (!editingEnabled || !onPasteRange) return

      const currentSelection = selectionRef.current
      if (!currentSelection) return

      const text = e.clipboardData?.getData('text/plain')
      if (!text) return

      e.preventDefault()

      const { rowIndex: startRow, columnIndex: startCol } = currentSelection.start
      const { rowIndex: endRow, columnIndex: endCol } = currentSelection.end

      // Normalize start/end (selection can go in any direction)
      const normalizedStartRow = Math.min(startRow, endRow)
      const normalizedEndRow = Math.max(startRow, endRow)
      const normalizedStartCol = Math.min(startCol, endCol)
      const normalizedEndCol = Math.max(startCol, endCol)

      // Parse clipboard text - split by newlines for rows, tabs for columns
      const rows = text.split(/\r?\n/).filter(row => row.length > 0)
      const data = rows.map(row => row.split('\t'))

      // Calculate paste dimensions (larger of selection or data)
      const selectionRows = normalizedEndRow - normalizedStartRow + 1
      const selectionCols = normalizedEndCol - normalizedStartCol + 1
      const dataRows = data.length
      const dataCols = data[0]?.length ?? 0

      const pastedRows = Math.max(selectionRows, dataRows)
      const pastedCols = Math.max(selectionCols, dataCols)

      // Get column count for bounds checking
      const currentColumns = columnsRef.current
      const maxCol = currentColumns ? currentColumns.length - 1 : normalizedStartCol + pastedCols - 1

      // Calculate the actual end position of pasted data (clamped to grid bounds)
      const newEndRow = Math.min(normalizedStartRow + pastedRows - 1, totalCount - 1)
      const newEndCol = Math.min(normalizedStartCol + pastedCols - 1, maxCol)

      onPasteRange(data, normalizedStartRow, normalizedStartCol, normalizedEndRow, normalizedEndCol)

      // Update selection to cover the pasted range
      setSelection({
        start: { rowIndex: normalizedStartRow, columnIndex: normalizedStartCol },
        end: { rowIndex: newEndRow, columnIndex: newEndCol }
      })
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('paste', handlePaste)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('paste', handlePaste)
    }
  }, [enabled, selectionRef, setSelection, copySelectionToClipboard, totalCount, columnsRef, gridRef, startEditing, editingEnabled, onPasteRange])
}
