import { useCallback, useEffect, useState } from 'react'
import { Box, Menu, MenuItem, ListItemIcon, ListItemText, Divider, IconButton, Tooltip } from '@mui/material'
import UndoIcon from '@mui/icons-material/Undo'
import RedoIcon from '@mui/icons-material/Redo'
import FullscreenIcon from '@mui/icons-material/Fullscreen'
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit'
import CodeIcon from '@mui/icons-material/Code'
import CodeOffIcon from '@mui/icons-material/CodeOff'
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh'
import CompressIcon from '@mui/icons-material/Compress'
import SortByAlphaIcon from '@mui/icons-material/SortByAlpha'
import ClearIcon from '@mui/icons-material/Clear'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import ContentCutIcon from '@mui/icons-material/ContentCut'
import ContentPasteIcon from '@mui/icons-material/ContentPaste'
import SelectAllIcon from '@mui/icons-material/SelectAll'
import { TextRenderer, useTextRenderer } from './TextRenderer'
import { JsonFormatter, stripJsonComments, formatJsonc } from './JsonFormatter'

interface JsonEditorProps {
  value: { json: any; rawJson?: string } | any
  onChange: (value: { json: any; rawJson: string } | undefined) => void
  placeholder?: string
}

// Custom toolbar for JsonEditor with JSON-specific actions
function JsonEditorToolbar({ inFullscreen = false }: { inFullscreen?: boolean }) {
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
    localText,
    handleTextChange,
    isValid,
    pendingCursorRef,
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
      
      {/* JSON-specific: Format button */}
      <Tooltip title="Format JSON" arrow>
        <span>
          <IconButton
            size="small"
            onClick={() => {
              try {
                const formatted = formatJsonc(localText)
                if (formatted !== localText) {
                  handleTextChange(formatted, 0)
                  pendingCursorRef.current = 0
                }
              } catch {
                // Invalid JSON, can't format
              }
            }}
            disabled={!isValid || !localText}
            sx={{ color: 'text.secondary', '&:hover': { color: 'text.primary' } }}
          >
            <AutoFixHighIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      
      {/* JSON-specific: Minify button */}
      <Tooltip title="Minify JSON" arrow>
        <span>
          <IconButton
            size="small"
            onClick={() => {
              try {
                const stripped = stripJsonComments(localText)
                const parsed = JSON.parse(stripped)
                const minified = JSON.stringify(parsed)
                if (minified !== localText) {
                  handleTextChange(minified, 0)
                  pendingCursorRef.current = 0
                }
              } catch {
                // Invalid JSON, can't minify
              }
            }}
            disabled={!isValid || !localText}
            sx={{ color: 'text.secondary', '&:hover': { color: 'text.primary' } }}
          >
            <CompressIcon fontSize="small" />
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

// Context menu component for JSON operations
function JsonContextMenu({ 
  contextMenu, 
  onClose, 
  hasSelection 
}: { 
  contextMenu: { mouseX: number; mouseY: number } | null
  onClose: () => void
  hasSelection: boolean
}) {
  const {
    localText,
    handleTextChange,
    isValid,
    pendingCursorRef,
    textareaRef,
    isFullscreen,
    fullscreenTextareaRef,
  } = useTextRenderer()

  const getActiveTextarea = () => {
    return isFullscreen ? fullscreenTextareaRef.current : textareaRef.current
  }

  const handleSelectAll = () => {
    const textarea = getActiveTextarea()
    if (textarea) {
      textarea.select()
      textarea.focus()
    }
    onClose()
  }

  const handleCopy = async () => {
    const textarea = getActiveTextarea()
    if (textarea) {
      const selectedText = localText.substring(textarea.selectionStart, textarea.selectionEnd)
      if (selectedText) {
        await navigator.clipboard.writeText(selectedText)
      }
    }
    onClose()
  }

  const handleCut = async () => {
    const textarea = getActiveTextarea()
    if (textarea) {
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const selectedText = localText.substring(start, end)
      if (selectedText) {
        await navigator.clipboard.writeText(selectedText)
        const newText = localText.substring(0, start) + localText.substring(end)
        handleTextChange(newText, start)
        pendingCursorRef.current = start
      }
    }
    onClose()
  }

  const handlePaste = async () => {
    const textarea = getActiveTextarea()
    if (textarea) {
      const clipboardText = await navigator.clipboard.readText()
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const newText = localText.substring(0, start) + clipboardText + localText.substring(end)
      const newCursorPos = start + clipboardText.length
      handleTextChange(newText, newCursorPos)
      pendingCursorRef.current = newCursorPos
    }
    onClose()
  }

  const sortKeys = (obj: any): any => {
    if (Array.isArray(obj)) {
      return obj.map(sortKeys)
    }
    if (obj !== null && typeof obj === 'object') {
      return Object.keys(obj)
        .sort()
        .reduce((acc, key) => {
          acc[key] = sortKeys(obj[key])
          return acc
        }, {} as any)
    }
    return obj
  }

  return (
    <Menu
      open={contextMenu !== null}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={
        contextMenu !== null
          ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
          : undefined
      }
    >
      <MenuItem onClick={handleCut} disabled={!hasSelection}>
        <ListItemIcon>
          <ContentCutIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>Cut</ListItemText>
      </MenuItem>
      <MenuItem onClick={handleCopy} disabled={!hasSelection}>
        <ListItemIcon>
          <ContentCopyIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>Copy</ListItemText>
      </MenuItem>
      <MenuItem onClick={handlePaste}>
        <ListItemIcon>
          <ContentPasteIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>Paste</ListItemText>
      </MenuItem>
      <MenuItem onClick={handleSelectAll}>
        <ListItemIcon>
          <SelectAllIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>Select All</ListItemText>
      </MenuItem>
      <Divider />
      <MenuItem
        onClick={() => {
          onClose()
          try {
            const formatted = formatJsonc(localText)
            if (formatted !== localText) {
              handleTextChange(formatted, 0)
              pendingCursorRef.current = 0
            }
          } catch {
            // Invalid JSON, can't format
          }
        }}
        disabled={!isValid || !localText}
      >
        <ListItemIcon>
          <AutoFixHighIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>Format</ListItemText>
      </MenuItem>
      <MenuItem
        onClick={() => {
          onClose()
          try {
            const stripped = stripJsonComments(localText)
            const parsed = JSON.parse(stripped)
            const minified = JSON.stringify(parsed)
            if (minified !== localText) {
              handleTextChange(minified, 0)
              pendingCursorRef.current = 0
            }
          } catch {
            // Invalid JSON, can't minify
          }
        }}
        disabled={!isValid || !localText}
      >
        <ListItemIcon>
          <CompressIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>Minify</ListItemText>
      </MenuItem>
      <MenuItem
        onClick={() => {
          onClose()
          try {
            const stripped = stripJsonComments(localText)
            const parsed = JSON.parse(stripped)
            const sorted = JSON.stringify(sortKeys(parsed), null, 2)
            if (sorted !== localText) {
              handleTextChange(sorted, 0)
              pendingCursorRef.current = 0
            }
          } catch {
            // Invalid JSON, can't sort
          }
        }}
        disabled={!isValid || !localText}
      >
        <ListItemIcon>
          <SortByAlphaIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>Sort Keys</ListItemText>
      </MenuItem>
      <Divider />
      <MenuItem
        onClick={() => {
          onClose()
          handleTextChange('', 0)
          pendingCursorRef.current = 0
        }}
        disabled={!localText}
      >
        <ListItemIcon>
          <ClearIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>Clear</ListItemText>
      </MenuItem>
    </Menu>
  )
}

// Inner component that has access to context
function JsonEditorInner() {
  const [contextMenu, setContextMenu] = useState<{ mouseX: number; mouseY: number } | null>(null)
  const [hasSelection, setHasSelection] = useState(false)
  const { textareaRef, isFullscreen, fullscreenTextareaRef } = useTextRenderer()

  // Attach context menu handler to textareas
  useEffect(() => {
    const textarea = textareaRef.current
    const fullscreenTextarea = fullscreenTextareaRef.current
    
    const handler = (e: MouseEvent) => {
      e.preventDefault()
      const target = e.target as HTMLTextAreaElement
      setHasSelection(target.selectionStart !== target.selectionEnd)
      setContextMenu({ mouseX: e.clientX, mouseY: e.clientY })
    }
    
    textarea?.addEventListener('contextmenu', handler)
    fullscreenTextarea?.addEventListener('contextmenu', handler)
    
    return () => {
      textarea?.removeEventListener('contextmenu', handler)
      fullscreenTextarea?.removeEventListener('contextmenu', handler)
    }
  }, [textareaRef, fullscreenTextareaRef])

  return (
    <>
      <JsonEditorToolbar />
      <JsonContextMenu
        contextMenu={contextMenu}
        onClose={() => setContextMenu(null)}
        hasSelection={hasSelection}
      />
    </>
  )
}

export default function JsonEditor({
  value,
  onChange,
  placeholder = 'Enter JSON here...',
}: JsonEditorProps) {
  // Extract raw text from value
  const rawText = (() => {
    if (!value) return ''
    if (value && typeof value === 'object' && 'rawJson' in value) {
      return value.rawJson || ''
    }
    return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  })()

  // Emit changes in the expected format
  const handleChange = useCallback((rawJson: string) => {
    if (!rawJson) {
      onChange(undefined)
      return
    }
    const stripped = stripJsonComments(rawJson)
    if (!stripped.trim()) {
      onChange({ json: undefined, rawJson })
      return
    }
    try {
      const json = JSON.parse(stripped)
      onChange({ json, rawJson })
    } catch {
      onChange({ json: null, rawJson })
    }
  }, [onChange])

  return (
    <TextRenderer
      value={rawText}
      onChange={handleChange}
      placeholder={placeholder}
      formatter={JsonFormatter}
      enableFullscreen={true}
      height={300}
    >
      <JsonEditorInner />
    </TextRenderer>
  )
}
