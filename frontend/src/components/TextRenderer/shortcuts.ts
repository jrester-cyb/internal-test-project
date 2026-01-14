import type { KeyboardShortcut, ShortcutContext, ShortcutResult } from './types'

/**
 * Parse a shortcut string into its component parts
 * e.g., "Ctrl+Shift+/" => { ctrl: true, shift: true, alt: false, meta: false, key: "/" }
 */
export function parseShortcut(shortcut: string): {
  ctrl: boolean
  shift: boolean
  alt: boolean
  meta: boolean
  mod: boolean // Ctrl on Windows/Linux, Meta on Mac
  key: string
} {
  const parts = shortcut.toLowerCase().split('+')
  const key = parts.pop() || ''
  
  return {
    ctrl: parts.includes('ctrl'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
    meta: parts.includes('meta') || parts.includes('cmd'),
    mod: parts.includes('mod'),
    key: key.toLowerCase(),
  }
}

/**
 * Check if a keyboard event matches a shortcut pattern
 */
export function matchesShortcut(
  e: React.KeyboardEvent<HTMLTextAreaElement>,
  shortcut: string
): boolean {
  const parsed = parseShortcut(shortcut)
  // Check if running on Mac (using userAgentData if available, fallback to userAgent)
  const isMac = (navigator as { userAgentData?: { platform: string } }).userAgentData?.platform === 'macOS' 
    || navigator.userAgent.includes('Mac')
  
  // Handle "Mod" which is Ctrl on Windows/Linux, Meta on Mac
  let modMatches = true
  if (parsed.mod) {
    modMatches = isMac ? e.metaKey : e.ctrlKey
  }
  
  // Check each modifier
  // When "Mod" is used, we need to handle ctrl/meta specially:
  // - On Mac: Mod means metaKey, so ctrlKey should match parsed.ctrl (usually false)
  // - On Linux/Windows: Mod means ctrlKey, so we expect ctrlKey=true and don't check parsed.ctrl
  let ctrlMatches: boolean
  if (parsed.mod) {
    // Mod is being used - on non-Mac, ctrl is already checked via modMatches
    ctrlMatches = isMac ? e.ctrlKey === parsed.ctrl : true
  } else {
    ctrlMatches = e.ctrlKey === parsed.ctrl
  }
  
  let metaMatches: boolean
  if (parsed.mod) {
    // Mod is being used - on Mac, meta is already checked via modMatches
    metaMatches = isMac ? true : e.metaKey === parsed.meta
  } else {
    metaMatches = e.metaKey === parsed.meta
  }
  
  const shiftMatches = e.shiftKey === parsed.shift
  const altMatches = e.altKey === parsed.alt
  
  // Handle special key names
  let keyMatches = false
  const eventKey = e.key.toLowerCase()
  
  switch (parsed.key) {
    case 'arrowup':
      keyMatches = eventKey === 'arrowup'
      break
    case 'arrowdown':
      keyMatches = eventKey === 'arrowdown'
      break
    case 'arrowleft':
      keyMatches = eventKey === 'arrowleft'
      break
    case 'arrowright':
      keyMatches = eventKey === 'arrowright'
      break
    case 'tab':
      keyMatches = eventKey === 'tab'
      break
    case 'enter':
      keyMatches = eventKey === 'enter'
      break
    case 'escape':
    case 'esc':
      keyMatches = eventKey === 'escape'
      break
    case '/':
      // Shift+/ produces '?' on US keyboards
      keyMatches = eventKey === '/' || (parsed.shift && eventKey === '?')
      break
    default:
      keyMatches = eventKey === parsed.key
  }
  
  const result = modMatches && ctrlMatches && metaMatches && shiftMatches && altMatches && keyMatches
  
  // Debug logging for shortcut matching
  if (e.ctrlKey || e.metaKey || e.altKey) {
    console.debug('[matchesShortcut] checking:', shortcut, {
      parsed,
      isMac,
      eventKey: e.key.toLowerCase(),
      modifiers: { modMatches, ctrlMatches, metaMatches, shiftMatches, altMatches, keyMatches },
      result,
    })
  }
  
  return result
}

/**
 * Build a ShortcutContext from the current textarea state
 */
export function buildShortcutContext(
  text: string,
  selectionStart: number,
  selectionEnd: number
): ShortcutContext {
  const hasSelection = selectionStart !== selectionEnd
  const selectedText = hasSelection ? text.substring(selectionStart, selectionEnd) : ''
  
  // Find current line boundaries
  const lineStart = selectionStart === 0 ? 0 : text.lastIndexOf('\n', selectionStart - 1) + 1
  let lineEnd = text.indexOf('\n', selectionStart)
  if (lineEnd === -1) lineEnd = text.length
  
  const currentLine = text.substring(lineStart, lineEnd)
  const lines = text.split('\n')
  
  // Find current line index
  let charCount = 0
  let currentLineIndex = 0
  for (let i = 0; i < lines.length; i++) {
    const lineLength = lines[i].length
    if (selectionStart <= charCount + lineLength) {
      currentLineIndex = i
      break
    }
    charCount += lineLength + 1 // +1 for newline
  }
  
  return {
    text,
    selectionStart,
    selectionEnd,
    hasSelection,
    selectedText,
    lineStart,
    lineEnd,
    currentLine,
    lines,
    currentLineIndex,
  }
}

// ============================================================================
// Default shortcuts
// ============================================================================

/**
 * Toggle line comment (//) or wrap multi-line selection with block comment
 */
const toggleLineComment: KeyboardShortcut = {
  id: 'toggle-line-comment',
  shortcut: 'Mod+/',
  description: 'Toggle line comment',
  action: (ctx: ShortcutContext): ShortcutResult => {
    const { text, selectionStart, selectionEnd, hasSelection, lineStart, lineEnd, currentLine } = ctx
    
    // Check if selection spans multiple lines
    const selectionSpansLines = hasSelection && text.substring(selectionStart, selectionEnd).includes('\n')
    
    if (selectionSpansLines) {
      const actualSelection = text.substring(selectionStart, selectionEnd)
      if (actualSelection.startsWith('/*') && actualSelection.endsWith('*/')) {
        // Unwrap block comment
        const unwrapped = actualSelection.slice(2, -2).trim()
        const newText = text.substring(0, selectionStart) + unwrapped + text.substring(selectionEnd)
        return {
          text: newText,
          selection: { start: selectionStart, end: selectionStart + unwrapped.length },
          preventDefault: true,
        }
      } else {
        // Wrap with block comment
        const wrapped = '/* ' + actualSelection + ' */'
        const newText = text.substring(0, selectionStart) + wrapped + text.substring(selectionEnd)
        return {
          text: newText,
          selection: { start: selectionStart, end: selectionStart + wrapped.length },
          preventDefault: true,
        }
      }
    }
    
    // Single line handling
    const isEmptyLine = currentLine.trim() === ''
    const isCommented = currentLine.trimStart().startsWith('//')
    
    let newText: string
    let newCursorPos: number
    
    if (isCommented) {
      // Uncomment: remove //
      const match = /^(\s*)\/\/\s?(.*)$/.exec(currentLine)
      const uncommented = match ? match[1] + match[2] : currentLine
      newText = text.substring(0, lineStart) + uncommented + text.substring(lineEnd)
      newCursorPos = lineStart + uncommented.length
    } else if (isEmptyLine) {
      // Empty line: add // and place cursor after
      const indent = /^(\s*)/.exec(currentLine)?.[1] || ''
      const commented = indent + '// '
      newText = text.substring(0, lineStart) + commented + text.substring(lineEnd)
      newCursorPos = lineStart + commented.length
    } else {
      // Line with content: add // at start
      const indent = /^(\s*)/.exec(currentLine)?.[1] || ''
      const commented = indent + '// ' + currentLine.trimStart()
      newText = text.substring(0, lineStart) + commented + text.substring(lineEnd)
      newCursorPos = lineStart + commented.length
    }
    
    return { text: newText, cursorPos: newCursorPos, preventDefault: true }
  },
}

/**
 * Toggle block comment - wrap/unwrap selection with block comment
 */
const blockComment: KeyboardShortcut = {
  id: 'block-comment',
  shortcut: 'Mod+Shift+/',
  description: 'Toggle block comment',
  action: (ctx: ShortcutContext): ShortcutResult => {
    const { text, selectionStart, selectionEnd, hasSelection } = ctx
    
    if (hasSelection) {
      const selection = text.substring(selectionStart, selectionEnd)
      
      // Check if selection is already wrapped in block comment
      // Match /* at start and */ at end, with optional whitespace
      const blockCommentMatch = selection.match(/^\/\*\s?([\s\S]*?)\s?\*\/$/)
      
      if (blockCommentMatch) {
        // Remove block comment - extract the inner content
        const innerContent = blockCommentMatch[1]
        const newText = text.substring(0, selectionStart) + innerContent + text.substring(selectionEnd)
        return {
          text: newText,
          selection: { start: selectionStart, end: selectionStart + innerContent.length },
          preventDefault: true,
        }
      } else {
        // Check if the text AROUND the selection forms a block comment
        // Look for /* before selection and */ after
        const beforeSelection = text.substring(0, selectionStart)
        const afterSelection = text.substring(selectionEnd)
        const openMatch = beforeSelection.match(/\/\*\s?$/)
        const closeMatch = afterSelection.match(/^\s?\*\//)
        
        if (openMatch && closeMatch) {
          // Remove the surrounding block comment markers
          const newStart = selectionStart - openMatch[0].length
          const newEnd = selectionEnd + closeMatch[0].length
          const newText = text.substring(0, newStart) + selection + text.substring(newEnd)
          return {
            text: newText,
            selection: { start: newStart, end: newStart + selection.length },
            preventDefault: true,
          }
        }
        
        // Wrap selection with block comment
        const wrapped = '/* ' + selection + ' */'
        const newText = text.substring(0, selectionStart) + wrapped + text.substring(selectionEnd)
        return {
          text: newText,
          selection: { start: selectionStart, end: selectionStart + wrapped.length },
          preventDefault: true,
        }
      }
    } else {
      // No selection - check if cursor is inside a block comment
      // Find the nearest /* before cursor and */ after cursor
      const beforeCursor = text.substring(0, selectionStart)
      const afterCursor = text.substring(selectionStart)
      
      const lastOpen = beforeCursor.lastIndexOf('/*')
      const lastCloseBeforeCursor = beforeCursor.lastIndexOf('*/')
      const firstClose = afterCursor.indexOf('*/')
      const firstOpenAfterCursor = afterCursor.indexOf('/*')
      
      // Check if we're inside a block comment:
      // - There's a /* before us that isn't closed before us
      // - There's a */ after us that isn't opened after us (before that close)
      const insideBlockComment = 
        lastOpen !== -1 && 
        lastOpen > lastCloseBeforeCursor &&
        firstClose !== -1 &&
        (firstOpenAfterCursor === -1 || firstOpenAfterCursor > firstClose)
      
      if (insideBlockComment) {
        // Remove the block comment
        const openPos = lastOpen
        const closePos = selectionStart + firstClose + 2 // +2 for "*/"
        
        // Check for optional space after /* and before */
        let openEnd = openPos + 2
        if (text[openEnd] === ' ') openEnd++
        
        let closeStart = selectionStart + firstClose
        if (text[closeStart - 1] === ' ') closeStart--
        
        const innerContent = text.substring(openEnd, closeStart)
        const newText = text.substring(0, openPos) + innerContent + text.substring(closePos)
        
        // Adjust cursor position
        const cursorOffset = selectionStart - openEnd
        const newCursorPos = openPos + Math.max(0, Math.min(cursorOffset, innerContent.length))
        
        return {
          text: newText,
          cursorPos: newCursorPos,
          preventDefault: true,
        }
      } else {
        // Insert empty block comment with cursor in middle
        const newBlockComment = '/*  */'
        const newText = text.substring(0, selectionStart) + newBlockComment + text.substring(selectionEnd)
        return {
          text: newText,
          cursorPos: selectionStart + 3, // Position after "/* "
          preventDefault: true,
        }
      }
    }
  },
}

/**
 * Cut entire line when nothing is selected
 */
const cutLine: KeyboardShortcut = {
  id: 'cut-line',
  shortcut: 'Mod+X',
  description: 'Cut line (when no selection)',
  action: (ctx: ShortcutContext): ShortcutResult | void => {
    const { text, selectionStart, hasSelection } = ctx
    
    // Only handle when no selection
    if (hasSelection) return
    
    // Find the start and end of the current line
    const lineStart = text.lastIndexOf('\n', selectionStart - 1) + 1
    let lineEnd = text.indexOf('\n', selectionStart)
    if (lineEnd === -1) lineEnd = text.length
    
    // Get the line content (including the newline if not the last line)
    const hasNewlineAfter = lineEnd < text.length
    const lineContent = text.substring(lineStart, lineEnd + (hasNewlineAfter ? 1 : 0))
    
    // Copy to clipboard
    navigator.clipboard.writeText(lineContent)
    
    // Remove the line
    let deleteStart: number
    if (lineStart === 0) {
      deleteStart = 0
    } else if (hasNewlineAfter) {
      deleteStart = lineStart
    } else {
      deleteStart = lineStart - 1
    }
    const deleteEnd = hasNewlineAfter ? lineEnd + 1 : lineEnd
    
    const newText = text.substring(0, deleteStart) + text.substring(deleteEnd)
    
    return {
      text: newText,
      cursorPos: deleteStart,
      preventDefault: true,
    }
  },
}

/**
 * Copy entire line when nothing is selected
 */
const copyLine: KeyboardShortcut = {
  id: 'copy-line',
  shortcut: 'Mod+C',
  description: 'Copy line (when no selection)',
  action: (ctx: ShortcutContext): ShortcutResult | void => {
    const { text, selectionStart, hasSelection } = ctx
    
    // Only handle when no selection
    if (hasSelection) return
    
    // Find the start and end of the current line
    const lineStart = text.lastIndexOf('\n', selectionStart - 1) + 1
    let lineEnd = text.indexOf('\n', selectionStart)
    if (lineEnd === -1) lineEnd = text.length
    
    // Get the line content (including the newline if not the last line)
    const hasNewlineAfter = lineEnd < text.length
    const lineContent = text.substring(lineStart, lineEnd + (hasNewlineAfter ? 1 : 0))
    
    // Copy to clipboard
    navigator.clipboard.writeText(lineContent)
    
    return { preventDefault: true }
  },
}

/**
 * Move line(s) up
 */
const moveLineUp: KeyboardShortcut = {
  id: 'move-line-up',
  shortcut: 'Alt+ArrowUp',
  description: 'Move line up',
  action: (ctx: ShortcutContext): ShortcutResult | void => {
    const { selectionStart, selectionEnd, lines, currentLineIndex } = ctx
    
    if (currentLineIndex === 0) return // Already at top
    
    // Find end line index for multi-line selection
    let endLineIndex = currentLineIndex
    let charCount = 0
    for (let i = 0; i < lines.length; i++) {
      const lineEnd = charCount + lines[i].length
      if (selectionEnd <= lineEnd + 1) {
        endLineIndex = i
        break
      }
      charCount += lines[i].length + 1
    }
    
    // Calculate positions for cursor preservation
    let firstLineStart = 0
    for (let i = 0; i < currentLineIndex; i++) {
      firstLineStart += lines[i].length + 1
    }
    const offsetInFirstLine = selectionStart - firstLineStart
    const selectionLength = selectionEnd - selectionStart
    
    // Move lines up
    const lineAbove = lines[currentLineIndex - 1]
    const selectedLines = lines.slice(currentLineIndex, endLineIndex + 1)
    
    const newLines = [
      ...lines.slice(0, currentLineIndex - 1),
      ...selectedLines,
      lineAbove,
      ...lines.slice(endLineIndex + 1),
    ]
    
    const newText = newLines.join('\n')
    
    // Calculate new cursor position
    let newStart = 0
    for (let i = 0; i < currentLineIndex - 1; i++) {
      newStart += newLines[i].length + 1
    }
    newStart += offsetInFirstLine
    
    return {
      text: newText,
      selection: { start: newStart, end: newStart + selectionLength },
      preventDefault: true,
    }
  },
}

/**
 * Move line(s) down
 */
const moveLineDown: KeyboardShortcut = {
  id: 'move-line-down',
  shortcut: 'Alt+ArrowDown',
  description: 'Move line down',
  action: (ctx: ShortcutContext): ShortcutResult | void => {
    const { selectionStart, selectionEnd, lines, currentLineIndex } = ctx
    
    // Find end line index for multi-line selection
    let endLineIndex = currentLineIndex
    let charCount = 0
    for (let i = 0; i < lines.length; i++) {
      const lineEnd = charCount + lines[i].length
      if (selectionEnd <= lineEnd + 1) {
        endLineIndex = i
        break
      }
      charCount += lines[i].length + 1
    }
    
    if (endLineIndex >= lines.length - 1) return // Already at bottom
    
    // Calculate positions for cursor preservation
    let firstLineStart = 0
    for (let i = 0; i < currentLineIndex; i++) {
      firstLineStart += lines[i].length + 1
    }
    const offsetInFirstLine = selectionStart - firstLineStart
    const selectionLength = selectionEnd - selectionStart
    
    // Move lines down
    const lineBelow = lines[endLineIndex + 1]
    const selectedLines = lines.slice(currentLineIndex, endLineIndex + 1)
    
    const newLines = [
      ...lines.slice(0, currentLineIndex),
      lineBelow,
      ...selectedLines,
      ...lines.slice(endLineIndex + 2),
    ]
    
    const newText = newLines.join('\n')
    
    // Calculate new cursor position
    let newStart = 0
    for (let i = 0; i < currentLineIndex + 1; i++) {
      newStart += newLines[i].length + 1
    }
    newStart += offsetInFirstLine
    
    return {
      text: newText,
      selection: { start: newStart, end: newStart + selectionLength },
      preventDefault: true,
    }
  },
}

/**
 * Indent with Tab
 */
const indent: KeyboardShortcut = {
  id: 'indent',
  shortcut: 'Tab',
  description: 'Indent',
  action: (ctx: ShortcutContext): ShortcutResult => {
    const { text, selectionStart, selectionEnd, hasSelection, selectedText } = ctx
    
    // Check if selection spans multiple lines
    const hasMultiLineSelection = hasSelection && selectedText.includes('\n')
    
    if (hasMultiLineSelection) {
      const lineStart = text.lastIndexOf('\n', selectionStart - 1) + 1
      let lineEnd = text.indexOf('\n', selectionEnd)
      if (lineEnd === -1) lineEnd = text.length
      
      const linesText = text.substring(lineStart, lineEnd)
      const lines = linesText.split('\n')
      
      // Indent: add 2 spaces to start of each line
      const modifiedLines = lines.map(line => '  ' + line)
      const totalChange = lines.length * 2
      
      const newText = text.substring(0, lineStart) + modifiedLines.join('\n') + text.substring(lineEnd)
      
      return {
        text: newText,
        selection: { start: lineStart, end: lineEnd + totalChange },
        preventDefault: true,
      }
    } else {
      // Insert 2 spaces at cursor
      const newText = text.substring(0, selectionStart) + '  ' + text.substring(selectionEnd)
      return {
        text: newText,
        cursorPos: selectionStart + 2,
        preventDefault: true,
      }
    }
  },
}

/**
 * Unindent with Shift+Tab
 */
const unindent: KeyboardShortcut = {
  id: 'unindent',
  shortcut: 'Shift+Tab',
  description: 'Unindent',
  action: (ctx: ShortcutContext): ShortcutResult => {
    const { text, selectionStart, selectionEnd, hasSelection, selectedText } = ctx
    
    const hasMultiLineSelection = hasSelection && selectedText.includes('\n')
    
    if (hasMultiLineSelection) {
      const lineStart = text.lastIndexOf('\n', selectionStart - 1) + 1
      let lineEnd = text.indexOf('\n', selectionEnd)
      if (lineEnd === -1) lineEnd = text.length
      
      const linesText = text.substring(lineStart, lineEnd)
      const lines = linesText.split('\n')
      
      let totalChange = 0
      const modifiedLines = lines.map(line => {
        if (line.startsWith('  ')) {
          totalChange -= 2
          return line.substring(2)
        } else if (line.startsWith(' ')) {
          totalChange -= 1
          return line.substring(1)
        }
        return line
      })
      
      const newText = text.substring(0, lineStart) + modifiedLines.join('\n') + text.substring(lineEnd)
      
      return {
        text: newText,
        selection: { start: lineStart, end: lineEnd + totalChange },
        preventDefault: true,
      }
    } else {
      // Remove spaces before cursor or from line start
      const beforeCursor = text.substring(0, selectionStart)
      const charBeforeCursor = beforeCursor.slice(-1)
      
      if (charBeforeCursor === ' ' || charBeforeCursor === '\t') {
        const spacesToRemove = beforeCursor.endsWith('  ') ? 2 : 1
        const newText = text.substring(0, selectionStart - spacesToRemove) + text.substring(selectionEnd)
        return {
          text: newText,
          cursorPos: selectionStart - spacesToRemove,
          preventDefault: true,
        }
      } else {
        // Try to unindent from line start
        const lineStart = text.lastIndexOf('\n', selectionStart - 1) + 1
        const lineContent = text.substring(lineStart, selectionStart)
        let spacesAtLineStart = 0
        if (lineContent.startsWith('  ')) {
          spacesAtLineStart = 2
        } else if (lineContent.startsWith(' ')) {
          spacesAtLineStart = 1
        }
        
        if (spacesAtLineStart > 0) {
          const newText = text.substring(0, lineStart) + text.substring(lineStart + spacesAtLineStart)
          return {
            text: newText,
            cursorPos: selectionStart - spacesAtLineStart,
            preventDefault: true,
          }
        }
      }
      
      return { preventDefault: true }
    }
  },
}

/**
 * Default keyboard shortcuts for the text editor
 */
export const defaultShortcuts: KeyboardShortcut[] = [
  toggleLineComment,
  blockComment,
  cutLine,
  copyLine,
  moveLineUp,
  moveLineDown,
  indent,
  unindent,
]
