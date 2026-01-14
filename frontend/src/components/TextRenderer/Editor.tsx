import { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { useTextRenderer } from './context'
import type { HistoryEntry, KeyboardShortcut } from './types'
import { defaultShortcuts, matchesShortcut, buildShortcutContext } from './shortcuts'
import TextRendererToolbar from './TextRendererToolbar'

// Stable empty array to avoid re-renders when no custom shortcuts provided
const EMPTY_SHORTCUTS: KeyboardShortcut[] = []

interface EditorProps {
  enableFullscreen?: boolean
  showToolbar?: boolean
  inFullscreen?: boolean
  /** Custom keyboard shortcuts (will be merged with defaults) */
  shortcuts?: KeyboardShortcut[]
  /** If true, only use provided shortcuts and skip defaults */
  replaceDefaultShortcuts?: boolean
}

export default function Editor({
  enableFullscreen = true,
  showToolbar = true,
  inFullscreen = false,
  shortcuts: customShortcuts,
  replaceDefaultShortcuts = false,
}: EditorProps) {
  const {
    localText,
    setLocalText,
    onChange,
    textareaRef,
    pendingCursorRef,
    pendingSelectionRef,
    setIsEditable,
    setEditorHandlers,
    handleTextChangeRef,
    setCanUndo,
    setCanRedo,
    undoRef,
    redoRef,
  } = useTextRenderer()

  // Merge shortcuts: custom shortcuts override defaults with same id (memoized to prevent re-renders)
  // Use stable empty array reference when no custom shortcuts provided
  const shortcuts = customShortcuts ?? EMPTY_SHORTCUTS
  const activeShortcuts = useMemo(() => {
    return replaceDefaultShortcuts
      ? shortcuts
      : [
        ...defaultShortcuts.filter(
          ds => !shortcuts.some(cs => cs.id === ds.id)
        ),
        ...shortcuts,
      ]
  }, [shortcuts, replaceDefaultShortcuts])

  // History for undo/redo
  const [historyState, setHistoryState] = useState<{ entries: HistoryEntry[], index: number }>({
    entries: [],
    index: -1
  })
  const historyRef = useRef(historyState)

  useEffect(() => {
    historyRef.current = historyState
  }, [historyState])

  // Enable editing mode when Editor mounts
  useEffect(() => {
    setIsEditable(true)
    // Don't reset isEditable on unmount - it causes issues when modal closes
  }, [setIsEditable])

  // Initialize history
  useEffect(() => {
    if (historyState.entries.length === 0) {
      setHistoryState({
        entries: [{ text: localText, cursorPos: localText.length, scrollTop: 0 }],
        index: 0
      })
    }
  }, [])

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
  }, [textareaRef])

  // Undo
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
  }, [localText, onChange, textareaRef, setLocalText, pendingCursorRef])

  // Redo
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
  }, [onChange, textareaRef, setLocalText, pendingCursorRef])

  // Handle text change with history
  const handleTextChangeWithHistory = useCallback((newText: string, cursorPos?: number) => {
    setLocalText(newText)
    addToHistory(newText, cursorPos ?? newText.length)
    onChange(newText)
  }, [addToHistory, onChange, setLocalText])

  // Keyboard handler using configurable shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    console.debug('[TextRenderer] keydown detected:', {
      key: e.key,
      code: e.code,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
    })

    // Built-in undo/redo (always available)
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

    // Process configurable shortcuts
    const target = e.target as HTMLTextAreaElement
    const text = target.value
    const selectionStart = target.selectionStart
    const selectionEnd = target.selectionEnd

    console.debug('[TextRenderer] checking shortcuts, activeShortcuts:', activeShortcuts.map(s => s.id))

    for (const shortcut of activeShortcuts) {
      const matches = matchesShortcut(e, shortcut.shortcut)
      console.debug(`[TextRenderer] checking shortcut "${shortcut.id}" (${shortcut.shortcut}):`, matches)
      if (matches) {
        const context = buildShortcutContext(text, selectionStart, selectionEnd)
        const result = shortcut.action(context)

        if (result) {
          if (result.preventDefault !== false) {
            e.preventDefault()
          }

          if (result.text !== undefined) {
            handleTextChangeWithHistory(result.text, result.cursorPos ?? selectionStart)

            if (result.selection) {
              pendingSelectionRef.current = result.selection
            } else if (result.cursorPos !== undefined) {
              pendingCursorRef.current = result.cursorPos
            }
          }
        }

        return
      }
    }
  }, [undo, redo, handleTextChangeWithHistory, pendingCursorRef, pendingSelectionRef, activeShortcuts])

  // Input handler
  const handleInput = useCallback((e: React.FormEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement
    handleTextChangeWithHistory(target.value, target.selectionStart)
  }, [handleTextChangeWithHistory])

  // Register handlers with parent context
  useEffect(() => {
    setEditorHandlers({
      onInput: handleInput,
      onKeyDown: handleKeyDown,
    })
    return () => setEditorHandlers({})
  }, [setEditorHandlers, handleInput, handleKeyDown])

  // Register edit functions with parent context (via refs to avoid infinite loops)
  useEffect(() => {
    handleTextChangeRef.current = handleTextChangeWithHistory
    undoRef.current = undo
    redoRef.current = redo
  }, [handleTextChangeRef, undoRef, redoRef, handleTextChangeWithHistory, undo, redo])

  // Update canUndo/canRedo when history changes
  useEffect(() => {
    setCanUndo(historyState.index > 0)
    setCanRedo(historyState.index < historyState.entries.length - 1)
  }, [historyState, setCanUndo, setCanRedo])

  // Render toolbar if enabled
  if (!showToolbar) return null

  return <TextRendererToolbar enableFullscreen={enableFullscreen} />
}
