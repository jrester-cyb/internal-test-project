import { Card, CardContent, CardHeader, Typography } from '@mui/material'

interface TasksCardProps {
  // Add props as needed for tasks functionality
}

export default function TasksCard({ }: TasksCardProps) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardHeader title="Tasks" />
      <CardContent>
        <Typography color="text.secondary" variant="body2">
          No tasks assigned
        </Typography>
      </CardContent>
    </Card>
  )
}