import { type ReactNode, Fragment } from 'react'
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
   *  Use Infinity to always keep in menu, 0 to always show as button. */
  minWidth?: number
  dividerBefore?: boolean // Show a divider before this item in the menu
}

interface ActionButtonsProps {
  actions: ActionButtonConfig[]
  // For responsive mode with collapsing buttons - the current container width
  width?: number
  menuAnchorEl?: HTMLElement | null
  setMenuAnchorEl?: (el: HTMLElement | null) => void
  // For simple mode (always show all buttons)
  simple?: boolean
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
  menuAnchorEl,
  setMenuAnchorEl,
  simple = false,
  size = 'small',
  spacing = 1,
  iconOnly = false,
  menuIcon = <MoreVertIcon />
}: ActionButtonsProps) {
  // Simple mode - just render all buttons
  if (simple) {
    return (
      <Stack direction="row" spacing={spacing} sx={{ alignItems: 'center' }}>
        {actions.map((action, index) => (
          iconOnly && action.icon ? (
            <Tooltip key={index} title={action.label}>
              <IconButton
                size={size}
                color={action.color || 'primary'}
                onClick={action.onClick}
                disabled={action.disabled}
              >
                {action.icon}
              </IconButton>
            </Tooltip>
          ) : (
            <Button
              key={index}
              size={size}
              variant={action.variant || 'outlined'}
              color={action.color || 'primary'}
              startIcon={action.icon}
              onClick={action.onClick}
              disabled={action.disabled}
              sx={{ whiteSpace: 'nowrap' }}
            >
              {action.label}
            </Button>
          )
        ))}
      </Stack>
    )
  }

  // Responsive mode with collapse
  if (width === undefined || !setMenuAnchorEl) {
    console.warn('ActionButtons: width and setMenuAnchorEl are required for responsive mode')
    return null
  }

  // Button shows when width >= minWidth (simple, consistent logic)
  const isButtonVisible = (minWidth: number) => width >= minWidth

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
        onClick={(e) => setMenuAnchorEl(e.currentTarget)}
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
        anchorEl={menuAnchorEl}
        open={Boolean(menuAnchorEl)}
        onClose={() => setMenuAnchorEl(null)}
      >
        {actions.map((action, index) => {
          // Only show in menu if button is hidden
          if (isButtonVisible(action.minWidth ?? 0)) return null

          // Only show divider if there's a visible item above this one
          const hasVisibleItemAbove = action.dividerBefore && actions.slice(0, index).some(a => !isButtonVisible(a.minWidth ?? 0))

          return (
            <Fragment key={index}>
              {hasVisibleItemAbove && <Divider />}
              <MenuItem
                onClick={(e) => { action.onClick(e); setMenuAnchorEl(null); }}
                disabled={action.disabled}
              >
                {action.icon && (
                  <Box component="span" sx={{ mr: 1, display: 'flex', alignItems: 'center', fontSize: 'small' }}>
                    {action.icon}
                  </Box>
                )}
                {action.label}
              </MenuItem>
            </Fragment>
          )
        })}
      </Menu>
    </Stack>
  )
}
