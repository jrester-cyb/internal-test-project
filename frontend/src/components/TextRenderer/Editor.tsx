import { useRef, useState, useEffect, useCallback } from 'react'
import { useTextRenderer } from './context'
import type { HistoryEntry } from './types'
import TextRendererToolbar from './TextRendererToolbar'

interface EditorProps {
  enableFullscreen?: boolean
  showToolbar?: boolean
  inFullscreen?: boolean
}

export default function Editor({
  enableFullscreen = true,
  showToolbar = true,
  inFullscreen = false
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
  } = useTextRenderer()

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

  // Keyboard handler for undo/redo and tab
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
        handleTextChangeWithHistory(newValue, lineStart)
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

        handleTextChangeWithHistory(newValue, newCursorPos)
        pendingCursorRef.current = newCursorPos
      }
    }
  }, [undo, redo, handleTextChangeWithHistory, pendingCursorRef, pendingSelectionRef])

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

  // Render toolbar if enabled
  if (!showToolbar) return null

  return <TextRendererToolbar enableFullscreen={enableFullscreen} />
}
