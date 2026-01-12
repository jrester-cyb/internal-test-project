import { type ReactNode } from 'react'
import { Box, Button, Stack, IconButton, Menu, MenuItem, Collapse, Tooltip } from '@mui/material'
import { MoreVert as MoreVertIcon } from '@mui/icons-material'

// Generic action button type
export interface ActionButtonConfig {
  label: string
  icon?: ReactNode
  onClick: () => void
  color?: 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success' | 'inherit'
  variant?: 'text' | 'outlined' | 'contained'
  disabled?: boolean
  collapseThreshold?: number // Show as button when width <= this value (for responsive mode)
}

interface ActionButtonsProps {
  actions: ActionButtonConfig[]
  // For responsive mode with collapsing buttons
  width?: number
  menuAnchorEl?: HTMLElement | null
  setMenuAnchorEl?: (el: HTMLElement | null) => void
  // For simple mode (always show all buttons)
  simple?: boolean
  size?: 'small' | 'medium' | 'large'
  spacing?: number
  // When true, buttons show when width >= threshold (for pixel widths)
  // When false (default), buttons show when width <= threshold (for percentage widths)
  showWhenWider?: boolean
  // When true, render as icon buttons with tooltips instead of full buttons
  iconOnly?: boolean
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
  showWhenWider = false,
  iconOnly = false
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

  // Helper to check if button should be visible
  const isButtonVisible = (threshold: number) => {
    if (showWhenWider) {
      return width >= threshold // Show when container is wide enough (pixel mode)
    }
    return width <= threshold // Show when panel is small enough (percentage mode)
  }

  // Helper to check if menu should be visible (any button is hidden)
  const isMenuVisible = () => {
    if (showWhenWider) {
      const maxThreshold = Math.max(...actions.map(a => a.collapseThreshold || 50))
      return width < maxThreshold // Menu shows when not all buttons fit
    }
    const minThreshold = Math.min(...actions.map(a => a.collapseThreshold || 50))
    return width > minThreshold // Menu shows when any button is collapsed
  }

  return (
    <Stack direction="row" sx={{ overflow: 'hidden', alignItems: 'center' }}>
      {actions.map((action, index) => (
        <Collapse key={index} in={isButtonVisible(action.collapseThreshold || 50)} orientation="horizontal" timeout={250}>
          {iconOnly && action.icon ? (
            <Tooltip title={action.label}>
              <IconButton
                size={size}
                color={action.color || 'primary'}
                onClick={action.onClick}
                disabled={action.disabled}
                sx={{ mr: 0.5 }}
              >
                {action.icon}
              </IconButton>
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
        <MoreVertIcon />
      </IconButton>
      <Menu
        anchorEl={menuAnchorEl}
        open={Boolean(menuAnchorEl)}
        onClose={() => setMenuAnchorEl(null)}
      >
        {actions.map((action, index) => {
          // Only show in menu if button is hidden
          if (isButtonVisible(action.collapseThreshold || 50)) return null

          return (
            <MenuItem
              key={index}
              onClick={() => { action.onClick(); setMenuAnchorEl(null); }}
              disabled={action.disabled}
            >
              {action.icon && (
                <Box component="span" sx={{ mr: 1, display: 'flex', alignItems: 'center', fontSize: 'small' }}>
                  {action.icon}
                </Box>
              )}
              {action.label}
            </MenuItem>
          )
        })}
      </Menu>
    </Stack>
  )
}
