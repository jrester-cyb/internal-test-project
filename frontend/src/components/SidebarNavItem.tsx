import { ListItem, ListItemButton, ListItemIcon, ListItemText } from '@mui/material'
import { NavLink } from 'react-router-dom'
import { type ReactElement } from 'react'

interface SidebarNavItemProps {
  to: string
  icon: ReactElement
  label: string
  isOpen: boolean
}

export default function SidebarNavItem({ to, icon, label, isOpen }: SidebarNavItemProps) {
  return (
    <ListItem disablePadding>
      <ListItemButton
        component={NavLink}
        to={to}
        sx={{
          color: 'inherit',
          minHeight: 48,
          height: 48,
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'initial',
          alignItems: 'center',
          px: 2.5,
          py: 1.5,
          position: 'relative',
          overflow: 'visible',
          transition: 'color 225ms cubic-bezier(0.4, 0, 0.6, 1)',
          '&:hover': {
            color: 'secondary.light',
          },
          '&.active': {
            backgroundColor: 'transparent',
            '&::before': {
              content: '""',
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: '4px',
              backgroundColor: 'secondary.light',
            },
          },
        }}
      >
        <ListItemIcon
          sx={{
            color: 'inherit',
            minWidth: 0,
            mr: isOpen ? 3 : 0,
            justifyContent: 'center',
            transform: isOpen ? 'translateY(0)' : 'translateY(-4px)',
            transition: 'margin 225ms cubic-bezier(0.4, 0, 0.6, 1), color 225ms cubic-bezier(0.4, 0, 0.6, 1), transform 225ms cubic-bezier(0.4, 0, 0.6, 1)',
          }}
        >
          {icon}
        </ListItemIcon>
        <ListItemText
          primary={label}
          sx={{
            opacity: isOpen ? 1 : 0.8,
            position: isOpen ? 'relative' : 'absolute',
            left: isOpen ? 'auto' : '50%',
            overflow: 'visible',
            minWidth: 'max-content',
            transform: isOpen ? 'none' : 'translateX(-50%)',
            transition: isOpen
              ? 'opacity 225ms cubic-bezier(0.4, 0, 0.6, 1), position 225ms cubic-bezier(0.4, 0, 0.6, 1), left 225ms cubic-bezier(0.4, 0, 0.6, 1), transform 225ms cubic-bezier(0.4, 0, 0.6, 1), color 225ms cubic-bezier(0.4, 0, 0.6, 1)'
              : 'opacity 225ms cubic-bezier(0.4, 0, 0.6, 1), left 225ms cubic-bezier(0.4, 0, 0.6, 1), transform 225ms cubic-bezier(0.4, 0, 0.6, 1), color 225ms cubic-bezier(0.4, 0, 0.6, 1)',
            animation: !isOpen ? 'slideToCenter 225ms cubic-bezier(0.4, 0, 0.6, 1) forwards' : 'none',
            '@keyframes slideToCenter': {
              '0%': {
                transform: 'translateX(0) translateY(0) scale(1)',
              },
              '40%': {
                transform: 'translateX(-12px) translateY(0) scale(1)',
              },
              '60%': {
                transform: 'translateX(-40%) translateY(0) scale(1)',
              },
              '80%': {
                transform: 'translateX(-48%) translateY(0) scale(1)',
              },
              '85%': {
                transform: 'translateX(-50%) translateY(8px) scale(0.95)',
              },
              '100%': {
                transform: 'translateX(-50%) translateY(16px) scale(0.85)',
              },
            },
            '& .MuiListItemText-primary': {
              fontSize: isOpen ? '1rem' : '0.75rem',
              textAlign: isOpen ? 'left' : 'center',
              lineHeight: 1.2,
              whiteSpace: 'nowrap',
            },
          }}
        />
      </ListItemButton>
    </ListItem>
  )
}