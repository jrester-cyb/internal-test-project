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
          display: 'flex',
          flexDirection: isOpen ? 'row' : 'column',
          justifyContent: 'center',
          alignItems: 'center',
          px: 2.5,
          py: 1.5,
          gap: isOpen ? 3 : 0.5,
          position: 'relative',
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
            justifyContent: 'center',
          }}
        >
          {icon}
        </ListItemIcon>
        <ListItemText
          primary={label}
          sx={{
            '& .MuiListItemText-primary': {
              textAlign: 'center',
              lineHeight: 1.2,
              fontSize: isOpen ? '1rem' : '0.6rem',
              whiteSpace: 'normal',
              wordBreak: 'normal',
            },
          }}
        />
      </ListItemButton>
    </ListItem>
  )
}