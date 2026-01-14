import { useRef, useState, useEffect, useCallback, useLayoutEffect } from 'react'
import { Box, IconButton, Tooltip, Typography, Modal, useTheme } from '@mui/material'
import UndoIcon from '@mui/icons-material/Undo'
import RedoIcon from '@mui/icons-material/Redo'
import FullscreenIcon from '@mui/icons-material/Fullscreen'
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit'
import CodeIcon from '@mui/icons-material/Code'
import CodeOffIcon from '@mui/icons-material/CodeOff'
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'

interface HistoryEntry {
  text: string
  cursorPos: number
  scrollTop: number
}

interface JsonEditorProps {
  value: any
  onChange: (value: any) => void
  placeholder?: string
}

// Simple syntax highlighting for JSON
const highlightJson = (json: string, isDark: boolean) => {
  // Escape HTML first
  const escaped = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  // Theme-aware colors
  const colors = isDark
    ? { key: '#9cdcfe', string: '#ce9178', number: '#b5cea8', keyword: '#569cd6' }
    : { key: '#0451a5', string: '#a31515', number: '#098658', keyword: '#0000ff' }
  // Then apply syntax highlighting
  return escaped
    .replace(/"([^"]+)":/g, `<span style="color: ${colors.key}">"$1"</span>:`)
    .replace(/: "([^"]*)"/g, `: <span style="color: ${colors.string}">"$1"</span>`)
    .replace(/: (-?\d+\.?\d*)/g, `: <span style="color: ${colors.number}">$1</span>`)
    .replace(/: (true|false)/g, `: <span style="color: ${colors.keyword}">$1</span>`)
    .replace(/: (null)/g, `: <span style="color: ${colors.keyword}">$1</span>`)
}

