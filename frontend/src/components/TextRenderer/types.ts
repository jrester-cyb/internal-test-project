export interface HistoryEntry {
  text: string
  cursorPos: number
  scrollTop: number
}

/**
 * Context passed to keyboard shortcut actions
 */
export interface ShortcutContext {
  /** Current text content */
  text: string
  /** Start of selection (or cursor position if no selection) */
  selectionStart: number
  /** End of selection (same as start if no selection) */
  selectionEnd: number
  /** Whether there is an active selection */
  hasSelection: boolean
  /** The selected text (empty string if no selection) */
  selectedText: string
  /** Start position of the current line */
  lineStart: number
  /** End position of the current line */
  lineEnd: number
  /** Content of the current line */
  currentLine: string
  /** All lines as an array */
  lines: string[]
  /** Index of the line containing the cursor */
  currentLineIndex: number
}

/**
 * Result returned from a keyboard shortcut action
 */
export interface ShortcutResult {
  /** New text content (if changed) */
  text?: string
  /** New cursor position */
  cursorPos?: number
  /** New selection range (if setting a selection) */
  selection?: { start: number; end: number }
  /** If true, prevent default browser behavior */
  preventDefault?: boolean
}

/**
 * Keyboard shortcut definition
 */
export interface KeyboardShortcut {
  /** Unique identifier for this shortcut */
  id: string
  /** 
   * Shortcut pattern, e.g., "Ctrl+/", "Ctrl+Shift+/", "Alt+ArrowUp"
   * Supports: Ctrl, Alt, Shift, Meta (Cmd on Mac)
   * Use "Mod" for Ctrl on Windows/Linux or Meta on Mac
   */
  shortcut: string
  /** Description for tooltips/documentation */
  description?: string
  /** 
   * Action to perform when shortcut is triggered
   * Return a ShortcutResult to update text/cursor, or void to do nothing
   */
  action: (context: ShortcutContext) => ShortcutResult | void
}

export interface TextFormatter {
  /** Unique identifier for the formatter */
  id: string
  
  /** Apply syntax highlighting to text */
  highlight: (text: string, isDark: boolean, errorPos: number | null) => string
  
  /** Validate text and return error position if invalid */
  getErrorPosition: (text: string) => { position: number; line: number; message: string } | null
  
  /** Format/prettify the text */
  format: (text: string) => string
  
  /** Minify the text */
  minify: (text: string) => string
  
  /** Strip comments from text (if applicable) */
  stripComments: (text: string, preservePositions?: boolean) => string
  
  /** Parse text and return structured data (or null if invalid) */
  parse: (text: string) => any | null
  
  /** Additional toolbar actions specific to this formatter */
  toolbarActions?: ToolbarAction[]
}

export interface ToolbarAction {
  id: string
  label: string
  icon: React.ReactNode
  onClick: (text: string, setText: (text: string) => void) => void
  disabled?: (text: string, isValid: boolean) => boolean
}

export interface TextRendererContextValue {
  // Text state
  localText: string
  setLocalText: (text: string) => void
  onChange: (text: string) => void
  
  // Edit mode
  isEditable: boolean
  setIsEditable: (value: boolean) => void

  // Copy handler
  onCopy?: (text: string) => void
  
  // Editor handlers (set by Editor component)
  editorHandlers: {
    onInput?: (e: React.FormEvent<HTMLTextAreaElement>) => void
    onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  }
  setEditorHandlers: (handlers: TextRendererContextValue['editorHandlers']) => void
  
  // Edit functions (set by Editor component via refs)
  handleTextChange: (text: string, cursorPos?: number) => void
  handleTextChangeRef: React.MutableRefObject<(text: string, cursorPos?: number) => void>
  canUndo: boolean
  setCanUndo: (value: boolean) => void
  canRedo: boolean
  setCanRedo: (value: boolean) => void
  undo: () => void
  undoRef: React.MutableRefObject<() => void>
  redo: () => void
  redoRef: React.MutableRefObject<() => void>
  
  // UI state
  isFullscreen: boolean
  setIsFullscreen: (value: boolean) => void
  enterFullscreen: () => void
  exitFullscreen: () => void
  showRawText: boolean
  setShowRawText: (value: boolean) => void
  isDark: boolean
  
  // Validation
  isValid: boolean
  errorInfo: { position: number; line: number; message: string } | null
  
  // Formatter
  formatter: TextFormatter
  
  // Refs
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  fullscreenTextareaRef: React.RefObject<HTMLTextAreaElement | null>
  pendingCursorRef: React.MutableRefObject<number | null>
  pendingSelectionRef: React.MutableRefObject<{ start: number; end: number } | null>
  
  // Scroll
  scrollPos: { top: number; left: number }
  setScrollPos: React.Dispatch<React.SetStateAction<{ top: number; left: number }>>
  fullscreenScrollPos: { top: number; left: number }
  setFullscreenScrollPos: React.Dispatch<React.SetStateAction<{ top: number; left: number }>>
}

export interface TextRendererProps {
  value: string
  onChange: (value: string) => void
  onCopy?: () => void
  placeholder?: string
  formatter: TextFormatter
  enableFullscreen?: boolean
  height?: number | string
  children?: React.ReactNode
}
