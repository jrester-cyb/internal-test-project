import { ListItem, ListItemButton, ListItemIcon, ListItemText } from '@mui/material'
import { NavLink } from 'react-router-dom'
import { type ReactElement, useEffect, useState } from 'react'
import { useSidebar } from '@app/contexts/SidebarContext'

interface SidebarNavItemProps {
  to: string
  icon: ReactElement
  label: string
}

export default function SidebarNavItem({ to, icon, label }: SidebarNavItemProps) {
  const { isOpen, isMobile, setIsOpen } = useSidebar()
  return (
    <ListItem disablePadding>
      <ListItemButton
        component={NavLink}
        to={to}
        onClick={() => { if (isMobile) setIsOpen(false) }}
        sx={{
          color: 'inherit',
          minHeight: 48,
          display: 'flex',
          flexDirection: isMobile ? 'row' : (isOpen ? 'row' : 'column'),
          justifyContent: 'center',
          alignItems: 'center',
          px: 2.5,
          py: 1.5,
          gap: isOpen ? 3 : 0.5,
          position: 'relative',
          transition: `gap 0.15s ${isOpen ? 'ease-out' : 'ease-in'}, padding 0.15s ${isOpen ? 'ease-out' : 'ease-in'}`,
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
            opacity: isOpen ? 1 : 0.8,
            transition: `opacity 0.2s ${isOpen ? 'ease-out' : 'ease-in'}, font-size 0.2s ${isOpen ? 'ease-out' : 'ease-in'}`,
            '& .MuiListItemText-primary': {
              textAlign: 'center',
              lineHeight: 1.2,
              fontSize: isOpen ? '1rem' : '0.6rem',
              whiteSpace: 'normal',
              wordBreak: 'normal',
              transition: `font-size 0.2s ${isOpen ? 'ease-out' : 'ease-in'}`,
            },
          }}
        />
      </ListItemButton>
    </ListItem>
  )
}