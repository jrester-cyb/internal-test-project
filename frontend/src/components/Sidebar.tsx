import { useState } from 'react'
import { Box, List, Drawer, IconButton } from '@mui/material'
import { Map as MapIcon, Inventory as AssetsIcon, Menu as MenuIcon, ChevronLeft as ChevronLeftIcon } from '@mui/icons-material'
import SidebarNavItem from './SidebarNavItem'

interface SidebarProps {
  isOpen: boolean
  onToggle: (open: boolean) => void
}

export default function Sidebar({ isOpen, onToggle }: SidebarProps) {
  const drawerWidth = isOpen ? 240 : 64

  return (
    <>
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          transition: 'width 225ms cubic-bezier(0.4, 0, 0.6, 1)',
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            boxSizing: 'border-box',
            backgroundColor: '#003162',
            color: '#ffffff',
            transition: 'width 225ms cubic-bezier(0.4, 0, 0.6, 1)',
            overflowX: 'hidden',
          },
        }}
      >
        <Box sx={{ overflow: 'auto', mt: 8 }}>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', p: 1 }}>
            <IconButton
              onClick={() => onToggle(!isOpen)}
              sx={{ color: 'white' }}
            >
              {isOpen ? <ChevronLeftIcon /> : <MenuIcon />}
            </IconButton>
          </Box>
          <List>
            <SidebarNavItem
              to="/map"
              icon={<MapIcon />}
              label="Map"
              isOpen={isOpen}
            />
            <SidebarNavItem
              to="/asset-types"
              icon={<AssetsIcon />}
              label="Assets"
              isOpen={isOpen}
            />
          </List>
        </Box>
      </Drawer>
    </>
  )
}

export function useSidebarWidth() {
  // This is a workaround - ideally use context
  return 240 // Will be updated dynamically in App.tsx
}
