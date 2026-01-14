import { useRef, useState, useEffect, useCallback, useLayoutEffect, useMemo } from 'react'
import { Box, Typography, Modal, useTheme, Grow } from '@mui/material'
import { TextRendererContext } from './context'
import type {
  TextRendererProps,
  TextRendererContextValue,
} from './types'
import TextRendererToolbar from './TextRendererToolbar'
import LineNumbers from './LineNumbers'

export default function TextRenderer({
  value,
  onChange,
  placeholder = 'Enter text here...',
  onCopy,
  formatter,
  enableFullscreen = true,
  height = 300,
  children,
}: TextRendererProps) {
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'

  // Refs
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const fullscreenTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const pendingCursorRef = useRef<number | null>(null)
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null)
  const fullscreenCursorRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 })
  const isExitingFullscreenRef = useRef(false)

  // Scroll state
  const [scrollPos, setScrollPos] = useState({ top: 0, left: 0 })
  const [fullscreenScrollPos, setFullscreenScrollPos] = useState({ top: 0, left: 0 })

  // UI state
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showRawText, setShowRawText] = useState(false)
  const [showToolbar, setShowToolbar] = useState(false)

  // Edit mode - readonly by default unless Editor child is present
  const [isEditable, setIsEditable] = useState(false)

  // Editor handlers - set by Editor component when mounted
  const [editorHandlers, setEditorHandlers] = useState<{
    onInput?: (e: React.FormEvent<HTMLTextAreaElement>) => void
    onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  }>({})

  // Edit functions - use refs to avoid infinite loops with function state
  const handleTextChangeRef = useRef<(text: string, cursorPos?: number) => void>(() => { })
  const undoRef = useRef<() => void>(() => { })
  const redoRef = useRef<() => void>(() => { })
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  // Stable wrapper functions that read from refs
  const handleTextChange = useCallback((text: string, cursorPos?: number) => {
    handleTextChangeRef.current(text, cursorPos)
  }, [])
  const undo = useCallback(() => { undoRef.current() }, [])
  const redo = useCallback(() => { redoRef.current() }, [])

  // Local text state
  const [localText, setLocalText] = useState(value)

  // Sync local text when external value changes
  useEffect(() => {
    if (value !== localText) {
      setLocalText(value)
    }
  }, [value])

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
  }, [localText])

  // Validation
  const errorInfo = useMemo(() => formatter.getErrorPosition(localText), [localText, formatter])
  const isValid = !errorInfo

  // Helper to enter fullscreen while preserving cursor
  const enterFullscreen = useCallback(() => {
    if (textareaRef.current) {
      fullscreenCursorRef.current = {
        start: textareaRef.current.selectionStart,
        end: textareaRef.current.selectionEnd,
      }
    }
    setIsFullscreen(true)
  }, [])

  // Helper to exit fullscreen while preserving cursor
  const exitFullscreen = useCallback(() => {
    if (fullscreenTextareaRef.current) {
      fullscreenCursorRef.current = {
        start: fullscreenTextareaRef.current.selectionStart,
        end: fullscreenTextareaRef.current.selectionEnd,
      }
    }
    isExitingFullscreenRef.current = true
    setIsFullscreen(false)
  }, [])

  // Keyboard handler (for escape in fullscreen, delegate to editor handlers)
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    console.debug('[TextRenderer:handleKeyDown] event received:', {
      key: e.key,
      code: e.code,
      ctrlKey: e.ctrlKey,
      hasEditorHandler: !!editorHandlers.onKeyDown,
    })
    // Escape to exit fullscreen
    if (e.key === 'Escape' && isFullscreen) {
      exitFullscreen()
      return
    }
    // Delegate to editor handlers if present
    editorHandlers.onKeyDown?.(e)
  }, [isFullscreen, editorHandlers, exitFullscreen])

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

  // Handle focus when entering fullscreen (after animation completes)
  const handleFullscreenEntered = useCallback(() => {
    setFullscreenScrollPos({ top: 0, left: 0 })
    if (fullscreenTextareaRef.current) {
      fullscreenTextareaRef.current.scrollTop = 0
      fullscreenTextareaRef.current.scrollLeft = 0
      fullscreenTextareaRef.current.focus()
      fullscreenTextareaRef.current.selectionStart = fullscreenCursorRef.current.start
      fullscreenTextareaRef.current.selectionEnd = fullscreenCursorRef.current.end
    }
  }, [])

  // Restore focus after fullscreen modal exit animation completes
  const handleFullscreenExited = useCallback(() => {
    // Use double RAF to ensure we're after React's render cycle and DOM updates
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.focus()
          textareaRef.current.selectionStart = fullscreenCursorRef.current.start
          textareaRef.current.selectionEnd = fullscreenCursorRef.current.end
        }
        isExitingFullscreenRef.current = false
      })
    })
  }, [])

  // Line count for line numbers
  const lineCount = localText ? localText.split('\n').length : 1

  // Context value
  const contextValue: TextRendererContextValue = {
    localText,
    setLocalText,
    onChange,
    isEditable,
    setIsEditable,
    editorHandlers,
    setEditorHandlers,
    handleTextChange,
    handleTextChangeRef,
    canUndo,
    setCanUndo,
    canRedo,
    setCanRedo,
    undo,
    undoRef,
    redo,
    redoRef,
    isFullscreen,
    setIsFullscreen,
    enterFullscreen,
    exitFullscreen,
    showRawText,
    setShowRawText,
    isDark,
    isValid,
    errorInfo,
    formatter,
    textareaRef,
    fullscreenTextareaRef,
    pendingCursorRef,
    pendingSelectionRef,
    scrollPos,
    setScrollPos,
    fullscreenScrollPos,
    setFullscreenScrollPos,
    onCopy,
  }

  const highlightedContent = localText
    ? formatter.highlight(localText, isDark, errorInfo?.position ?? null)
    : `<span style="color: ${isDark ? '#6a6a6a' : '#a0a0a0'}">${placeholder}</span>`

  return (
    <TextRendererContext.Provider value={contextValue}>
      <Box
        sx={{
          position: 'relative',
          height,
          overflow: 'hidden',
          bgcolor: 'background.paper',
          borderRadius: 1,
          border: isDark ? 'none' : 1,
          borderColor: 'divider',
        }}
        onMouseEnter={() => setShowToolbar(true)}
        onMouseLeave={() => setShowToolbar(false)}
        onFocus={() => setShowToolbar(true)}
        onBlur={(e) => {
          // Ignore blur events during fullscreen exit transition
          if (isExitingFullscreenRef.current) return
          // Only hide if focus moves outside this container
          if (!e.currentTarget.contains(e.relatedTarget)) {
            setShowToolbar(false)
          }
        }}
      >
        {children || (showToolbar && <TextRendererToolbar enableFullscreen={enableFullscreen} />)}
        <LineNumbers scrollTop={scrollPos.top} lineCount={lineCount} />

        {/* Syntax highlighted background */}
        {!showRawText && (
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 28,
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
          onInput={editorHandlers.onInput}
          onKeyDown={handleKeyDown}
          onScroll={handleScroll}
          placeholder={showRawText ? placeholder : undefined}
          readOnly={!isEditable}
          style={{
            position: 'relative',
            width: 'calc(100% - 28px)',
            height: '100%',
            marginLeft: 28,
            fontFamily: 'monospace',
            fontSize: '0.875rem',
            lineHeight: 1.5,
            padding: 12,
            background: 'transparent',
            color: showRawText ? theme.palette.text.primary : 'transparent',
            caretColor: isEditable ? theme.palette.text.primary : 'transparent',
            border: 'none',
            outline: 'none',
            resize: 'none',
            whiteSpace: 'pre',
            overflow: 'auto',
            cursor: isEditable ? 'text' : 'default',
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
          onClose={exitFullscreen}
          closeAfterTransition
        >
          <Grow in={isFullscreen} timeout={200} onEntered={handleFullscreenEntered} onExited={handleFullscreenExited}>
            <Box sx={{
              width: '100vw',
              height: '100vh',
              bgcolor: 'background.paper',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}>
              <Box sx={{ position: 'relative', height: '100%', overflow: 'hidden', bgcolor: 'background.paper' }}>
                {children || <TextRendererToolbar enableFullscreen={enableFullscreen} />}
                <LineNumbers scrollTop={fullscreenScrollPos.top} lineCount={lineCount} />

                {!showRawText && (
                  <Box
                    sx={{
                      position: 'absolute',
                      top: 0,
                      left: 28,
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
                  onInput={editorHandlers.onInput}
                  onKeyDown={handleKeyDown}
                  onScroll={handleFullscreenScroll}
                  placeholder={showRawText ? placeholder : undefined}
                  readOnly={!isEditable}
                  style={{
                    position: 'relative',
                    width: 'calc(100% - 28px)',
                    height: '100%',
                    marginLeft: 28,
                    fontFamily: 'monospace',
                    fontSize: '0.875rem',
                    lineHeight: 1.5,
                    padding: 12,
                    background: 'transparent',
                    color: showRawText ? theme.palette.text.primary : 'transparent',
                    caretColor: isEditable ? theme.palette.text.primary : 'transparent',
                    border: 'none',
                    outline: 'none',
                    resize: 'none',
                    whiteSpace: 'pre',
                    overflow: 'auto',
                    cursor: isEditable ? 'text' : 'default',
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
          </Grow>
        </Modal>
      )}
    </TextRendererContext.Provider>
  )
}
