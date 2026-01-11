import { IconButton } from '@mui/material'
import { Brightness4 as DarkModeIcon, Brightness7 as LightModeIcon } from '@mui/icons-material'
import { useTheme } from '../contexts/ThemeContext'

export default function ThemeToggle() {
  const { isDarkMode, toggleTheme } = useTheme()

  return (
    <IconButton onClick={toggleTheme} color="inherit">
      {isDarkMode ? <LightModeIcon /> : <DarkModeIcon />}
    </IconButton>
  )
}