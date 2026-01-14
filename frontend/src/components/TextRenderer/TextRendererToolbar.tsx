import { useState } from 'react'
import { Box, IconButton, Tooltip, alpha, useTheme } from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import CheckIcon from '@mui/icons-material/Check'
import FullscreenIcon from '@mui/icons-material/Fullscreen'
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit'
import { useTextRenderer } from './context'

interface TextRendererToolbarProps {
  enableFullscreen?: boolean
}

export default function TextRendererToolbar({ enableFullscreen = true }: Readonly<TextRendererToolbarProps>) {
  const theme = useTheme()
  const {
    localText,
    isFullscreen,
    setIsFullscreen,
    exitFullscreen,
    onCopy
  } = useTextRenderer()


  const handleCopy = async () => {
    await navigator.clipboard.writeText(localText)
    onCopy?.(localText);
  }

  const handleFullscreenToggle = () => {
    if (isFullscreen) {
      exitFullscreen()
    } else {
      setIsFullscreen(true)
    }
  }

  return (
    <Box sx={{
      position: 'absolute',
      top: 2,
      right: 2,
      zIndex: 2,
      display: 'flex',
      gap: 0.25,
      bgcolor: alpha(theme.palette.background.paper, 0.9),
      borderRadius: 0.5,
      p: 0.125,
    }}>
      <Tooltip title="Copy" arrow>
        <IconButton
          size="small"
          onClick={handleCopy}
          sx={{
            color: 'text.secondary',
            '&:hover': { color: 'text.primary' },
            p: 0.25,
          }}
        >
          <ContentCopyIcon sx={{ fontSize: 14 }} />
        </IconButton>
      </Tooltip>
      {enableFullscreen && (
        <Tooltip title={isFullscreen ? "Exit fullscreen (Esc)" : "Fullscreen"} arrow placement="bottom">
          <IconButton
            size="small"
            onClick={handleFullscreenToggle}
            sx={{
              color: 'text.secondary',
              '&:hover': { color: 'text.primary' },
              p: 0.25,
            }}
          >
            {isFullscreen ? <FullscreenExitIcon sx={{ fontSize: 14 }} /> : <FullscreenIcon sx={{ fontSize: 14 }} />}
          </IconButton>
        </Tooltip>
      )}
    </Box>
  )
}