export default function JsonEditor({
  value,
  onChange,
  placeholder = 'Enter JSON here...',
}: JsonEditorProps) {
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'
  const [scrollPos, setScrollPos] = useState({ top: 0, left: 0 })
  const [fullscreenScrollPos, setFullscreenScrollPos] = useState({ top: 0, left: 0 })
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fullscreenTextareaRef = useRef<HTMLTextAreaElement>(null)
  const pendingCursorRef = useRef<number | null>(null)
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null)
  const pendingScrollRef = useRef<number | null>(null)

  // UI state
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showRawText, setShowRawText] = useState(false)

  // History for undo/redo - use state to trigger re-renders for button states
  const [historyState, setHistoryState] = useState<{ entries: HistoryEntry[], index: number }>({
    entries: [],
    index: -1
  })
  // Keep a ref synced with history state for undo/redo to avoid stale closures
  const historyRef = useRef(historyState)
  useEffect(() => {
    historyRef.current = historyState
  }, [historyState])

  // Local text state for editing - prevents reformatting while typing
  const [localText, setLocalText] = useState(() =>
    value ? (typeof value === 'string' ? value : JSON.stringify(value, null, 2)) : ''
  )

  // Initialize history with initial value (including empty)
  useEffect(() => {
    if (historyState.entries.length === 0) {
      setHistoryState({
        entries: [{ text: localText, cursorPos: localText.length, scrollTop: 0 }],
        index: 0
      })
    }
  }, [])

  // Add to history (debounced-like behavior - only add if text changed)
  const addToHistory = useCallback((text: string, cursorPos: number) => {
    const currentScrollTop = textareaRef.current?.scrollTop ?? 0

    setHistoryState(prev => {
      const currentEntry = prev.entries[prev.index]
      if (currentEntry && currentEntry.text === text) return prev

      // Always truncate to current index - this removes any "future" entries
      // that exist from undoing, so new changes become the new future
      const newEntries = prev.entries.slice(0, Math.max(0, prev.index + 1))

      // Add new entry
      newEntries.push({ text, cursorPos, scrollTop: currentScrollTop })
      const newIndex = newEntries.length - 1

      // Limit history size
      if (newEntries.length > 100) {
        newEntries.shift()
        return { entries: newEntries, index: newIndex - 1 }
      }

      return { entries: newEntries, index: newIndex }
    })
  }, [])

  const undo = useCallback(() => {
    const current = historyRef.current
    if (current.index > 0) {
      const newIndex = current.index - 1
      const entry = current.entries[newIndex]
      const currentText = localText
      const currentCursor = textareaRef.current?.selectionStart ?? 0

      let newCursor = currentCursor
      const lengthDiff = entry.text.length - currentText.length

      if (lengthDiff > 0) {
        // Text got longer (restoring deleted content)
        // Move cursor forward by the restored amount
        newCursor = currentCursor + lengthDiff
      } else if (lengthDiff < 0) {
        // Text got shorter (removing added content)
        // Move cursor back by the removed amount
        newCursor = Math.max(0, currentCursor + lengthDiff)
      }

      // Clamp to text length
      newCursor = Math.min(newCursor, entry.text.length)

      // Avoid landing cursor directly on a newline (which shows cursor on next line)
      // unless cursor was already at a newline position
      if (newCursor > 0 && entry.text[newCursor] === '\n' && currentText[currentCursor] !== '\n') {
        newCursor--
      }

      setLocalText(entry.text)
      pendingCursorRef.current = newCursor
      setHistoryState(prev => ({ ...prev, index: newIndex }))

      try {
        const parsed = JSON.parse(entry.text)
        onChange(parsed)
      } catch {
        onChange(entry.text)
      }
    }
  }, [onChange, localText])

  const redo = useCallback(() => {
    const current = historyRef.current
    if (current.index < current.entries.length - 1) {
      const newIndex = current.index + 1
      const entry = current.entries[newIndex]
      // Keep cursor at current position (clamped to new text length)
      const currentCursor = textareaRef.current?.selectionStart ?? 0
      const clampedCursor = Math.min(currentCursor, entry.text.length)
      setLocalText(entry.text)
      pendingCursorRef.current = clampedCursor
      setHistoryState(prev => ({ ...prev, index: newIndex }))

      try {
        const parsed = JSON.parse(entry.text)
        onChange(parsed)
      } catch {
        onChange(entry.text)
      }
    }
  }, [onChange])

  const canUndo = historyState.index > 0
  const canRedo = historyState.index < historyState.entries.length - 1

  // Sync local text when external value changes (e.g., initial load)
  useEffect(() => {
    const externalText = value ? (typeof value === 'string' ? value : JSON.stringify(value, null, 2)) : ''
    // Only update if significantly different (not just whitespace from our edits)
    if (externalText !== localText) {
      try {
        const localParsed = JSON.parse(localText)
        const externalParsed = typeof value === 'object' ? value : JSON.parse(externalText)
        // If they parse to the same thing, keep local text to preserve cursor
        if (JSON.stringify(localParsed) === JSON.stringify(externalParsed)) {
          return
        }
      } catch {
        // If parsing fails, compare strings
      }
      setLocalText(externalText)
    }
  }, [value])

  // Set cursor position or selection after render if pending
  // Use useLayoutEffect to set cursor before browser paint, preventing flicker
  useLayoutEffect(() => {
    if (pendingSelectionRef.current !== null && textareaRef.current) {
      textareaRef.current.focus({ preventScroll: true })
      textareaRef.current.selectionStart = pendingSelectionRef.current.start
      textareaRef.current.selectionEnd = pendingSelectionRef.current.end
      pendingSelectionRef.current = null
    } else if (pendingCursorRef.current !== null && textareaRef.current) {
      textareaRef.current.focus({ preventScroll: true })
      textareaRef.current.selectionStart = textareaRef.current.selectionEnd = pendingCursorRef.current
      pendingCursorRef.current = null
    }
    // Restore scroll position if pending
    if (pendingScrollRef.current !== null && textareaRef.current) {
      textareaRef.current.scrollTop = pendingScrollRef.current
      setScrollPos(prev => ({ ...prev, top: pendingScrollRef.current! }))
      pendingScrollRef.current = null
    }
  }, [localText])

  // Determine if value is valid JSON
  const isValid = (() => {
    if (!localText) return true
    try {
      JSON.parse(localText)
      return true
    } catch {
      return false
    }
  })()

  const handleTextChange = (newText: string, cursorPos?: number) => {
    setLocalText(newText)
    addToHistory(newText, cursorPos ?? newText.length)
    if (!newText) {
      onChange(undefined)
      return
    }
    try {
      const parsed = JSON.parse(newText)
      onChange(parsed)
    } catch {
      // Store as string to indicate invalid JSON
      onChange(newText)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle undo/redo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault()
      if (e.shiftKey) {
        redo()
      } else {
        undo()
      }
      return
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
      e.preventDefault()
      redo()
      return
    }

    // Handle cut/copy entire line when nothing selected
    if ((e.ctrlKey || e.metaKey) && (e.key === 'x' || e.key === 'c')) {
      const target = e.target as HTMLTextAreaElement
      const start = target.selectionStart
      const end = target.selectionEnd

      // Only handle when no selection (cursor is a point)
      if (start === end) {
        e.preventDefault()
        const currentValue = target.value

        // Find the start and end of the current line
        const lineStart = currentValue.lastIndexOf('\n', start - 1) + 1
        let lineEnd = currentValue.indexOf('\n', start)
        if (lineEnd === -1) lineEnd = currentValue.length

        // Get the line content (including the newline if not the last line)
        const hasNewlineAfter = lineEnd < currentValue.length
        const lineContent = currentValue.substring(lineStart, lineEnd + (hasNewlineAfter ? 1 : 0))

        // Copy to clipboard
        navigator.clipboard.writeText(lineContent)

        // If cutting, remove the line
        if (e.key === 'x') {
          // If it's the last line and there's content before, include the preceding newline
          const deleteStart = lineStart === 0 ? 0 : (hasNewlineAfter ? lineStart : lineStart - 1)
          const deleteEnd = hasNewlineAfter ? lineEnd + 1 : lineEnd

          const newValue = currentValue.substring(0, deleteStart) + currentValue.substring(deleteEnd)
          const newCursorPos = deleteStart

          setLocalText(newValue)
          addToHistory(newValue, newCursorPos)
          pendingCursorRef.current = newCursorPos

          try {
            const parsed = JSON.parse(newValue)
            onChange(parsed)
          } catch {
            onChange(newValue)
          }
        }
        return
      }
    }

    // Handle move line(s) up/down with Alt+Arrow
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      const target = e.target as HTMLTextAreaElement
      const start = target.selectionStart
      const end = target.selectionEnd
      const currentValue = target.value
      const lines = currentValue.split('\n')

      // Find which lines the selection spans
      let charCount = 0
      let startLineIndex = 0
      let endLineIndex = 0

      for (let i = 0; i < lines.length; i++) {
        const lineLength = lines[i].length + 1 // +1 for newline
        if (charCount + lineLength > start && startLineIndex === 0 && i > 0 || charCount + lines[i].length >= start) {
          if (startLineIndex === 0 || charCount <= start) {
            startLineIndex = i
          }
        }
        if (charCount + lines[i].length >= end - 1 || i === lines.length - 1) {
          endLineIndex = i
          break
        }
        charCount += lineLength
      }

      // Recalculate properly
      charCount = 0
      for (let i = 0; i < lines.length; i++) {
        const lineEnd = charCount + lines[i].length
        if (start <= lineEnd) {
          startLineIndex = i
          break
        }
        charCount += lines[i].length + 1
      }

      charCount = 0
      for (let i = 0; i < lines.length; i++) {
        const lineEnd = charCount + lines[i].length
        if (end <= lineEnd + 1) {
          endLineIndex = i
          break
        }
        charCount += lines[i].length + 1
      }

      // Calculate the start position of the first selected line
      let firstLineStart = 0
      for (let i = 0; i < startLineIndex; i++) {
        firstLineStart += lines[i].length + 1
      }
      const offsetInFirstLine = start - firstLineStart
      const selectionLength = end - start

      if (e.key === 'ArrowUp' && startLineIndex > 0) {
        e.preventDefault()
        // Move the block of lines up
        const lineAbove = lines[startLineIndex - 1]
        const selectedLines = lines.slice(startLineIndex, endLineIndex + 1)

        // Rebuild the lines array
        const newLines = [
          ...lines.slice(0, startLineIndex - 1),
          ...selectedLines,
          lineAbove,
          ...lines.slice(endLineIndex + 1)
        ]

        const newValue = newLines.join('\n')

        // Calculate new selection position
        let newStart = 0
        for (let i = 0; i < startLineIndex - 1; i++) {
          newStart += newLines[i].length + 1
        }
        newStart += offsetInFirstLine
        const newEnd = newStart + selectionLength

        setLocalText(newValue)
        addToHistory(newValue, newStart)
        pendingSelectionRef.current = { start: newStart, end: newEnd }

        try {
          const parsed = JSON.parse(newValue)
          onChange(parsed)
        } catch {
          onChange(newValue)
        }
      } else if (e.key === 'ArrowDown' && endLineIndex < lines.length - 1) {
        e.preventDefault()
        // Move the block of lines down
        const lineBelow = lines[endLineIndex + 1]
        const selectedLines = lines.slice(startLineIndex, endLineIndex + 1)

        // Rebuild the lines array
        const newLines = [
          ...lines.slice(0, startLineIndex),
          lineBelow,
          ...selectedLines,
          ...lines.slice(endLineIndex + 2)
        ]

        const newValue = newLines.join('\n')

        // Calculate new selection position
        let newStart = 0
        for (let i = 0; i < startLineIndex + 1; i++) {
          newStart += newLines[i].length + 1
        }
        newStart += offsetInFirstLine
        const newEnd = newStart + selectionLength

        setLocalText(newValue)
        addToHistory(newValue, newStart)
        pendingSelectionRef.current = { start: newStart, end: newEnd }

        try {
          const parsed = JSON.parse(newValue)
          onChange(parsed)
        } catch {
          onChange(newValue)
        }
      }
      return
    }

    if (e.key === 'Tab') {
      e.preventDefault()
      const target = e.target as HTMLTextAreaElement
      const start = target.selectionStart
      const end = target.selectionEnd
      const currentValue = target.value

      // Check if selection spans multiple lines
      const selectedText = currentValue.substring(start, end)
      const hasMultiLineSelection = selectedText.includes('\n')

      if (hasMultiLineSelection) {
        // Find the start of the first selected line
        const lineStart = currentValue.lastIndexOf('\n', start - 1) + 1
        // Find the end of the last selected line
        let lineEnd = currentValue.indexOf('\n', end)
        if (lineEnd === -1) lineEnd = currentValue.length

        // Get all lines in selection
        const linesText = currentValue.substring(lineStart, lineEnd)
        const lines = linesText.split('\n')

        let modifiedLines: string[]
        let totalChange = 0

        if (e.shiftKey) {
          // Unindent: remove up to 2 spaces from start of each line
          modifiedLines = lines.map(line => {
            if (line.startsWith('  ')) {
              totalChange -= 2
              return line.substring(2)
            } else if (line.startsWith(' ')) {
              totalChange -= 1
              return line.substring(1)
            }
            return line
          })
        } else {
          // Indent: add 2 spaces to start of each line
          modifiedLines = lines.map(line => {
            totalChange += 2
            return '  ' + line
          })
        }

        const newValue = currentValue.substring(0, lineStart) + modifiedLines.join('\n') + currentValue.substring(lineEnd)
        setLocalText(newValue)
        addToHistory(newValue, lineStart)

        // Keep selection on the block, adjusted for changed indentation
        pendingSelectionRef.current = { start: lineStart, end: lineEnd + totalChange }

        try {
          const parsed = JSON.parse(newValue)
          onChange(parsed)
        } catch {
          onChange(newValue)
        }
      } else {
        // Single cursor or single line selection
        let newValue: string
        let newCursorPos: number

        if (e.shiftKey) {
          // Shift+Tab: Remove up to 2 spaces before cursor, or unindent whole line
          const beforeCursor = currentValue.substring(0, start)
          const charBeforeCursor = beforeCursor.slice(-1)

          if (charBeforeCursor === ' ' || charBeforeCursor === '\t') {
            // Remove spaces/tabs before cursor
            const spacesToRemove = beforeCursor.endsWith('  ') ? 2 : 1
            newValue = currentValue.substring(0, start - spacesToRemove) + currentValue.substring(end)
            newCursorPos = start - spacesToRemove
          } else {
            // Unindent the whole line from the beginning
            const lineStart = currentValue.lastIndexOf('\n', start - 1) + 1
            const lineContent = currentValue.substring(lineStart, start)
            const spacesAtLineStart = lineContent.startsWith('  ') ? 2 : lineContent.startsWith(' ') ? 1 : 0

            if (spacesAtLineStart > 0) {
              newValue = currentValue.substring(0, lineStart) + currentValue.substring(lineStart + spacesAtLineStart)
              newCursorPos = start - spacesAtLineStart
            } else {
              // No spaces to remove, keep as is
              newValue = currentValue
              newCursorPos = start
            }
          }
        } else {
          // Tab: Insert 2 spaces at cursor position
          newValue = currentValue.substring(0, start) + '  ' + currentValue.substring(end)
          newCursorPos = start + 2
        }

        setLocalText(newValue)
        addToHistory(newValue, newCursorPos)
        pendingCursorRef.current = newCursorPos

        try {
          const parsed = JSON.parse(newValue)
          onChange(parsed)
        } catch {
          onChange(newValue)
        }
      }
    }
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    e.preventDefault()
    const target = e.target as HTMLTextAreaElement
    const start = target.selectionStart
    const end = target.selectionEnd
    const currentValue = target.value

    // Get pasted text and convert tabs to 2 spaces
    let pastedText = e.clipboardData.getData('text')
    pastedText = pastedText.replace(/\t/g, '  ')

    // Try to format if it's valid JSON being pasted into an empty field
    if (!currentValue.trim() || (start === 0 && end === currentValue.length)) {
      try {
        const parsed = JSON.parse(pastedText)
        pastedText = JSON.stringify(parsed, null, 2)
      } catch {
        // Not valid JSON, use as-is with tabs converted
      }
    }

    const newValue = currentValue.substring(0, start) + pastedText + currentValue.substring(end)
    const newCursorPos = start + pastedText.length
    setLocalText(newValue)
    addToHistory(newValue, newCursorPos)
    pendingCursorRef.current = newCursorPos

    // Update parent
    try {
      const parsed = JSON.parse(newValue)
      onChange(parsed)
    } catch {
      onChange(newValue)
    }
  }

  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    setScrollPos({
      top: e.currentTarget.scrollTop,
      left: e.currentTarget.scrollLeft
    })
  }

  const handleFullscreenScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    setFullscreenScrollPos({
      top: e.currentTarget.scrollTop,
      left: e.currentTarget.scrollLeft
    })
  }

  // Reset fullscreen scroll when opening
  useEffect(() => {
    if (isFullscreen) {
      setFullscreenScrollPos({ top: 0, left: 0 })
      if (fullscreenTextareaRef.current) {
        fullscreenTextareaRef.current.scrollTop = 0
        fullscreenTextareaRef.current.scrollLeft = 0
        fullscreenTextareaRef.current.focus()
      }
    }
  }, [isFullscreen])

  // Toolbar component to avoid duplication
  const Toolbar = ({ inFullscreen = false }: { inFullscreen?: boolean }) => (
    <Box sx={{
      position: 'absolute',
      top: 4,
      right: 4,
      zIndex: 1,
      display: 'flex',
      gap: 0.5,
      bgcolor: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.08)',
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
      <Tooltip title="Format JSON" arrow>
        <span>
          <IconButton
            size="small"
            onClick={() => {
              try {
                const parsed = JSON.parse(localText)
                const formatted = JSON.stringify(parsed, null, 2)
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
      <Tooltip title="Copy to clipboard" arrow>
        <span>
          <IconButton
            size="small"
            onClick={() => {
              if (localText) {
                navigator.clipboard.writeText(localText)
              }
            }}
            disabled={!localText}
            sx={{ color: 'text.secondary', '&:hover': { color: 'text.primary' } }}
          >
            <ContentCopyIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
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

  return (
    <>
      <Box sx={{
        position: 'relative',
        height: 300,
        overflow: 'hidden',
        bgcolor: 'background.paper',
        borderRadius: 1,
        border: isDark ? 'none' : 1,
        borderColor: 'divider',
      }}>
        <Toolbar />
        {/* Syntax highlighted background - moves with textarea scroll */}
        {!showRawText && (
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              fontFamily: 'monospace',
              fontSize: '0.875rem',
              lineHeight: 1.5,
              color: 'text.primary',
              p: 1.5,
              whiteSpace: 'pre',
              pointerEvents: 'none',
              transform: `translate(${-scrollPos.left}px, ${-scrollPos.top}px)`,
            }}
            dangerouslySetInnerHTML={{
              __html: localText
                ? highlightJson(localText, isDark)
                : `<span style="color: ${isDark ? '#6a6a6a' : '#a0a0a0'}">${placeholder}</span>`
            }}
          />
        )}
        {/* Textarea for input */}
        <textarea
          ref={textareaRef}
          value={localText}
          onChange={(e) => handleTextChange(e.target.value, e.target.selectionStart)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onScroll={handleScroll}
          placeholder={showRawText ? placeholder : undefined}
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            fontFamily: 'monospace',
            fontSize: '0.875rem',
            lineHeight: 1.5,
            padding: 12,
            background: 'transparent',
            color: showRawText ? theme.palette.text.primary : 'transparent',
            caretColor: theme.palette.text.primary,
            border: 'none',
            outline: 'none',
            resize: 'none',
            whiteSpace: 'pre',
            overflow: 'auto',
          }}
          spellCheck={false}
        />
      </Box>
      {!isValid && (
        <Typography variant="caption" color="error" sx={{ mt: 1, display: 'block' }}>
          Invalid JSON
        </Typography>
      )}

      {/* Fullscreen Modal */}
      <Modal
        open={isFullscreen}
        onClose={() => setIsFullscreen(false)}
      >
        <Box sx={{
          width: '100vw',
          height: '100vh',
          bgcolor: 'background.paper',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}>
          <Box sx={{ position: 'relative', height: '100%', overflow: 'hidden', bgcolor: 'background.paper' }}>
            <Toolbar inFullscreen />
            {/* Syntax highlighted background - moves with textarea scroll */}
            {!showRawText && (
              <Box
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  fontFamily: 'monospace',
                  fontSize: '0.875rem',
                  lineHeight: 1.5,
                  color: 'text.primary',
                  p: 1.5,
                  whiteSpace: 'pre',
                  pointerEvents: 'none',
                  transform: `translate(${-fullscreenScrollPos.left}px, ${-fullscreenScrollPos.top}px)`,
                }}
                dangerouslySetInnerHTML={{
                  __html: localText
                    ? highlightJson(localText, isDark)
                    : `<span style="color: ${isDark ? '#6a6a6a' : '#a0a0a0'}">${placeholder}</span>`
                }}
              />
            )}
            {/* Textarea for input */}
            <textarea
              ref={fullscreenTextareaRef}
              value={localText}
              onChange={(e) => handleTextChange(e.target.value, e.target.selectionStart)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onScroll={handleFullscreenScroll}
              placeholder={showRawText ? placeholder : undefined}
              style={{
                position: 'relative',
                width: '100%',
                height: '100%',
                fontFamily: 'monospace',
                fontSize: '0.875rem',
                lineHeight: 1.5,
                padding: 12,
                background: 'transparent',
                color: showRawText ? theme.palette.text.primary : 'transparent',
                caretColor: theme.palette.text.primary,
                border: 'none',
                outline: 'none',
                resize: 'none',
                whiteSpace: 'pre',
                overflow: 'auto',
              }}
              spellCheck={false}
            />
          </Box>
        </Box>
      </Modal>
    </>
  )
}
