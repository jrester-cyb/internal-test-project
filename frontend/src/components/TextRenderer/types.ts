export interface HistoryEntry {
  text: string
  cursorPos: number
  scrollTop: number
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
  handleTextChange: (text: string, cursorPos?: number) => void
  
  // History
  canUndo: boolean
  canRedo: boolean
  undo: () => void
  redo: () => void
  
  // UI state
  isFullscreen: boolean
  setIsFullscreen: (value: boolean) => void
  showRawText: boolean
  setShowRawText: (value: boolean) => void
  isDark: boolean
  
  // Validation
  isValid: boolean
  errorInfo: { position: number; line: number; message: string } | null
  
  // Formatter
  formatter: TextFormatter
  
  // Refs
  textareaRef: React.RefObject<HTMLTextAreaElement>
  fullscreenTextareaRef: React.RefObject<HTMLTextAreaElement>
  pendingCursorRef: React.MutableRefObject<number | null>
  
  // Scroll
  scrollPos: { top: number; left: number }
  setScrollPos: React.Dispatch<React.SetStateAction<{ top: number; left: number }>>
  fullscreenScrollPos: { top: number; left: number }
  setFullscreenScrollPos: React.Dispatch<React.SetStateAction<{ top: number; left: number }>>
}

export interface TextRendererProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  formatter: TextFormatter
  enableFullscreen?: boolean
  height?: number | string
  children?: React.ReactNode
}
