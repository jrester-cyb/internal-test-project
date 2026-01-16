import React, { type CSSProperties, type RefObject } from 'react'
import { Box } from '@mui/material'
import type { SelectionRange, ColumnDefinition, SelectionBorders, CellPosition } from './types'
import { getSelectionBorders } from './selection'
import { Editor } from './Editor'

export interface GridCellProps<T> {
  columnIndex: number
  rowIndex: number
  style: CSSProperties
  /** Ref to items map */
  itemsRef: RefObject<Map<number, T>>
  /** Ref to columns array */
  columnsRef: RefObject<ColumnDefinition<T>[]>
  /** Ref to current selection */
  selectionRef: RefObject<SelectionRange | null>
  /** Ref to cell mouse down handler */
  handleCellMouseDownRef: RefObject<(rowIndex: number, columnIndex: number, event: React.MouseEvent) => void>
  /** Ref to row click handler */
  onRowClickRef: RefObject<((item: T, rowIndex: number) => void) | undefined>
  /** Ref to loading placeholder content */
  placeholderContentRef: RefObject<React.ReactNode>
  /** Header height offset */
  headerHeight: number
  /** Currently resizing column index (if any) */
  resizingColumnIndex: number | null
  /** Currently editing cell position (if any) */
  editingCell?: CellPosition | null
  /** Handler for saving cell edits */
  onCellEditSave?: (rowIndex: number, columnIndex: number, newValue: string) => void
  /** Handler for cancelling cell edits */
  onCellEditCancel?: () => void
  /** Handler for starting cell edit (double-click) */
  onCellDoubleClick?: (rowIndex: number, columnIndex: number) => void
}

/** Props for the default cell wrapper - exported for custom renderers to use */
export interface DefaultCellWrapperProps<T> {
  rowIndex: number
  columnIndex: number
  style: CSSProperties
  column: ColumnDefinition<T>
  isSelected: boolean
  selectionBorders: SelectionBorders | null
  onMouseDown: (e: React.MouseEvent) => void
  onDoubleClick?: (e: React.MouseEvent) => void
  children: React.ReactNode
  isLastColumn: boolean
}

/** Default cell wrapper component - exported for custom renderers to compose with */
export function DefaultCellWrapper<T>({
  rowIndex,
  columnIndex,
  style,
  column,
  isSelected,
  selectionBorders,
  onMouseDown,
  onDoubleClick,
  children,
  isLastColumn,
}: DefaultCellWrapperProps<T>) {
  const hideRightBorder = isLastColumn

  return (
    <Box
      data-row-index={rowIndex}
      data-column-index={columnIndex}
      style={style}
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      sx={{
        display: 'flex',
        alignItems: 'center',
        bgcolor: isSelected ? 'action.selected' : 'background.paper',
        position: 'relative',
        zIndex: selectionBorders ? 1 : undefined,
        borderBottom: selectionBorders?.bottom ? 'none' : '1px solid',
        borderRight: hideRightBorder || selectionBorders?.right ? 'none' : '1px solid',
        borderRightColor: 'divider',
        borderLeft: selectionBorders?.left ? 'none' : undefined,
        borderBottomColor: 'divider',
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
        userSelect: 'none',
        ...column.cellSx
      }}
    >
      {children}
    </Box>
  )
}

function GridCellInner<T>({
  columnIndex,
  rowIndex,
  style,
  itemsRef,
  columnsRef,
  selectionRef,
  handleCellMouseDownRef,
  onRowClickRef,
  placeholderContentRef,
  headerHeight,
  editingCell,
  onCellEditSave,
  onCellEditCancel,
  onCellDoubleClick,
}: GridCellProps<T>) {
  const currentItems = itemsRef.current
  const currentColumns = columnsRef.current
  const currentOnRowClick = onRowClickRef.current
  const currentPlaceholder = placeholderContentRef.current
  const currentSelection = selectionRef.current
  const currentHandleCellMouseDown = handleCellMouseDownRef.current

  // Get selection border info for Excel-style outline
  const selectionBorders = getSelectionBorders({ rowIndex, columnIndex }, currentSelection)
  // Check if this cell is selected but not the start of the selection
  const isSelectedNotStart = selectionBorders !== null && currentSelection !== null &&
    !(rowIndex === currentSelection.start.rowIndex && columnIndex === currentSelection.start.columnIndex)

  // Offset cell position by header height
  const offsetStyle: CSSProperties = {
    ...style,
    top: typeof style.top === 'number' ? style.top + headerHeight : style.top,
  }

  const item = currentItems.get(rowIndex)
  const column = currentColumns[columnIndex]

  if (!column) return null

  const isLastColumn = columnIndex === currentColumns.length - 1
  const hideRightBorder = isLastColumn

  // Check if this cell is currently being edited
  const isEditing = editingCell?.rowIndex === rowIndex && editingCell?.columnIndex === columnIndex

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
    currentHandleCellMouseDown(rowIndex, columnIndex, e)
    if (currentOnRowClick) {
      currentOnRowClick(item, rowIndex)
    }
  }

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (onCellDoubleClick && column.editable) {
      e.preventDefault()
      onCellDoubleClick(rowIndex, columnIndex)
    }
  }

  // Render editor if this cell is being edited
  if (isEditing && column.editable && onCellEditSave && onCellEditCancel) {
    const cellValue = column.getCellValue
      ? column.getCellValue(item, rowIndex)
      : String(column.render(item, rowIndex) ?? '')

    // Use custom editor if provided, otherwise use default Editor
    if (column.editor) {
      return (
        <>
          {column.editor({
            item,
            value: cellValue,
            rowIndex,
            columnIndex,
            style: offsetStyle,
            column,
            selectionBorders,
            onSave: (newValue) => onCellEditSave(rowIndex, columnIndex, newValue),
            onCancel: onCellEditCancel,
          })}
        </>
      )
    }

    return (
      <Editor
        value={cellValue}
        onSave={(newValue) => onCellEditSave(rowIndex, columnIndex, newValue)}
        onCancel={onCellEditCancel}
        rowIndex={rowIndex}
        columnIndex={columnIndex}
        style={offsetStyle}
        column={column}
        selectionBorders={selectionBorders}
        onMouseDown={handleMouseDown}
      />
    )
  }

  // Use custom cell renderer if provided
  if (column.cellRenderer) {
    return (
      <>
        {column.cellRenderer({
          item,
          rowIndex,
          columnIndex,
          style: offsetStyle,
          column,
          isSelected: isSelectedNotStart,
          selectionBorders,
          onMouseDown: handleMouseDown,
        })}
      </>
    )
  }

  // Default cell rendering
  return (
    <DefaultCellWrapper
      rowIndex={rowIndex}
      columnIndex={columnIndex}
      style={offsetStyle}
      column={column}
      isSelected={isSelectedNotStart}
      selectionBorders={selectionBorders}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      isLastColumn={isLastColumn}
    >
      {column.render(item, rowIndex)}
    </DefaultCellWrapper>
  )
}

// Export as a generic component factory to preserve type safety with refs
export function createGridCell<T>(): React.FC<GridCellProps<T>> {
  return GridCellInner as React.FC<GridCellProps<T>>
}

// Default export for simple usage
export default GridCellInner
