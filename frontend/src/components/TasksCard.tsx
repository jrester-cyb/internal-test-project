import { Typography } from '@mui/material'
import CollapsibleCard from '@app/components/CollapsibleCard'

interface TasksCardProps {
  defaultOpen?: boolean
  open?: boolean
  onToggle?: () => void
  headerAction?: React.ReactNode
}

export default function TasksCard({ defaultOpen = true, open, onToggle, headerAction }: TasksCardProps) {
  return (
    <CollapsibleCard
      title="Tasks"
      defaultOpen={defaultOpen}
      open={open}
      onToggle={onToggle}
      headerAction={headerAction}
    >
      <Typography color="text.secondary" variant="body2">
        No tasks assigned
      </Typography>
    </CollapsibleCard>
  )
}
