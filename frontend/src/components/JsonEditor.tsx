import { useRef, useState, useEffect, useCallback, useLayoutEffect } from 'react'
import { Box, IconButton, Tooltip, Typography, Modal, useTheme, Menu, MenuItem, ListItemIcon, ListItemText, Divider } from '@mui/material'
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

interface HistoryEntry {
  text: string
  cursorPos: number
  scrollTop: number
}

interface JsonEditorProps {
  value: { json: any; rawJson?: string } | any
  onChange: (value: { json: any; rawJson: string } | undefined) => void
  placeholder?: string
}

// Strip JSONC comments (// and /* */) for parsing
// Set preservePositions=true to replace comments with spaces (for error position mapping)
const stripJsonComments = (jsonc: string, preservePositions = false): string => {
  let result = ''
  let i = 0
  let inString = false
  let escaped = false

  while (i < jsonc.length) {
    const char = jsonc[i]
    const nextChar = jsonc[i + 1]

    // Handle string state
    if (inString) {
      result += char
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      i++
      continue
    }

    // Start of string
    if (char === '"') {
      inString = true
      result += char
      i++
      continue
    }

    // Single-line comment
    if (char === '/' && nextChar === '/') {
      // Replace with spaces until end of line (preserve newline)
      while (i < jsonc.length && jsonc[i] !== '\n') {
        result += preservePositions ? ' ' : ''
        i++
      }
      continue
    }

    // Multi-line comment
    if (char === '/' && nextChar === '*') {
      const startIdx = i
      i += 2 // Skip /*
      while (i < jsonc.length && !(jsonc[i] === '*' && jsonc[i + 1] === '/')) {
        i++
      }
      i += 2 // Skip */
      // Replace with spaces/newlines to preserve positions
      if (preservePositions) {
        for (let j = startIdx; j < i; j++) {
          result += jsonc[j] === '\n' ? '\n' : ' '
        }
      }
      continue
    }

    result += char
    i++
  }

  return result
}

