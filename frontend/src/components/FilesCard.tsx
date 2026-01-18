import { Typography } from '@mui/material'
import CollapsibleCard from '@app/components/CollapsibleCard'

interface FilesCardProps {
  defaultOpen?: boolean
  open?: boolean
  onToggle?: () => void
  headerAction?: React.ReactNode
}

export default function FilesCard({ defaultOpen = true, open, onToggle, headerAction }: FilesCardProps) {
  return (
    <CollapsibleCard
      title="Files"
      defaultOpen={defaultOpen}
      open={open}
      onToggle={onToggle}
      headerAction={headerAction}
    >
      <Typography color="text.secondary" variant="body2">
        No files attached
      </Typography>
    </CollapsibleCard>
  )
}
