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
          color: 'primary.contrastText',
          opacity: 0.7,
          '&.Mui-selected': {
            color: 'inherit',
            opacity: 1,
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
