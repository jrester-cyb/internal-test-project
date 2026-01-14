import { Box, IconButton, Tooltip } from '@mui/material'
import UndoIcon from '@mui/icons-material/Undo'
import RedoIcon from '@mui/icons-material/Redo'
import FullscreenIcon from '@mui/icons-material/Fullscreen'
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit'
import CodeIcon from '@mui/icons-material/Code'
import CodeOffIcon from '@mui/icons-material/CodeOff'
import { useTextRenderer } from './context'

interface TextRendererToolbarProps {
  inFullscreen?: boolean
}

export default function TextRendererToolbar({ inFullscreen = false }: TextRendererToolbarProps) {
  const {
    canUndo,
    canRedo,
    undo,
    redo,
    showRawText,
    setShowRawText,
    isFullscreen,
    setIsFullscreen,
    isDark,
  } = useTextRenderer()

  return (
    <Box sx={{
      position: 'absolute',
      top: 4,
      right: 4,
      zIndex: 1,
      display: 'flex',
      gap: 0.5,
      bgcolor: isDark ? 'grey.900' : 'grey.100',
      borderRadius: 1,
      p: 0.25,
    }}>
      <Tooltip title="Undo (Ctrl+Z)" arrow>
        <span>
          <IconButton
            size="small"
            onClick={undo}
            disabled={!canUndo}
            sx={{ color: 'text.secondary', '&:hover': { color: 'text.primary' } }}
          >
            <UndoIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Redo (Ctrl+Y)" arrow>
        <span>
          <IconButton
            size="small"
            onClick={redo}
            disabled={!canRedo}
            sx={{ color: 'text.secondary', '&:hover': { color: 'text.primary' } }}
          >
            <RedoIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Box sx={{ width: 1, bgcolor: 'divider', mx: 0.25 }} />
      <Tooltip title={showRawText ? "Show syntax highlighting" : "Show raw text"} arrow>
        <IconButton
          size="small"
          onClick={() => setShowRawText(!showRawText)}
          sx={{ color: showRawText ? (isDark ? 'secondary.main' : 'primary.main') : 'text.secondary', '&:hover': { color: 'text.primary' } }}
        >
          {showRawText ? <CodeOffIcon fontSize="small" /> : <CodeIcon fontSize="small" />}
        </IconButton>
      </Tooltip>
      <Tooltip title={inFullscreen ? "Exit fullscreen (Esc)" : "Fullscreen"} arrow>
        <IconButton
          size="small"
          onClick={() => setIsFullscreen(!isFullscreen)}
          sx={{ color: 'text.secondary', '&:hover': { color: 'text.primary' } }}
        >
          {inFullscreen ? <FullscreenExitIcon fontSize="small" /> : <FullscreenIcon fontSize="small" />}
        </IconButton>
      </Tooltip>
    </Box>
  )
}
