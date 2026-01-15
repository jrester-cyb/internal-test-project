import { Card, CardContent, CardHeader, Typography, Box } from '@mui/material'
import { DragHandle as DragHandleIcon } from '@mui/icons-material'

interface FilesCardProps {
  // Add props as needed for files functionality
  dragHandleProps?: {
    attributes: any
    listeners: any
  }
}

export default function FilesCard({ dragHandleProps }: FilesCardProps) {
  return (
    <Card sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <CardHeader
        title="Files"
        action={dragHandleProps && (
          <Box
            {...dragHandleProps.attributes}
            {...dragHandleProps.listeners}
            sx={{
              cursor: 'grab',
              '&:active': { cursor: 'grabbing' },
              p: 0.5,
              borderRadius: 1,
              '&:hover': { bgcolor: 'action.hover' }
            }}
          >
            <DragHandleIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
          </Box>
        )}
      />
      <CardContent sx={{ flex: 1, overflow: 'hidden' }}>
        <Typography color="text.secondary" variant="body2">
          No files attached
        </Typography>
      </CardContent>
    </Card>
  )
}