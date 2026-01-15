import { Card, CardContent, CardHeader, Typography } from '@mui/material'

interface FilesCardProps {
  // Add props as needed for files functionality
}

export default function FilesCard({ }: FilesCardProps) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardHeader title="Files" />
      <CardContent>
        <Typography color="text.secondary" variant="body2">
          No files attached
        </Typography>
      </CardContent>
    </Card>
  )
}