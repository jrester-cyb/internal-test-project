import { type ReactNode, Fragment, useState } from 'react'
import { Box, Button, Stack, IconButton, Menu, MenuItem, Collapse, Tooltip, Divider } from '@mui/material'
import { MoreVert as MoreVertIcon } from '@mui/icons-material'

// Generic action button type
export interface ActionButtonConfig {
  label: string
  icon?: ReactNode
  onClick: (event?: React.MouseEvent<HTMLElement>) => void
  color?: 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success' | 'inherit'
  variant?: 'text' | 'outlined' | 'contained'
  disabled?: boolean
  tooltip?: string // Custom tooltip text, falls back to label if not provided
  /** Minimum width required to show this button. Button shows when width >= this value.
   *  Use Infinity to always keep in menu, 0 to always show as button.
   *  For responsive mode: if < 100, treated as percentage; if >= 100, treated as pixels */
  minWidth?: number
  dividerBefore?: boolean // Show a divider before this item in the menu
}

interface ActionButtonsProps {
  actions: ActionButtonConfig[]
  // For responsive mode with collapsing buttons - the current container width (as percentage or pixels)
  width: number
  // Actual pixel width of the container (for better breakpoint calculations)
  actualWidth?: number
  size?: 'small' | 'medium' | 'large'
  spacing?: number
  // When true, render as icon buttons with tooltips instead of full buttons
  iconOnly?: boolean
  // Custom icon for the overflow menu button (defaults to MoreVertIcon)
  menuIcon?: ReactNode
}

// Custom component for responsive action buttons
export default function ActionButtons({
  actions,
  width,
  actualWidth,
  size = 'small',
  spacing = 1,
  iconOnly = false,
  menuIcon = <MoreVertIcon />
}: ActionButtonsProps) {
  // Internal menu state
  const [internalMenuAnchor, setInternalMenuAnchor] = useState<HTMLElement | null>(null)

  // Always use internal menu state now
  const currentMenuAnchor = internalMenuAnchor
  const setCurrentMenuAnchor = setInternalMenuAnchor

  // Simple percentage-based breakpoint logic
  const isButtonVisible = (minWidth: number) => {
    if (minWidth === 0) return true
    if (minWidth === Infinity) return false
    return width >= minWidth
  }

  // Menu shows when any button is hidden
  const isMenuVisible = () => actions.some(a => !isButtonVisible(a.minWidth ?? 0))

  return (
    <Stack direction="row" sx={{ overflow: 'hidden', alignItems: 'center' }}>
      {actions.map((action, index) => (
        <Collapse key={index} in={isButtonVisible(action.minWidth ?? 0)} orientation="horizontal" timeout={250}>
          {iconOnly && action.icon ? (
            <Tooltip title={action.tooltip || action.label} arrow>
              <span>
                <IconButton
                  size={size}
                  color={action.color || 'primary'}
                  onClick={action.onClick}
                  disabled={action.disabled}
                  sx={{ mr: 0.5 }}
                >
                  {action.icon}
                </IconButton>
              </span>
            </Tooltip>
          ) : action.tooltip && action.disabled ? (
            <Tooltip title={action.tooltip} arrow>
              <span>
                <Button
                  size={size}
                  variant={action.variant || 'outlined'}
                  color={action.color || 'primary'}
                  startIcon={action.icon}
                  onClick={action.onClick}
                  disabled={action.disabled}
                  sx={{ whiteSpace: 'nowrap', mr: 1 }}
                >
                  {action.label}
                </Button>
              </span>
            </Tooltip>
          ) : (
            <Button
              size={size}
              variant={action.variant || 'outlined'}
              color={action.color || 'primary'}
              startIcon={action.icon}
              onClick={action.onClick}
              disabled={action.disabled}
              sx={{ whiteSpace: 'nowrap', mr: 1 }}
            >
              {action.label}
            </Button>
          )}
        </Collapse>
      ))}
      <IconButton
        size={size}
        color="inherit"
        onClick={(e) => setCurrentMenuAnchor(e.currentTarget)}
        sx={{
          opacity: isMenuVisible() ? 1 : 0,
          pointerEvents: isMenuVisible() ? 'auto' : 'none',
          transition: 'opacity 150ms',
          transitionDelay: isMenuVisible() ? '105ms' : '0ms',
        }}
      >
        {menuIcon}
      </IconButton>
      <Menu
        anchorEl={currentMenuAnchor}
        open={Boolean(currentMenuAnchor)}
        onClose={() => setCurrentMenuAnchor(null)}
      >
        {actions.map((action, index) => {
          // Only show in menu if button is hidden
          if (isButtonVisible(action.minWidth ?? 0)) return null

          // Only show divider if there's a visible item above this one
          const hasVisibleItemAbove = action.dividerBefore && actions.slice(0, index).some(a => !isButtonVisible(a.minWidth ?? 0))

          return (
            <Fragment key={index}>
              {hasVisibleItemAbove && <Divider />}
              <Tooltip
                title={action.tooltip && action.disabled ? action.tooltip : ''}
                arrow
                placement="left"
                disableHoverListener={!action.tooltip || !action.disabled}
                enterDelay={0}
                leaveDelay={200}
              >
                <span>
                  <MenuItem
                    onClick={(e) => { action.onClick(e); setCurrentMenuAnchor(null); }}
                    disabled={action.disabled}
                  >
                    {action.icon && (
                      <Box component="span" sx={{ mr: 1, display: 'flex', alignItems: 'center', fontSize: 'small' }}>
                        {action.icon}
                      </Box>
                    )}
                    {action.label}
                  </MenuItem>
                </span>
              </Tooltip>
            </Fragment>
          )
        })}
      </Menu>
    </Stack>
  )
}
