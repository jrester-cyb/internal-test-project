import { Box, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Drawer } from '@mui/material'
import { Map as MapIcon, Inventory as AssetsIcon } from '@mui/icons-material'
import { NavLink } from 'react-router-dom'

export default function Sidebar() {
  return (
    <Drawer
      variant="permanent"
      sx={{
        width: 240,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: 240,
          boxSizing: 'border-box',
          backgroundColor: '#003162',
          color: '#ffffff',
          '& .MuiListItemButton-root': {
            color: 'inherit',
            '&:hover': {
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
            },
            '&.active': {
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
            },
          },
          '& .MuiListItemIcon-root': {
            color: 'inherit',
          },
        },
      }}
    >
      <Box sx={{ overflow: 'auto', mt: 8 }}>
        <List>
          <ListItem disablePadding>
            <ListItemButton
              component={NavLink}
              to="/map"
            >
              <ListItemIcon>
                <MapIcon />
              </ListItemIcon>
              <ListItemText primary="Map" />
            </ListItemButton>
          </ListItem>
          <ListItem disablePadding>
            <ListItemButton
              component={NavLink}
              to="/asset-types"
            >
              <ListItemIcon>
                <AssetsIcon />
              </ListItemIcon>
              <ListItemText primary="Assets" />
            </ListItemButton>
          </ListItem>
        </List>
      </Box>
    </Drawer>
  )
}
