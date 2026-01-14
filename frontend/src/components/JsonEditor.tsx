import { useRef, useState, useEffect, useCallback, useLayoutEffect } from 'react'
import { Box, IconButton, Tooltip, Typography } from '@mui/material'
import UndoIcon from '@mui/icons-material/Undo'
import RedoIcon from '@mui/icons-material/Redo'

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
const highlightJson = (json: string) => {
  // Escape HTML first
  const escaped = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  // Then apply syntax highlighting
  return escaped
    .replace(/"([^"]+)":/g, '<span style="color: #9cdcfe">"$1"</span>:')
    .replace(/: "([^"]*)"/g, ': <span style="color: #ce9178">"$1"</span>')
    .replace(/: (-?\d+\.?\d*)/g, ': <span style="color: #b5cea8">$1</span>')
    .replace(/: (true|false)/g, ': <span style="color: #569cd6">$1</span>')
    .replace(/: (null)/g, ': <span style="color: #569cd6">$1</span>')
}

export default function JsonEditor({
  value,
  onChange,
  placeholder = 'Enter JSON here...',
}: JsonEditorProps) {
  const [scrollPos, setScrollPos] = useState({ top: 0, left: 0 })
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pendingCursorRef = useRef<number | null>(null)
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null)
  const pendingScrollRef = useRef<number | null>(null)

  // History for undo/redo - use state to trigger re-renders for button states
  const [historyState, setHistoryState] = useState<{ entries: HistoryEntry[], index: number }>({
    entries: [],
    index: -1
  })
  const isUndoRedoRef = useRef(false)

  // Local text state for editing - prevents reformatting while typing
  const [localText, setLocalText] = useState(() =>
    value ? (typeof value === 'string' ? value : JSON.stringify(value, null, 2)) : ''
  )

  // Initialize history with initial value
  useEffect(() => {
    if (historyState.entries.length === 0 && localText) {
      setHistoryState({
        entries: [{ text: localText, cursorPos: localText.length, scrollTop: 0 }],
        index: 0
      })
    }
  }, [])

  // Add to history (debounced-like behavior - only add if text changed)
  const addToHistory = useCallback((text: string, cursorPos: number) => {
    if (isUndoRedoRef.current) {
      isUndoRedoRef.current = false
      return
    }

    const currentScrollTop = textareaRef.current?.scrollTop ?? 0

    setHistoryState(prev => {
      const currentEntry = prev.entries[prev.index]
      if (currentEntry && currentEntry.text === text) return prev

      // Remove any future history if we're not at the end
      const newEntries = prev.entries.slice(0, prev.index + 1)

      // Add new entry
      newEntries.push({ text, cursorPos, scrollTop: currentScrollTop })
      let newIndex = newEntries.length - 1

      // Limit history size
      if (newEntries.length > 100) {
        newEntries.shift()
        newIndex--
      }

      return { entries: newEntries, index: newIndex }
    })
  }, [])

  const undo = useCallback(() => {
    if (historyState.index > 0) {
      isUndoRedoRef.current = true
      const newIndex = historyState.index - 1
      const entry = historyState.entries[newIndex]
      setLocalText(entry.text)
      pendingCursorRef.current = entry.cursorPos
      pendingScrollRef.current = entry.scrollTop
      setHistoryState(prev => ({ ...prev, index: newIndex }))

      try {
        const parsed = JSON.parse(entry.text)
        onChange(parsed)
      } catch {
        onChange(entry.text)
      }
    }
  }, [onChange, historyState])

  const redo = useCallback(() => {
    if (historyState.index < historyState.entries.length - 1) {
      isUndoRedoRef.current = true
      const newIndex = historyState.index + 1
      const entry = historyState.entries[newIndex]
      setLocalText(entry.text)
      pendingCursorRef.current = entry.cursorPos
      pendingScrollRef.current = entry.scrollTop
      setHistoryState(prev => ({ ...prev, index: newIndex }))

      try {
        const parsed = JSON.parse(entry.text)
        onChange(parsed)
      } catch {
        onChange(entry.text)
      }
    }
  }, [onChange, historyState])

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

        // Adjust selection to cover the same lines
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

  return (
    <>
      <Box sx={{ position: 'relative', height: 300, overflow: 'hidden', bgcolor: 'grey.900', borderRadius: 1 }}>
        {/* Undo/Redo toolbar */}
        <Box sx={{
          position: 'absolute',
          top: 4,
          right: 4,
          zIndex: 1,
          display: 'flex',
          gap: 0.5,
          bgcolor: 'rgba(0,0,0,0.3)',
          borderRadius: 1,
          p: 0.25,
        }}>
          <Tooltip title="Undo (Ctrl+Z)">
            <span>
              <IconButton
                size="small"
                onClick={undo}
                disabled={!canUndo}
                sx={{ color: 'grey.400', '&:hover': { color: 'grey.100' } }}
              >
                <UndoIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Redo (Ctrl+Y)">
            <span>
              <IconButton
                size="small"
                onClick={redo}
                disabled={!canRedo}
                sx={{ color: 'grey.400', '&:hover': { color: 'grey.100' } }}
              >
                <RedoIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
        {/* Syntax highlighted background - moves with textarea scroll */}
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            fontFamily: 'monospace',
            fontSize: '0.875rem',
            lineHeight: 1.5,
            color: 'grey.100',
            p: 1.5,
            whiteSpace: 'pre',
            pointerEvents: 'none',
            transform: `translate(${-scrollPos.left}px, ${-scrollPos.top}px)`,
          }}
          dangerouslySetInnerHTML={{
            __html: localText
              ? highlightJson(localText)
              : `<span style="color: #6a6a6a">${placeholder}</span>`
          }}
        />
        {/* Transparent textarea for input */}
        <textarea
          ref={textareaRef}
          value={localText}
          onChange={(e) => handleTextChange(e.target.value, e.target.selectionStart)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onScroll={handleScroll}
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            fontFamily: 'monospace',
            fontSize: '0.875rem',
            lineHeight: 1.5,
            padding: 12,
            background: 'transparent',
            color: 'transparent',
            caretColor: '#fff',
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
    </>
  )
}
