import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  useEffect,
  type ReactNode,
  type RefObject,
} from 'react'
import type { CellPosition, SelectionRange, ColumnDefinition } from './types'

export interface CellSelectionContextValue {
  /** Current selection range */
  selection: SelectionRange | null
  /** Ref to current selection (for use in callbacks) */
  selectionRef: RefObject<SelectionRange | null>
  /** Update selection */
  setSelection: (selection: SelectionRange | null) => void
  /** Handle mouse down on a cell */
  handleCellMouseDown: (rowIndex: number, columnIndex: number, event: React.MouseEvent) => void
  /** Handle mouse down on a header column */
  handleHeaderMouseDown: (columnIndex: number, event: React.MouseEvent) => void
  /** Copy current selection to clipboard */
  copySelectionToClipboard: () => void
  /** Whether copy notification should be shown */
  copyNotification: boolean
  /** Hide copy notification */
  hideCopyNotification: () => void
}

const CellSelectionContext = createContext<CellSelectionContextValue | null>(null)

export interface CellSelectionProviderProps<T> {
  children: ReactNode
  /** Total number of rows in the grid */
  totalCount: number
  /** Ref to items map */
  itemsRef: RefObject<Map<number, T>>
  /** Ref to columns array */
  columnsRef: RefObject<ColumnDefinition<T>[]>
  /** Whether to disable clickaway selection clearing */
  disableClickaway?: boolean
  /** Ref to the grid container element for clickaway detection */
  gridContainerRef?: RefObject<HTMLDivElement | null>
}

export function CellSelectionProvider<T>({
  children,
  totalCount,
  itemsRef,
  columnsRef,
  disableClickaway = false,
  gridContainerRef,
}: CellSelectionProviderProps<T>) {
  const [selection, setSelection] = useState<SelectionRange | null>(null)
  const [copyNotification, setCopyNotification] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isHeaderColumnSelecting, setIsHeaderColumnSelecting] = useState(false)

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

  // Helper to check if a cell is within the current selection range
  const isCellInSelection = useCallback((rowIndex: number, columnIndex: number): boolean => {
    const sel = selectionRef.current
    if (!sel) return false
    const minRow = Math.min(sel.start.rowIndex, sel.end.rowIndex)
    const maxRow = Math.max(sel.start.rowIndex, sel.end.rowIndex)
    const minCol = Math.min(sel.start.columnIndex, sel.end.columnIndex)
    const maxCol = Math.max(sel.start.columnIndex, sel.end.columnIndex)
    return rowIndex >= minRow && rowIndex <= maxRow && columnIndex >= minCol && columnIndex <= maxCol
  }, [])

  // Handle mouse down on a cell - starts selection or drag
  const handleCellMouseDown = useCallback((rowIndex: number, columnIndex: number, event: React.MouseEvent) => {
    if (event.button !== 0) return
    event.stopPropagation()

    const newCell: CellPosition = { rowIndex, columnIndex }

    if (event.shiftKey && selectionRef.current) {
      setSelection({
        start: selectionRef.current.start,
        end: newCell
      })
      dragStartCellRef.current = selectionRef.current.start
    } else {
      // If clicking within an existing multi-cell selection, preserve it
      // This allows editing a cell within a range without collapsing the selection
      const currentSel = selectionRef.current
      const isMultiCell = currentSel && (
        currentSel.start.rowIndex !== currentSel.end.rowIndex ||
        currentSel.start.columnIndex !== currentSel.end.columnIndex
      )
      if (isMultiCell && isCellInSelection(rowIndex, columnIndex)) {
        // Keep the existing selection, just update drag start for potential dragging
        dragStartCellRef.current = newCell
      } else {
        setSelection({
          start: newCell,
          end: newCell
        })
        dragStartCellRef.current = newCell
      }
    }

    setIsDragging(true)
  }, [isCellInSelection])

  // Handle mouse down on header - starts column selection
  const handleHeaderMouseDown = useCallback((columnIndex: number, event: React.MouseEvent) => {
    if (event.button !== 0) return
    event.stopPropagation()

    setIsHeaderColumnSelecting(true)
    setIsDragging(true)

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
        let columnIndex = -1

        let headerElement = target as HTMLElement
        while (headerElement && !headerElement.dataset.headerColumnIndex) {
          headerElement = headerElement.parentElement as HTMLElement
          if (!headerElement) break
        }

        if (headerElement?.dataset.headerColumnIndex) {
          columnIndex = parseInt(headerElement.dataset.headerColumnIndex, 10)
        } else {
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
  }, [getCellFromElement, totalCount])

  // Copy selection to clipboard
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
  }, [itemsRef, columnsRef])

  // Clear selection when clicking outside the grid
  useEffect(() => {
    if (disableClickaway) return

    const handleClickOutside = (e: MouseEvent) => {
      if (selectionRef.current) {
        const target = e.target as Element
        const isWithinPage = target.closest('[data-page-content]') !== null
        const isWithinGrid = gridContainerRef?.current?.contains(target) === true

        if (isWithinPage && !isWithinGrid) {
          setSelection(null)
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [disableClickaway, gridContainerRef])

  const hideCopyNotification = useCallback(() => {
    setCopyNotification(false)
  }, [])

  const value: CellSelectionContextValue = {
    selection,
    selectionRef,
    setSelection,
    handleCellMouseDown,
    handleHeaderMouseDown,
    copySelectionToClipboard,
    copyNotification,
    hideCopyNotification,
  }

  return (
    <CellSelectionContext.Provider value={value}>
      {children}
    </CellSelectionContext.Provider>
  )
}

export function useCellSelection(): CellSelectionContextValue {
  const context = useContext(CellSelectionContext)
  if (!context) {
    throw new Error('useCellSelection must be used within a CellSelectionProvider')
  }
  return context
}

// Optional hook that returns null if not in provider (for components that may be used outside grid)
export function useCellSelectionOptional(): CellSelectionContextValue | null {
  return useContext(CellSelectionContext)
}
