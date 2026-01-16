import React, { forwardRef, createContext, useContext, type CSSProperties } from 'react'
import { Box, IconButton, Badge } from '@mui/material'
import { FilterList as FilterIcon } from '@mui/icons-material'
import type { ColumnDefinition, ColumnFilters, SelectionRange } from './types'
import { ResizeHandle } from './ResizeHandle'

// Context to pass header config to the custom outer element
export interface StickyHeaderContextValue {
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

export const StickyHeaderContext = createContext<StickyHeaderContextValue | null>(null)

// Default context value for when sticky header is disabled
export const defaultStickyHeaderContext: StickyHeaderContextValue = {
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

// Custom inner element for react-window
export const StickyInnerElement = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { style?: CSSProperties }>(
  ({ style, children, ...rest }, ref) => {
    return (
      <div
        ref={ref}
        style={style}
        {...rest}
      >
        {children}
      </div>
    )
  }
)

// Custom outer element that includes a sticky header row
export const StickyHeaderOuterElement = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
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
