import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Box, TextField } from '@mui/material'
import type { CSSProperties } from 'react'
import type { SelectionBorders, ColumnDefinition } from '@app/components/VirtualizedGrid/types'

export interface EditorProps<T> {
  /** The current value to edit */
  value: string
  /** Called when editing is complete with the new value */
  onSave: (newValue: string) => void
  /** Called when editing is cancelled */
  onCancel: () => void
  /** Row index in the grid */
  rowIndex: number
  /** Column index in the grid */
  columnIndex: number
  /** Style object for positioning */
  style: CSSProperties
  /** The column definition */
  column: ColumnDefinition<T>
  /** Selection border info */
  selectionBorders: SelectionBorders | null
  /** Mouse down handler for selection */
  onMouseDown: (e: React.MouseEvent) => void
  /** The item data for this row (used for placeholder rendering) */
  item?: T
  /** Whether the editor was opened with a replacement value (from keyboard input) - if true, don't select text */
  isReplacing?: boolean
}

export function Editor<T>({
  value,
  onSave,
  onCancel,
  rowIndex,
  columnIndex,
  style,
  column,
  selectionBorders,
  onMouseDown,
  item,
  isReplacing,
}: EditorProps<T>) {
  const [editValue, setEditValue] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)
  const isBlank = !editValue.trim()

  // Focus input on mount
  useEffect(() => {
    const input = inputRef.current
    if (!input) return

    // If replacing (opened via keyboard typing), put cursor at end
    // Otherwise (opened via double-click/F2/Enter), select all text
    if (isReplacing) {
      // For replacement mode, focus without selecting, then set cursor position
      // Use setTimeout to ensure this runs after MUI's focus handlers
      input.focus()
      setTimeout(() => {
        if (inputRef.current) {
          const len = inputRef.current.value.length
          inputRef.current.setSelectionRange(len, len)
        }
      }, 0)
    } else {
      input.focus()
      input.select()
    }
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onSave(editValue)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      // Save and exit edit mode, let the event propagate for grid navigation
      onSave(editValue)
      return // Don't stop propagation - let grid handle navigation
    } else if (e.key === 'Tab') {
      // Save and exit edit mode, let Tab propagate for column navigation
      onSave(editValue)
      return // Don't stop propagation - let grid handle Tab navigation
    }
    // Stop propagation to prevent grid keyboard navigation for other keys
    e.stopPropagation()
  }, [editValue, onSave, onCancel])

  const handleBlur = useCallback(() => {
    onSave(editValue)
  }, [editValue, onSave])

  return (
    <Box
      data-row-index={rowIndex}
      data-column-index={columnIndex}
      style={style}
      onMouseDown={onMouseDown}
      sx={{
        display: 'flex',
        alignItems: 'center',
        bgcolor: 'background.paper',
        position: 'relative',
        zIndex: 2,
        borderBottom: selectionBorders?.bottom ? 'none' : '1px solid',
        borderRight: selectionBorders?.right ? 'none' : '1px solid',
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
        boxSizing: 'border-box',
        ...column.cellSx
      }}
    >
      {isBlank && item ? (
        // Show column's renderer as placeholder when value is blank
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            pointerEvents: 'none',
            opacity: 0.5,
          }}
        >
          {column.render(item, rowIndex)}
        </Box>
      ) : null}
      <TextField
        inputRef={inputRef}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        variant="standard"
        fullWidth
        size="small"
        InputProps={{
          disableUnderline: true,
          sx: {
            px: 1,
            py: 0.5,
            fontSize: 'inherit',
            bgcolor: isBlank ? 'transparent' : undefined,
          }
        }}
      />
    </Box>
  )
}

export default Editor