// Format JSONC while preserving comments
// Comments are extracted, JSON is formatted, then comments are re-inserted with proper indentation
const formatJsonc = (jsonc: string): string => {
  // Extract comments with their context
  interface CommentInfo {
    type: 'line' | 'block'
    text: string
    lineIndex: number
    isStandalone: boolean // Comment on its own line vs inline
    precedingContent: string // Non-comment content before this on same line
    followingJsonContent: string // The next JSON content after this comment (for standalone)
  }

  const lines = jsonc.split('\n')
  const comments: CommentInfo[] = []
  const cleanLines: string[] = []

  // Parse each line to extract comments
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]
    let i = 0
    let inString = false
    let escaped = false
    let cleanPart = ''

    while (i < line.length) {
      const char = line[i]
      const nextChar = line[i + 1]

      if (inString) {
        cleanPart += char
        if (escaped) {
          escaped = false
        } else if (char === '\\') {
          escaped = true
        } else if (char === '"') {
          inString = false
        }
        i++
        continue
      }

      if (char === '"') {
        inString = true
        cleanPart += char
        i++
        continue
      }

      // Single-line comment
      if (char === '/' && nextChar === '/') {
        const commentText = line.substring(i)
        const precedingContent = cleanPart.trim()
        comments.push({
          type: 'line',
          text: commentText.trim(),
          lineIndex,
          isStandalone: precedingContent === '',
          precedingContent,
          followingJsonContent: '' // Will be filled in later
        })
        break // Rest of line is comment
      }

      // Block comment
      if (char === '/' && nextChar === '*') {
        const endIdx = line.indexOf('*/', i + 2)
        if (endIdx !== -1) {
          const commentText = line.substring(i, endIdx + 2)
          const precedingContent = cleanPart.trim()
          const followingContent = line.substring(endIdx + 2).trim()
          comments.push({
            type: 'block',
            text: commentText,
            lineIndex,
            isStandalone: precedingContent === '' && followingContent === '',
            precedingContent,
            followingJsonContent: ''
          })
          i = endIdx + 2
          continue
        } else {
          // Multi-line block comment - find closing across lines
          let blockContent = line.substring(i)
          let endLine = lineIndex
          for (let j = lineIndex + 1; j < lines.length; j++) {
            const closeIdx = lines[j].indexOf('*/')
            if (closeIdx !== -1) {
              blockContent += '\n' + lines[j].substring(0, closeIdx + 2)
              endLine = j
              break
            } else {
              blockContent += '\n' + lines[j]
            }
          }
          const precedingContent = cleanPart.trim()
          comments.push({
            type: 'block',
            text: blockContent,
            lineIndex,
            isStandalone: precedingContent === '',
            precedingContent,
            followingJsonContent: ''
          })
          // Skip lines consumed by block comment
          for (let j = lineIndex; j < endLine; j++) {
            cleanLines.push(cleanPart)
            cleanPart = ''
            lineIndex++
          }
          break
        }
      }

      cleanPart += char
      i++
    }

    cleanLines.push(cleanPart)
  }

  // For standalone comments, find the next line with actual JSON content
  for (const comment of comments) {
    if (comment.isStandalone) {
      // Look forward from this comment's line to find next JSON content
      for (let j = comment.lineIndex + 1; j < lines.length; j++) {
        const lineContent = stripJsonComments(lines[j]).trim()
        if (lineContent && lineContent !== '{' && lineContent !== '[' && lineContent !== '}' && lineContent !== ']' && lineContent !== '},') {
          // Extract the key or value identifier
          const keyMatch = lineContent.match(/"([^"]+)"/)
          if (keyMatch) {
            comment.followingJsonContent = keyMatch[1]
            break
          }
        }
      }
    }
  }

  // Join and parse the clean JSON
  const cleanJson = cleanLines.join('\n')
  const stripped = stripJsonComments(cleanJson)

  if (!stripped.trim()) {
    // Only comments, just normalize indentation
    return comments.map(c => c.text).join('\n')
  }

  let parsed: any
  try {
    parsed = JSON.parse(stripped)
  } catch {
    // Can't parse, return original
    return jsonc
  }

  // Find the first JSON line in original
  const firstJsonLineIdx = lines.findIndex(l => {
    const trimmed = l.trim()
    return trimmed.startsWith('{') || trimmed.startsWith('[')
  })

  // Categorize comments
  const headerComments: CommentInfo[] = []
  const inlineComments: CommentInfo[] = []
  const standaloneBodyComments: CommentInfo[] = []

  for (const comment of comments) {
    if (comment.lineIndex < firstJsonLineIdx || firstJsonLineIdx === -1) {
      headerComments.push(comment)
    } else if (comment.isStandalone) {
      standaloneBodyComments.push(comment)
    } else {
      inlineComments.push(comment)
    }
  }

  // Format JSON
  const formatted = JSON.stringify(parsed, null, 2)
  const formattedLines = formatted.split('\n')

  // Build result
  const resultLines: string[] = []

  // Add header comments
  for (const comment of headerComments) {
    resultLines.push(comment.text)
  }

  // Process formatted lines and insert comments
  for (let i = 0; i < formattedLines.length; i++) {
    const formattedLine = formattedLines[i]
    const formattedTrimmed = formattedLine.trim()
    const indent = formattedLine.match(/^(\s*)/)?.[1] || ''

    // Check for standalone comments that should appear BEFORE this line
    const standaloneToInsert = standaloneBodyComments.filter(c => {
      if (!c.followingJsonContent) return false
      // Check if this formatted line contains the key that follows the comment
      return formattedTrimmed.includes('"' + c.followingJsonContent + '"')
    })

    for (const comment of standaloneToInsert) {
      resultLines.push(indent + comment.text)
      // Remove from array so we don't insert again
      const idx = standaloneBodyComments.indexOf(comment)
      standaloneBodyComments.splice(idx, 1)
    }

    // Find inline comments that match this content
    const matchingInlineComment = inlineComments.find(c => {
      // Match by preceding content (the JSON part before the comment)
      const contentToMatch = c.precedingContent.replace(/,\s*$/, '').trim()
      // Check if this formatted line contains similar content
      return formattedTrimmed.includes(contentToMatch) && contentToMatch.length > 0
    })

    if (matchingInlineComment) {
      // Remove from array so we don't match again
      const idx = inlineComments.indexOf(matchingInlineComment)
      inlineComments.splice(idx, 1)
      // Add line with inline comment
      resultLines.push(formattedLine + ' ' + matchingInlineComment.text)
    } else {
      resultLines.push(formattedLine)
    }
  }

  // Add any remaining standalone body comments at the end (before closing bracket)
  if (standaloneBodyComments.length > 0 && resultLines.length > 1) {
    const lastLine = resultLines.pop()!
    const lastIndent = lastLine.match(/^(\s*)/)?.[1] || ''
    const commentIndent = lastIndent + '  '
    for (const comment of standaloneBodyComments) {
      resultLines.push(commentIndent + comment.text)
    }
    resultLines.push(lastLine)
  }

  return resultLines.join('\n')
}

