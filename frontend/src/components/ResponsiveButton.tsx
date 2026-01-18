import React from 'react'
import { Button, useMediaQuery, useTheme, type ButtonProps } from '@mui/material'
import { type Breakpoint } from '@mui/material/styles'

interface ResponsiveButtonProps {
  icon: React.ReactNode
  text: string
  onClick: () => void
  breakpoint?: Breakpoint
  variant?: ButtonProps['variant']
  color?: ButtonProps['color']
}

export default function ResponsiveButton({
  icon,
  text,
  onClick,
  breakpoint = 'md',
  variant = 'contained',
  color = 'primary',
}: ResponsiveButtonProps) {
  const theme = useTheme()
  const isLargeScreen = useMediaQuery(theme.breakpoints.up(breakpoint))

  return (
    <Button
      variant={variant}
      startIcon={isLargeScreen ? icon : undefined}
      onClick={onClick}
      color={color}
      size={isLargeScreen ? 'medium' : 'small'}
    >
      {isLargeScreen ? text : icon}
    </Button>
  )
}