import type { ReactNode } from 'react'
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  IconButton,
  Typography,
  CircularProgress,
  Paper
} from '@mui/material'
import { Delete as DeleteIcon } from '@mui/icons-material'

export interface Column<T> {
  key: string
  header: string
  width?: string | number
  render?: (item: T) => ReactNode
}

interface SimpleTableProps<T extends { id: string }> {
  items: T[]
  columns: Column<T>[]
  loading?: boolean
  emptyMessage?: string
  selectedId?: string
  onSelect?: (item: T) => void
  onDelete?: (item: T) => void
  maxHeight?: number | string
}

function TableContent<T extends { id: string }>({
  items,
  columns,
  loading,
  emptyMessage,
  selectedId,
  onSelect,
  onDelete,
  hasActions
}: Readonly<{
  items: T[]
  columns: Column<T>[]
  loading: boolean
  emptyMessage: string
  selectedId?: string
  onSelect?: (item: T) => void
  onDelete?: (item: T) => void
  hasActions: boolean
}>) {
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 4 }}>
        <CircularProgress size={24} />
      </Box>
    )
  }

  if (items.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 4 }}>
        <Typography variant="body2" color="text.secondary">
          {emptyMessage}
        </Typography>
      </Box>
    )
  }

  return (
    <Table size="small" sx={{ tableLayout: 'fixed' }}>
      <TableBody>
        {items.map((item) => (
          <TableRow
            key={item.id}
            hover
            selected={selectedId === item.id}
            onClick={() => onSelect?.(item)}
            sx={{ cursor: onSelect ? 'pointer' : 'default' }}
          >
            {columns.map((col) => (
              <TableCell key={col.key} sx={{ width: col.width }}>
                {col.render ? col.render(item) : (item as Record<string, unknown>)[col.key] as ReactNode}
              </TableCell>
            ))}
            {hasActions && (
              <TableCell sx={{ width: 48, textAlign: 'right', pr: 1 }}>
                {onDelete && (
                  <IconButton
                    size="small"
                    color="error"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(item)
                    }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                )}
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export default function SimpleTable<T extends { id: string }>({
  items,
  columns,
  loading = false,
  emptyMessage = 'No items',
  selectedId,
  onSelect,
  onDelete,
  maxHeight = 300
}: Readonly<SimpleTableProps<T>>) {
  const hasActions = !!onDelete

  return (
    <Box
      component={Paper}
      variant="outlined"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        maxHeight,
        overflow: 'hidden'
      }}
    >
      {/* Table Header */}
      <Table size="small" sx={{ tableLayout: 'fixed' }}>
        <TableHead>
          <TableRow>
            {columns.map((col) => (
              <TableCell
                key={col.key}
                sx={{ fontWeight: 600, width: col.width, bgcolor: 'background.default' }}
              >
                {col.header}
              </TableCell>
            ))}
            {hasActions && (
              <TableCell sx={{ width: 48, bgcolor: 'background.default' }} />
            )}
          </TableRow>
        </TableHead>
      </Table>

      {/* Table Body */}
      <Box sx={{ overflow: 'auto', flexGrow: 1 }}>
        <TableContent
          items={items}
          columns={columns}
          loading={loading}
          emptyMessage={emptyMessage}
          selectedId={selectedId}
          onSelect={onSelect}
          onDelete={onDelete}
          hasActions={hasActions}
        />
      </Box>
    </Box>
  )
}