// Parse JSON error to get position (strips JSONC comments first)
const getJsonErrorPosition = (jsonc: string): { position: number; line: number; message: string } | null => {
  const json = stripJsonComments(jsonc, true) // Preserve positions for accurate error mapping
  // If only comments/whitespace, it's valid (empty)
  if (!json.trim()) return null
  try {
    JSON.parse(json)
    return null
  } catch (e) {
    if (e instanceof SyntaxError) {
      const message = e.message
      // Helper to calculate line number from position
      const getLineFromPos = (pos: number) => {
        let line = 1
        for (let i = 0; i < pos && i < json.length; i++) {
          if (json[i] === '\n') line++
        }
        return line
      }
      // Try to extract position from error message
      // Chrome/V8: "Unexpected token x in JSON at position 123"
      // Firefox: "JSON.parse: unexpected character at line 1 column 2"
      const posMatch = message.match(/position\s+(\d+)/i)
      if (posMatch) {
        const position = parseInt(posMatch[1], 10)
        return { position, line: getLineFromPos(position), message }
      }
      // Firefox format - convert line/column to position
      const lineColMatch = message.match(/line\s+(\d+)\s+column\s+(\d+)/i)
      if (lineColMatch) {
        const line = parseInt(lineColMatch[1], 10)
        const col = parseInt(lineColMatch[2], 10)
        const lines = json.split('\n')
        let pos = 0
        for (let i = 0; i < line - 1 && i < lines.length; i++) {
          pos += lines[i].length + 1
        }
        pos += col - 1
        return { position: pos, line, message }
      }
      // If we can't find position, return end of string
      const position = json.length
      return { position, line: getLineFromPos(position), message }
    }
    return null
  }
}

