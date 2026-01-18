import { type ReactNode, Fragment, useState, type ElementType, type ComponentPropsWithoutRef } from 'react'
import { Box, Button, Stack, IconButton, Menu, MenuItem, Collapse, Tooltip, Divider } from '@mui/material'
import { MoreVert as MoreVertIcon, ChevronRight as ChevronRightIcon } from '@mui/icons-material'

export interface SubMenuItem {
  id: string
  label: string
  icon?: ReactNode
  selected?: boolean
  disabled?: boolean
  // Either onClick OR submenu, not both
  onClick?: () => void // Called when clicked (only if no submenu)
  submenu?: SubMenuItem[] // If present, clicking opens this submenu (onClick ignored)
  dividerAfter?: boolean
  dividerBefore?: boolean
}

// Base action button properties
interface ActionButtonBaseConfig {
  label: string
  icon?: ReactNode
  // Either onClick OR submenu, not both
  onClick?: (event?: React.MouseEvent<HTMLElement>) => void // Called when clicked (only if no submenu)
  color?: 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success' | 'inherit'
  variant?: 'text' | 'outlined' | 'contained'
  disabled?: boolean
  tooltip?: string // Custom tooltip text, falls back to label if not provided
  /** Minimum width required to show this button. Button shows when width >= this value.
   *  Use Infinity to always keep in menu, 0 to always show as button.
   *  For responsive mode: if < 100, treated as percentage; if >= 100, treated as pixels */
  minWidth?: number
  dividerBefore?: boolean // Show a divider before this item in the menu
  dividerAfter?: boolean // Show a divider after this item in the menu
  customComponent?: ReactNode // Custom component to render instead of default button/icon
  keepMenuOpen?: boolean // If true, don't close the parent menu when this item is clicked (only if no submenu)
  submenu?: SubMenuItem[] // If present, clicking opens this submenu (onClick and keepMenuOpen ignored)
}

// Action with custom component - extends base with component props
interface ActionButtonWithComponent<C extends ElementType = 'button'> extends ActionButtonBaseConfig {
  /** Custom component to render the MenuItem as (e.g., 'a' for links). All props of that component are available. */
  component: C
}

// Standard action without custom component
interface ActionButtonStandard extends ActionButtonBaseConfig {
  component?: never
}

