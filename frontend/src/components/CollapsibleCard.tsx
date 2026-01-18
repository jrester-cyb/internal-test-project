import { useState, type ReactNode } from 'react'
import { Card, CardHeader, CardContent, Collapse, IconButton, type SxProps, type Theme } from '@mui/material'
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material'

interface CollapsibleCardProps {
  title: string | ReactNode
  children: ReactNode
  /** Initial collapsed state */
  defaultExpanded?: boolean
  /** Controlled expanded state */
  expanded?: boolean
  /** Callback when expanded state changes */
  onExpandedChange?: (expanded: boolean) => void
  /** Additional actions to display in the header (rendered before the expand button) */
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
  defaultExpanded = true,
  expanded: controlledExpanded,
  onExpandedChange,
  headerAction,
  sx,
  contentSx,
  disableContentPadding = false,
}: CollapsibleCardProps) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded)

  // Support both controlled and uncontrolled modes
  const isControlled = controlledExpanded !== undefined
  const expanded = isControlled ? controlledExpanded : internalExpanded

  const handleToggle = () => {
    const newExpanded = !expanded
    if (!isControlled) {
      setInternalExpanded(newExpanded)
    }
    onExpandedChange?.(newExpanded)
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
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
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
      <Collapse in={expanded} timeout="auto">
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
