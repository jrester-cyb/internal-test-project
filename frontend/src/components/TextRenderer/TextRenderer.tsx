import { useRef, useState, useEffect, useCallback, useLayoutEffect, useMemo } from 'react'
import { Box, Typography, Modal, useTheme } from '@mui/material'
import { TextRendererContext } from './context'
import type {
  TextRendererProps,
  TextRendererContextValue,
  HistoryEntry,
} from './types'
import TextRendererToolbar from './TextRendererToolbar'

export default function TextRenderer({
  value,
  onChange,
  placeholder = 'Enter text here...',
  formatter,
  enableFullscreen = true,
  height = 300,
  children,
}: TextRendererProps) {
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'

  // Refs
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fullscreenTextareaRef = useRef<HTMLTextAreaElement>(null)
  const pendingCursorRef = useRef<number | null>(null)
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null)
  const pendingScrollRef = useRef<number | null>(null)

  // Scroll state
  const [scrollPos, setScrollPos] = useState({ top: 0, left: 0 })
  const [fullscreenScrollPos, setFullscreenScrollPos] = useState({ top: 0, left: 0 })

  // UI state
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showRawText, setShowRawText] = useState(false)

  // History for undo/redo
  const [historyState, setHistoryState] = useState<{ entries: HistoryEntry[], index: number }>({
    entries: [],
    index: -1
  })
  const historyRef = useRef(historyState)
  useEffect(() => {
    historyRef.current = historyState
  }, [historyState])

  // Local text state
  const [localText, setLocalText] = useState(value)

  // Initialize history
  useEffect(() => {
    if (historyState.entries.length === 0) {
      setHistoryState({
        entries: [{ text: localText, cursorPos: localText.length, scrollTop: 0 }],
        index: 0
      })
    }
  }, [])

  // Sync local text when external value changes
  useEffect(() => {
    if (value !== localText) {
      setLocalText(value)
    }
  }, [value])

  // Add to history
  const addToHistory = useCallback((text: string, cursorPos: number) => {
    const currentScrollTop = textareaRef.current?.scrollTop ?? 0

    setHistoryState(prev => {
      const currentEntry = prev.entries[prev.index]
      if (currentEntry && currentEntry.text === text) return prev

      const newEntries = prev.entries.slice(0, Math.max(0, prev.index + 1))
      newEntries.push({ text, cursorPos, scrollTop: currentScrollTop })
      const newIndex = newEntries.length - 1

      if (newEntries.length > 100) {
        newEntries.shift()
        return { entries: newEntries, index: newIndex - 1 }
      }

      return { entries: newEntries, index: newIndex }
    })
  }, [])

  // Undo/Redo
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
        newCursor = currentCursor + lengthDiff
      } else if (lengthDiff < 0) {
        newCursor = Math.max(0, currentCursor + lengthDiff)
      }

      newCursor = Math.min(newCursor, entry.text.length)

      if (newCursor > 0 && entry.text[newCursor] === '\n' && currentText[currentCursor] !== '\n') {
        newCursor--
      }

      setLocalText(entry.text)
      pendingCursorRef.current = newCursor
      setHistoryState(prev => ({ ...prev, index: newIndex }))
      onChange(entry.text)
    }
  }, [localText, onChange])

  const redo = useCallback(() => {
    const current = historyRef.current
    if (current.index < current.entries.length - 1) {
      const newIndex = current.index + 1
      const entry = current.entries[newIndex]
      const currentCursor = textareaRef.current?.selectionStart ?? 0
      const clampedCursor = Math.min(currentCursor, entry.text.length)
      setLocalText(entry.text)
      pendingCursorRef.current = clampedCursor
      setHistoryState(prev => ({ ...prev, index: newIndex }))
      onChange(entry.text)
    }
  }, [onChange])

  const canUndo = historyState.index > 0
  const canRedo = historyState.index < historyState.entries.length - 1

  // Set cursor position after render
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
    if (pendingScrollRef.current !== null && textareaRef.current) {
      textareaRef.current.scrollTop = pendingScrollRef.current
      setScrollPos(prev => ({ ...prev, top: pendingScrollRef.current! }))
      pendingScrollRef.current = null
    }
  }, [localText])

  // Validation
  const errorInfo = useMemo(() => formatter.getErrorPosition(localText), [localText, formatter])
  const isValid = !errorInfo

  // Handle text change
  const handleTextChange = useCallback((newText: string, cursorPos?: number) => {
    setLocalText(newText)
    addToHistory(newText, cursorPos ?? newText.length)
    onChange(newText)
  }, [addToHistory, onChange])

  // Keyboard handler
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Undo/redo
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

    // Tab handling
    if (e.key === 'Tab') {
      e.preventDefault()
      const target = e.target as HTMLTextAreaElement
      const start = target.selectionStart
      const end = target.selectionEnd
      const currentValue = target.value

      const selectedText = currentValue.substring(start, end)
      const hasMultiLineSelection = selectedText.includes('\n')

      if (hasMultiLineSelection) {
        const lineStart = currentValue.lastIndexOf('\n', start - 1) + 1
        let lineEnd = currentValue.indexOf('\n', end)
        if (lineEnd === -1) lineEnd = currentValue.length

        const linesText = currentValue.substring(lineStart, lineEnd)
        const lines = linesText.split('\n')

        let modifiedLines: string[]
        let totalChange = 0

        if (e.shiftKey) {
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
          modifiedLines = lines.map(line => {
            totalChange += 2
            return '  ' + line
          })
        }

        const newValue = currentValue.substring(0, lineStart) + modifiedLines.join('\n') + currentValue.substring(lineEnd)
        handleTextChange(newValue, lineStart)
        pendingSelectionRef.current = { start: lineStart, end: lineEnd + totalChange }
      } else {
        let newValue: string
        let newCursorPos: number

        if (e.shiftKey) {
          const beforeCursor = currentValue.substring(0, start)
          const charBeforeCursor = beforeCursor.slice(-1)

          if (charBeforeCursor === ' ' || charBeforeCursor === '\t') {
            const spacesToRemove = beforeCursor.endsWith('  ') ? 2 : 1
            newValue = currentValue.substring(0, start - spacesToRemove) + currentValue.substring(end)
            newCursorPos = start - spacesToRemove
          } else {
            const lineStart = currentValue.lastIndexOf('\n', start - 1) + 1
            const lineContent = currentValue.substring(lineStart, start)
            const spacesAtLineStart = lineContent.startsWith('  ') ? 2 : lineContent.startsWith(' ') ? 1 : 0

            if (spacesAtLineStart > 0) {
              newValue = currentValue.substring(0, lineStart) + currentValue.substring(lineStart + spacesAtLineStart)
              newCursorPos = start - spacesAtLineStart
            } else {
              newValue = currentValue
              newCursorPos = start
            }
          }
        } else {
          newValue = currentValue.substring(0, start) + '  ' + currentValue.substring(end)
          newCursorPos = start + 2
        }

        handleTextChange(newValue, newCursorPos)
        pendingCursorRef.current = newCursorPos
      }
    }

    // Escape to exit fullscreen
    if (e.key === 'Escape' && isFullscreen) {
      setIsFullscreen(false)
    }
  }, [undo, redo, handleTextChange, isFullscreen])

  // Scroll handlers
  const handleScroll = useCallback((e: React.UIEvent<HTMLTextAreaElement>) => {
    setScrollPos({
      top: e.currentTarget.scrollTop,
      left: e.currentTarget.scrollLeft
    })
  }, [])

  const handleFullscreenScroll = useCallback((e: React.UIEvent<HTMLTextAreaElement>) => {
    setFullscreenScrollPos({
      top: e.currentTarget.scrollTop,
      left: e.currentTarget.scrollLeft
    })
  }, [])

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

  // Line count for line numbers
  const lineCount = localText ? localText.split('\n').length : 1

  // Line numbers component
  const LineNumbers = ({ scrollTop }: { scrollTop: number }) => (
    <Box
      sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: 40,
        height: '100%',
        bgcolor: isDark ? 'grey.900' : 'grey.100',
        borderRight: 1,
        borderColor: 'divider',
        fontFamily: 'monospace',
        fontSize: '0.875rem',
        lineHeight: 1.5,
        color: 'text.secondary',
        userSelect: 'none',
        overflow: 'hidden',
        zIndex: 1,
      }}
    >
      <Box
        sx={{
          pt: 1.5,
          pr: 1,
          textAlign: 'right',
          transform: `translateY(${-scrollTop}px)`,
        }}
      >
        {Array.from({ length: lineCount }, (_, i) => (
          <div key={i + 1}>{i + 1}</div>
        ))}
      </Box>
    </Box>
  )

  // Context value
  const contextValue: TextRendererContextValue = {
    localText,
    setLocalText,
    handleTextChange,
    canUndo,
    canRedo,
    undo,
    redo,
    isFullscreen,
    setIsFullscreen,
    showRawText,
    setShowRawText,
    isDark,
    isValid,
    errorInfo,
    formatter,
    textareaRef,
    fullscreenTextareaRef,
    pendingCursorRef,
    scrollPos,
    setScrollPos,
    fullscreenScrollPos,
    setFullscreenScrollPos,
  }

  const highlightedContent = localText
    ? formatter.highlight(localText, isDark, errorInfo?.position ?? null)
    : `<span style="color: ${isDark ? '#6a6a6a' : '#a0a0a0'}">${placeholder}</span>`

  return (
    <TextRendererContext.Provider value={contextValue}>
      <Box sx={{
        position: 'relative',
        height,
        overflow: 'hidden',
        bgcolor: 'background.paper',
        borderRadius: 1,
        border: isDark ? 'none' : 1,
        borderColor: 'divider',
      }}>
        {children || <TextRendererToolbar />}
        <LineNumbers scrollTop={scrollPos.top} />

        {/* Syntax highlighted background */}
        {!showRawText && (
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 40,
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
            dangerouslySetInnerHTML={{ __html: highlightedContent }}
          />
        )}

        {/* Textarea for input */}
        <textarea
          ref={textareaRef}
          value={localText}
          onChange={(e) => handleTextChange(e.target.value, e.target.selectionStart)}
          onKeyDown={handleKeyDown}
          onScroll={handleScroll}
          placeholder={showRawText ? placeholder : undefined}
          style={{
            position: 'relative',
            width: 'calc(100% - 40px)',
            height: '100%',
            marginLeft: 40,
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

        {/* Error indicator */}
        {!isValid && errorInfo && (
          <Typography
            variant="caption"
            color="error"
            sx={{
              position: 'absolute',
              bottom: 4,
              right: 8,
              bgcolor: isDark ? 'grey.900' : 'grey.50',
              px: 1,
              py: 0.25,
              borderRadius: 0.5,
              pointerEvents: 'none',
            }}
          >
            Error (line {errorInfo.line})
          </Typography>
        )}
      </Box>

      {/* Fullscreen Modal */}
      {enableFullscreen && (
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
              {children || <TextRendererToolbar inFullscreen />}
              <LineNumbers scrollTop={fullscreenScrollPos.top} />

              {!showRawText && (
                <Box
                  sx={{
                    position: 'absolute',
                    top: 0,
                    left: 40,
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
                  dangerouslySetInnerHTML={{ __html: highlightedContent }}
                />
              )}

              <textarea
                ref={fullscreenTextareaRef}
                value={localText}
                onChange={(e) => handleTextChange(e.target.value, e.target.selectionStart)}
                onKeyDown={handleKeyDown}
                onScroll={handleFullscreenScroll}
                placeholder={showRawText ? placeholder : undefined}
                style={{
                  position: 'relative',
                  width: 'calc(100% - 40px)',
                  height: '100%',
                  marginLeft: 40,
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

              {!isValid && errorInfo && (
                <Typography
                  variant="caption"
                  color="error"
                  sx={{
                    position: 'absolute',
                    bottom: 8,
                    right: 16,
                    bgcolor: isDark ? 'grey.900' : 'grey.50',
                    px: 1,
                    py: 0.25,
                    borderRadius: 0.5,
                    pointerEvents: 'none',
                  }}
                >
                  Error (line {errorInfo.line})
                </Typography>
              )}
            </Box>
          </Box>
        </Modal>
      )}
    </TextRendererContext.Provider>
  )
}
