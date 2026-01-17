import type { CellPosition, SelectionRange, SelectionBorders } from '@app/components/VirtualizedGrid/types'

// Helper to check if a cell is within a selection range
export function isCellInRange(cell: CellPosition, range: SelectionRange): boolean {
  const minRow = Math.min(range.start.rowIndex, range.end.rowIndex)
  const maxRow = Math.max(range.start.rowIndex, range.end.rowIndex)
  const minCol = Math.min(range.start.columnIndex, range.end.columnIndex)
  const maxCol = Math.max(range.start.columnIndex, range.end.columnIndex)

  return cell.rowIndex >= minRow && cell.rowIndex <= maxRow &&
    cell.columnIndex >= minCol && cell.columnIndex <= maxCol
}

// Helper to get which borders should be shown for a selected cell (Excel-style outline)
export function getSelectionBorders(cell: CellPosition, selection: SelectionRange | null): SelectionBorders | null {
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