// Union type that allows either standard config or config with component + its props
export type ActionButtonConfig<C extends ElementType = ElementType> =
  | ActionButtonStandard
  | (ActionButtonWithComponent<C> & Omit<ComponentPropsWithoutRef<C>, keyof ActionButtonBaseConfig | 'component'>)

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
  const [submenuAnchors, setSubmenuAnchors] = useState<Record<number, HTMLElement | null>>({})
  const [initialWidth] = useState(width) // Capture initial width to prevent flash

  // Always use internal menu state now
  const currentMenuAnchor = internalMenuAnchor
  const setCurrentMenuAnchor = setInternalMenuAnchor

  const handleSubmenuOpen = (index: number, anchorEl: HTMLElement) => {
    setSubmenuAnchors(prev => ({ ...prev, [index]: anchorEl }))
  }

  const handleSubmenuClose = (index: number) => {
    setSubmenuAnchors(prev => ({ ...prev, [index]: null }))
  }

  // Simple percentage-based breakpoint logic
  const isButtonVisible = (minWidth: number) => {
    if (minWidth === 0) return true
    if (minWidth === Infinity) return false
    return width >= minWidth
  }

  // Menu shows when any button is hidden
  const isMenuVisible = () => actions.some(a => !isButtonVisible(a.minWidth ?? 0))

  // Submenu rendering component
  const SubMenuRenderer = ({ items, onClose }: { items: SubMenuItem[]; onClose: () => void }) => {
    const [submenuAnchor, setSubmenuAnchor] = useState<{ anchorEl: HTMLElement; item: SubMenuItem } | null>(null)

    const handleItemClick = (item: SubMenuItem, event: React.MouseEvent<HTMLElement>) => {
      if (item.submenu) {
        // Open submenu
        setSubmenuAnchor({ anchorEl: event.currentTarget, item })
      } else if (item.onClick) {
        // Execute action and close all menus
        item.onClick()
        setSubmenuAnchor(null)
        onClose()
      }
    }

    // Determine submenu position based on available space
    const getSubmenuPosition = () => {
      if (!submenuAnchor) return { anchorOrigin: { vertical: 'top' as const, horizontal: 'right' as const }, transformOrigin: { vertical: 'top' as const, horizontal: 'left' as const } }

      const rect = submenuAnchor.anchorEl.getBoundingClientRect()
      const screenWidth = window.innerWidth
      const estimatedSubmenuWidth = 250 // Approximate submenu width
      const spaceOnRight = screenWidth - rect.right
      const spaceOnLeft = rect.left

      // Open to the left if not enough space on the right
      if (spaceOnRight < estimatedSubmenuWidth && spaceOnLeft > spaceOnRight) {
        return {
          anchorOrigin: { vertical: 'top' as const, horizontal: 'left' as const },
          transformOrigin: { vertical: 'top' as const, horizontal: 'right' as const }
        }
      }

      // Default: open to the right
      return {
        anchorOrigin: { vertical: 'top' as const, horizontal: 'right' as const },
        transformOrigin: { vertical: 'top' as const, horizontal: 'left' as const }
      }
    }

    const submenuPosition = getSubmenuPosition()

    return (
      <>
        {items.map((item, index) => (
          <Fragment key={item.id}>
            {item.dividerBefore && <Divider />}
            <MenuItem
              selected={item.selected}
              disabled={item.disabled}
              onClick={(e) => handleItemClick(item, e)}
            >
              {item.icon && (
                <Box component="span" sx={{ mr: 1, display: 'flex', alignItems: 'center', fontSize: 'small' }}>
                  {item.icon}
                </Box>
              )}
              {item.label}
              {item.submenu && (
                <ChevronRightIcon sx={{ ml: 'auto', fontSize: 'small' }} />
              )}
            </MenuItem>
            {item.dividerAfter && <Divider />}
          </Fragment>
        ))}

        {/* Nested submenu */}
        {submenuAnchor && submenuAnchor.item.submenu && (
          <Menu
            anchorEl={submenuAnchor.anchorEl}
            open={true}
            onClose={() => setSubmenuAnchor(null)}
            anchorOrigin={submenuPosition.anchorOrigin}
            transformOrigin={submenuPosition.transformOrigin}
          >
            <SubMenuRenderer items={submenuAnchor.item.submenu} onClose={() => { setSubmenuAnchor(null); onClose(); }} />
          </Menu>
        )}
      </>
    )
  }

  return (
    <Stack direction="row" sx={{ overflow: 'hidden', alignItems: 'center' }}>
      {actions.map((action, index) => {
        const handleButtonClick = (e: React.MouseEvent<HTMLElement>) => {
          if (action.submenu) {
            // Open submenu for visible button
            handleSubmenuOpen(index, e.currentTarget)
          } else if (action.onClick) {
            action.onClick(e)
          }
        }

        // Only render if button would be visible initially or is currently transitioning
        const shouldRender = isButtonVisible(action.minWidth ?? 0) || (action.minWidth ?? 0) <= initialWidth
        if (!shouldRender) return null

        return (
          <Fragment key={index}>
            <Collapse in={isButtonVisible(action.minWidth ?? 0)} orientation="horizontal" timeout={250}>
              {action.customComponent ? (
                <Box
                  onClick={handleButtonClick}
                  sx={{
                    display: 'inline-flex',
                    cursor: action.submenu ? 'pointer' : 'default',
                    '& > *': { pointerEvents: 'none' } // Prevent child from intercepting clicks
                  }}
                >
                  {action.customComponent}
                </Box>
              ) : iconOnly && action.icon ? (
                <Tooltip title={action.tooltip || action.label} arrow>
                  <span>
                    <IconButton
                      size={size}
                      color={action.color || 'primary'}
                      onClick={handleButtonClick}
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
                      onClick={handleButtonClick}
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
                  onClick={handleButtonClick}
                  disabled={action.disabled}
                  sx={{ whiteSpace: 'nowrap', mr: 1 }}
                >
                  {action.label}
                </Button>
              )}
            </Collapse>

            {/* Submenu for visible buttons */}
            {isButtonVisible(action.minWidth ?? 0) && action.submenu && (
              <Menu
                anchorEl={submenuAnchors[index]}
                open={Boolean(submenuAnchors[index])}
                onClose={() => handleSubmenuClose(index)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                transformOrigin={{ vertical: 'top', horizontal: 'left' }}
              >
                <SubMenuRenderer
                  items={action.submenu}
                  onClose={() => handleSubmenuClose(index)}
                />
              </Menu>
            )}
          </Fragment>
        )
      })}
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

          // Destructure known props, spread the rest to the component
          const {
            label,
            icon,
            onClick,
            color,
            variant,
            disabled,
            tooltip,
            minWidth,
            dividerBefore,
            dividerAfter,
            customComponent,
            keepMenuOpen,
            submenu,
            component,
            ...componentProps
          } = action as ActionButtonConfig & { component?: ElementType }

          const handleActionClick = (e: React.MouseEvent<HTMLElement>) => {
            if (submenu) {
              // Open submenu
              handleSubmenuOpen(index, e.currentTarget)
            } else if (onClick) {
              // Execute action
              onClick(e)
              if (!keepMenuOpen) {
                setCurrentMenuAnchor(null)
              }
            } else if (component) {
              // For link components, close the menu after click
              if (!keepMenuOpen) {
                setCurrentMenuAnchor(null)
              }
            }
          }

          return (
            <Fragment key={index}>
              {hasVisibleItemAbove && <Divider />}
              <Tooltip
                title={tooltip && disabled ? tooltip : ''}
                arrow
                placement="left"
                disableHoverListener={!tooltip || !disabled}
                enterDelay={0}
                leaveDelay={200}
              >
                <span>
                  <MenuItem
                    onClick={handleActionClick}
                    disabled={disabled}
                    component={component}
                    {...componentProps}
                  >
                    {icon && (
                      <Box component="span" sx={{ mr: 1, display: 'flex', alignItems: 'center', fontSize: 'small' }}>
                        {icon}
                      </Box>
                    )}
                    {label}
                    {submenu && (
                      <ChevronRightIcon sx={{ ml: 'auto', fontSize: 'small' }} />
                    )}
                  </MenuItem>
                </span>
              </Tooltip>
              {dividerAfter && <Divider />}

              {/* Submenu for this action */}
              {submenu && (
                <Menu
                  anchorEl={submenuAnchors[index]}
                  open={Boolean(submenuAnchors[index])}
                  onClose={() => handleSubmenuClose(index)}
                  anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
                  transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                >
                  <SubMenuRenderer
                    items={submenu}
                    onClose={() => {
                      handleSubmenuClose(index)
                      setCurrentMenuAnchor(null)
                    }}
                  />
                </Menu>
              )}
            </Fragment>
          )
        })}
      </Menu>
    </Stack>
  )
}
