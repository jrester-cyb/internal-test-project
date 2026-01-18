import { Box, Tabs, Tab } from '@mui/material'
import { Link } from 'react-router-dom'

export interface NavTab {
  label: string
  to: string
  onMouseEnter?: () => void
}

interface NavTabBarProps {
  tabs: NavTab[]
  currentTab: number
}

export default function NavTabBar({ tabs, currentTab }: NavTabBarProps) {
  return (
    <Box
      sx={{
        bgcolor: 'primary.main',
        color: 'primary.contrastText',
        borderRadius: 1,
        '& .MuiTabs-indicator': {
          bgcolor: 'secondary.main',
        },
        '& .MuiTab-root': {
          color: 'rgba(255, 255, 255, 0.7)',
          '&.Mui-selected': {
            color: '#ffffff',
          },
        },
      }}
    >
      <Tabs value={currentTab} textColor="inherit">
        {tabs.map((tab, index) => (
          <Tab
            key={index}
            label={tab.label}
            component={Link}
            to={tab.to}
            onMouseEnter={tab.onMouseEnter}
          />
        ))}
      </Tabs>
    </Box>
  )
}
