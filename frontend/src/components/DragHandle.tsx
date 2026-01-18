import { Box, Tooltip } from '@mui/material'
import { DragHandle as DragHandleIcon } from '@mui/icons-material'

interface DragHandleProps {
  attributes: any
  listeners: any
}

export default function DragHandle({ attributes, listeners }: DragHandleProps) {
  return (
    <Tooltip title="Drag to reorder cards">
      <Box
        {...attributes}
        {...listeners}
        sx={{
          cursor: 'grab',
          '&:active': { cursor: 'grabbing' },
          p: 0.5,
          borderRadius: 1,
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <DragHandleIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
      </Box>
    </Tooltip>
  )
}
