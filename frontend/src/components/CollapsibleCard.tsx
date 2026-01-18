import { type ReactNode, useState } from 'react'
import { Card, CardHeader, CardContent, Collapse, IconButton, type SxProps, type Theme } from '@mui/material'
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material'

interface CollapsibleCardProps {
  title: string | ReactNode
  children: ReactNode
  /** Initial open state (for uncontrolled mode) */
  defaultOpen?: boolean
  /** Controlled open state - if provided, component becomes controlled */
  open?: boolean
  /** Callback when the card is toggled */
  onToggle?: () => void
  /** Additional actions to display in the header */
  headerAction?: ReactNode
  /** Custom sx for the Card */
  sx?: SxProps<Theme>
  /** Custom sx for the CardContent */
  contentSx?: SxProps<Theme>
  /** If true, removes padding from CardContent */
  disableContentPadding?: boolean
}

export default function CollapsibleCard({
  title,
  children,
  defaultOpen = true,
  open: controlledOpen,
  onToggle,
  headerAction,
  sx,
  contentSx,
  disableContentPadding = false,
}: CollapsibleCardProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen)

  // Use controlled state if provided, otherwise use internal state
  const isControlled = controlledOpen !== undefined
  const isOpen = isControlled ? controlledOpen : internalOpen

  const handleToggle = () => {
    if (isControlled) {
      onToggle?.()
    } else {
      setInternalOpen(prev => !prev)
      onToggle?.()
    }
  }

  return (
    <Card sx={{ display: 'flex', flexDirection: 'column', ...sx }}>
      <CardHeader
        sx={{
          '& .MuiCardHeader-avatar': {
            marginRight: 0.5,
          },
        }}
        avatar={
          <IconButton
            onClick={handleToggle}
            size="small"
            sx={{
              transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s',
              ml: -1,
            }}
          >
            <ExpandMoreIcon />
          </IconButton>
        }
        title={title}
        titleTypographyProps={{ variant: 'h6' }}
        action={headerAction}
      />
      <Collapse in={isOpen}>
        <CardContent
          sx={{
            flex: 1,
            overflow: 'hidden',
            ...(disableContentPadding && { p: 0, '&:last-child': { pb: 0 } }),
            ...contentSx,
          }}
        >
          {children}
        </CardContent>
      </Collapse>
    </Card>
  )
}