// Simple syntax highlighting for JSON with optional error squiggle
const highlightJson = (json: string, isDark: boolean, errorPos: number | null = null) => {
  // Escape HTML first
  const escaped = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  // Theme-aware colors
  const colors = isDark
    ? { key: '#9cdcfe', string: '#ce9178', number: '#b5cea8', keyword: '#569cd6', comment: '#6a9955' }
    : { key: '#0451a5', string: '#a31515', number: '#098658', keyword: '#0000ff', comment: '#008000' }

  // First highlight comments (before other syntax to avoid conflicts)
  let highlighted = escaped
    // Single-line comments
    .replace(/(\/\/.*?)$/gm, `<span style="color: ${colors.comment}; font-style: italic">$1</span>`)
    // Multi-line comments
    .replace(/(\/\*[\s\S]*?\*\/)/g, `<span style="color: ${colors.comment}; font-style: italic">$1</span>`)

  // Apply syntax highlighting (only to non-comment parts)
  highlighted = highlighted
    .replace(/"([^"]+)":/g, `<span style="color: ${colors.key}">"$1"</span>:`)
    .replace(/: "([^"]*)"/g, `: <span style="color: ${colors.string}">"$1"</span>`)
    .replace(/: (-?\d+\.?\d*)/g, `: <span style="color: ${colors.number}">$1</span>`)
    .replace(/: (true|false)/g, `: <span style="color: ${colors.keyword}">$1</span>`)
    .replace(/: (null)/g, `: <span style="color: ${colors.keyword}">$1</span>`)

  // Add error squiggle if there's an error position
  if (errorPos !== null && errorPos >= 0) {
    const errorColor = isDark ? '#f44336' : '#d32f2f'
    const squiggleStyle = `text-decoration: wavy underline ${errorColor}; text-decoration-skip-ink: none;`

    // Find the line containing the error
    const lines = json.split('\n')
    let lineStart = 0
    let errorLineIdx = 0

    for (let i = 0; i < lines.length; i++) {
      const lineEnd = lineStart + lines[i].length
      if (errorPos <= lineEnd) {
        errorLineIdx = i
        break
      }
      lineStart += lines[i].length + 1 // +1 for newline
    }

    // Squiggle from error position to end of line
    const start = errorPos
    const end = lineStart + lines[errorLineIdx].length

    // If error is at very end or past line, squiggle the whole line
    const actualStart = (start >= end) ? lineStart : start
    const actualEnd = Math.max(actualStart + 1, end)

    // Re-process from escaped text to insert squiggle
    const escapedChars = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

    // Calculate new positions accounting for escape sequences
    let escapedStart = 0
    let escapedEnd = 0
    let origIdx = 0
    for (let i = 0; i < escapedChars.length && origIdx <= actualEnd; i++) {
      if (origIdx === actualStart) escapedStart = i
      if (origIdx === actualEnd) {
        escapedEnd = i
        break
      }
      // Check if we're at an escape sequence
      if (escapedChars.substring(i, i + 5) === '&amp;') {
        origIdx++
        i += 4
      } else if (escapedChars.substring(i, i + 4) === '&lt;' || escapedChars.substring(i, i + 4) === '&gt;') {
        origIdx++
        i += 3
      } else {
        origIdx++
      }
    }
    if (escapedEnd === 0) escapedEnd = escapedChars.length

    // Insert squiggle span (before syntax highlighting to avoid breaking spans)
    const beforeError = escapedChars.substring(0, escapedStart)
    const errorText = escapedChars.substring(escapedStart, escapedEnd)
    const afterError = escapedChars.substring(escapedEnd)

    const withSquiggle = beforeError + `<span style="${squiggleStyle}">` + errorText + '</span>' + afterError

    // Now apply syntax highlighting
    highlighted = withSquiggle
      .replace(/"([^"]+)":/g, `<span style="color: ${colors.key}">"$1"</span>:`)
      .replace(/: "([^"]*)"/g, `: <span style="color: ${colors.string}">"$1"</span>`)
      .replace(/: (-?\d+\.?\d*)/g, `: <span style="color: ${colors.number}">$1</span>`)
      .replace(/: (true|false)/g, `: <span style="color: ${colors.keyword}">$1</span>`)
      .replace(/: (null)/g, `: <span style="color: ${colors.keyword}">$1</span>`)
  }

  return highlighted
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
  const [contextMenu, setContextMenu] = useState<{ mouseX: number; mouseY: number } | null>(null)
  const [hasSelection, setHasSelection] = useState(false)

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
  const [localText, setLocalText] = useState(() => {
    if (!value) return ''
    // Support new { json, rawJson } format
    if (value && typeof value === 'object' && 'rawJson' in value) {
      return value.rawJson || ''
    }
    // Legacy format - plain value
    return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  })

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

  // Helper to emit changes in the new format
  const emitChange = useCallback((rawJson: string) => {
    if (!rawJson) {
      onChange(undefined)
      return
    }
    const stripped = stripJsonComments(rawJson)
    // If only comments/whitespace, treat as empty
    if (!stripped.trim()) {
      onChange({ json: undefined, rawJson })
      return
    }
    try {
      const json = JSON.parse(stripped)
      onChange({ json, rawJson })
    } catch {
      // Invalid JSON - still emit with null json
      onChange({ json: null, rawJson })
    }
  }, [onChange])

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

      emitChange(entry.text)
    }
  }, [emitChange, localText])

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

      emitChange(entry.text)
    }
  }, [emitChange])

  const canUndo = historyState.index > 0
  const canRedo = historyState.index < historyState.entries.length - 1

  // Sync local text when external value changes (e.g., initial load)
  useEffect(() => {
    // Support new { json, rawJson } format
    let externalText: string
    let externalJson: any
    if (value && typeof value === 'object' && 'rawJson' in value) {
      externalText = value.rawJson || ''
      externalJson = value.json
    } else if (!value) {
      externalText = ''
      externalJson = undefined
    } else {
      externalText = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
      externalJson = typeof value === 'object' ? value : undefined
    }

    // Only update if significantly different (not just whitespace from our edits)
    if (externalText !== localText) {
      try {
        const localStripped = stripJsonComments(localText)
        const localParsed = JSON.parse(localStripped)
        const externalParsed = externalJson ?? JSON.parse(externalText)
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

  // Determine if value is valid JSON and get error position
  const jsonError = localText ? getJsonErrorPosition(localText) : null
  const isValid = !jsonError

  const handleTextChange = (newText: string, cursorPos?: number) => {
    setLocalText(newText)
    addToHistory(newText, cursorPos ?? newText.length)
    emitChange(newText)
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

    // Handle block comment with Ctrl+Shift+/ (key becomes '?' with shift on US keyboards)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === '/' || e.key === '?')) {
      e.preventDefault()
      const target = e.target as HTMLTextAreaElement
      const start = target.selectionStart
      const end = target.selectionEnd
      const currentValue = target.value

      let newText: string
      let newCursorPos: number

      if (start !== end) {
        // Wrap selection with block comment
        const selection = currentValue.substring(start, end)
        const wrapped = '/* ' + selection + ' */'
        newText = currentValue.substring(0, start) + wrapped + currentValue.substring(end)
        newCursorPos = start + wrapped.length
      } else {
        // Insert empty block comment with cursor in middle
        const blockComment = '/*  */'
        newText = currentValue.substring(0, start) + blockComment + currentValue.substring(end)
        newCursorPos = start + 3 // Position after "/* "
      }

      setLocalText(newText)
      addToHistory(newText, newCursorPos)
      pendingCursorRef.current = newCursorPos
      emitChange(newText)
      return
    }

    // Handle comment with Ctrl+/
    if ((e.ctrlKey || e.metaKey) && e.key === '/') {
      e.preventDefault()
      const target = e.target as HTMLTextAreaElement
      const start = target.selectionStart
      const end = target.selectionEnd
      const currentValue = target.value

      // Find line boundaries for the line containing the cursor start
      // Special case: if start is 0, line starts at 0
      const lineStartIdx = start === 0 ? 0 : currentValue.lastIndexOf('\n', start - 1) + 1
      // For single line operations, find end of the line containing start
      let lineEndIdx = currentValue.indexOf('\n', start)
      if (lineEndIdx === -1) lineEndIdx = currentValue.length

      const hasSelection = start !== end
      // Check if selection spans multiple lines
      const selectionSpansLines = hasSelection && currentValue.substring(start, end).includes('\n')

      // If selection spans multiple lines, wrap with block comment
      if (selectionSpansLines) {
        const actualSelection = currentValue.substring(start, end)
        // Check if already wrapped in block comment
        if (actualSelection.startsWith('/*') && actualSelection.endsWith('*/')) {
          // Unwrap block comment
          const unwrapped = actualSelection.slice(2, -2).trim()
          const newText = currentValue.substring(0, start) + unwrapped + currentValue.substring(end)
          const newCursorPos = start + unwrapped.length
          setLocalText(newText)
          addToHistory(newText, newCursorPos)
          pendingSelectionRef.current = { start, end: start + unwrapped.length }
          emitChange(newText)
        } else {
          // Wrap with block comment
          const wrapped = '/* ' + actualSelection + ' */'
          const newText = currentValue.substring(0, start) + wrapped + currentValue.substring(end)
          const newCursorPos = start + wrapped.length
          setLocalText(newText)
          addToHistory(newText, newCursorPos)
          pendingSelectionRef.current = { start, end: start + wrapped.length }
          emitChange(newText)
        }
        return
      }

      // Single line handling
      const currentLine = currentValue.substring(lineStartIdx, lineEndIdx)
      const isEmptyLine = currentLine.trim() === ''
      const isCommented = currentLine.trimStart().startsWith('//')

      let newText: string
      let newCursorPos: number

      if (isCommented) {
        // Uncomment: remove //
        const match = currentLine.match(/^(\s*)\/\/\s?(.*)$/)
        const uncommented = match ? match[1] + match[2] : currentLine
        newText = currentValue.substring(0, lineStartIdx) + uncommented + currentValue.substring(lineEndIdx)
        newCursorPos = lineStartIdx + uncommented.length
      } else if (isEmptyLine) {
        // Empty line: add // and place cursor after
        const indent = currentLine.match(/^(\s*)/)?.[1] || ''
        const commented = indent + '// '
        newText = currentValue.substring(0, lineStartIdx) + commented + currentValue.substring(lineEndIdx)
        newCursorPos = lineStartIdx + commented.length
      } else {
        // Line with content: add // at start, cursor to end
        const indent = currentLine.match(/^(\s*)/)?.[1] || ''
        const commented = indent + '// ' + currentLine.trimStart()
        newText = currentValue.substring(0, lineStartIdx) + commented + currentValue.substring(lineEndIdx)
        newCursorPos = lineStartIdx + commented.length
      }

      setLocalText(newText)
      addToHistory(newText, newCursorPos)
      pendingCursorRef.current = newCursorPos
      emitChange(newText)
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

          emitChange(newValue)
        }
        return;
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

        emitChange(newValue)
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

        emitChange(newValue)
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

        emitChange(newValue)
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

        emitChange(newValue)
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

    // Try to format if it's valid JSON/JSONC being pasted into an empty field
    if (!currentValue.trim() || (start === 0 && end === currentValue.length)) {
      try {
        const stripped = stripJsonComments(pastedText)
        const parsed = JSON.parse(stripped)
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

    emitChange(newValue)
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

  // Context menu handlers
  const handleContextMenu = (e: React.MouseEvent<HTMLTextAreaElement>) => {
    e.preventDefault()
    const textarea = e.currentTarget
    setHasSelection(textarea.selectionStart !== textarea.selectionEnd)
    setContextMenu({ mouseX: e.clientX, mouseY: e.clientY })
  }

  const handleCloseContextMenu = () => {
    setContextMenu(null)
  }

  const getActiveTextarea = () => {
    return isFullscreen ? fullscreenTextareaRef.current : textareaRef.current
  }

  const handleSelectAll = () => {
    const textarea = getActiveTextarea()
    if (textarea) {
      textarea.select()
      textarea.focus()
    }
    handleCloseContextMenu()
  }

  const handleCopy = async () => {
    const textarea = getActiveTextarea()
    if (textarea) {
      const selectedText = localText.substring(textarea.selectionStart, textarea.selectionEnd)
      if (selectedText) {
        await navigator.clipboard.writeText(selectedText)
      }
    }
    handleCloseContextMenu()
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
    handleCloseContextMenu()
  }

  const handlePasteFromMenu = async () => {
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
    handleCloseContextMenu()
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

  // Calculate line count for line numbers
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
        <LineNumbers scrollTop={scrollPos.top} />
        {/* Syntax highlighted background - moves with textarea scroll */}
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
            dangerouslySetInnerHTML={{
              __html: localText
                ? highlightJson(localText, isDark, jsonError?.position ?? null)
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
          onContextMenu={handleContextMenu}
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
        {!isValid && jsonError && (
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
            Invalid JSON (line {jsonError.line})
          </Typography>
        )}
      </Box>

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
            <LineNumbers scrollTop={fullscreenScrollPos.top} />
            {/* Syntax highlighted background - moves with textarea scroll */}
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
                dangerouslySetInnerHTML={{
                  __html: localText
                    ? highlightJson(localText, isDark, jsonError?.position ?? null)
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
              onContextMenu={handleContextMenu}
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
            {!isValid && jsonError && (
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
                Invalid JSON (line {jsonError.line})
              </Typography>
            )}
          </Box>
        </Box>
      </Modal>

      {/* Context Menu */}
      <Menu
        open={contextMenu !== null}
        onClose={handleCloseContextMenu}
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
        <MenuItem onClick={handlePasteFromMenu}>
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
            handleCloseContextMenu()
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
            handleCloseContextMenu()
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
            handleCloseContextMenu()
            try {
              const stripped = stripJsonComments(localText)
              const parsed = JSON.parse(stripped)
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
            handleCloseContextMenu()
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
    </>
  )
}
