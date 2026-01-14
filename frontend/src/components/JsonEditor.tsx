import { useRef } from 'react'
import { Box, Typography } from '@mui/material'

interface JsonEditorProps {
  value: any
  onChange: (value: any) => void
  placeholder?: string
  minHeight?: number
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
  minHeight = 120
}: JsonEditorProps) {
  const previewRef = useRef<HTMLDivElement>(null)

  // Determine if value is valid JSON (stored as object) or invalid (stored as string)
  const isValid = value === undefined || typeof value !== 'string'
  const displayValue = value
    ? (typeof value === 'string' ? value : JSON.stringify(value, null, 2))
    : ''

  const handleChange = (newValue: string) => {
    if (!newValue) {
      onChange(undefined)
      return
    }
    try {
      const parsed = JSON.parse(newValue)
      onChange(parsed)
    } catch {
      // Store as string to indicate invalid JSON
      onChange(newValue)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const target = e.target as HTMLTextAreaElement
      const start = target.selectionStart
      const end = target.selectionEnd
      const currentValue = target.value

      // Find the start of the current line
      const lineStart = currentValue.lastIndexOf('\n', start - 1) + 1

      // Insert spaces at the beginning of the line
      const newValue = currentValue.substring(0, lineStart) + '  ' + currentValue.substring(lineStart)
      handleChange(newValue)

      // Keep cursor at same relative position (shifted by 2 for the inserted spaces)
      setTimeout(() => {
        target.selectionStart = start + 2
        target.selectionEnd = end + 2
      }, 0)
    }
  }

  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (previewRef.current) {
      previewRef.current.scrollTop = e.currentTarget.scrollTop
      previewRef.current.scrollLeft = e.currentTarget.scrollLeft
    }
  }

  return (
    <>
      <Box sx={{ position: 'relative', maxHeight: 300, overflow: 'hidden' }}>
        {/* Syntax highlighted background */}
        <Box
          ref={previewRef}
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            fontFamily: 'monospace',
            fontSize: '0.875rem',
            lineHeight: 1.5,
            bgcolor: 'grey.900',
            color: 'grey.100',
            borderRadius: 1,
            p: 1.5,
            whiteSpace: 'pre',
            overflow: 'hidden',
            pointerEvents: 'none',
          }}
          dangerouslySetInnerHTML={{
            __html: displayValue
              ? highlightJson(displayValue)
              : `<span style="color: #6a6a6a">${placeholder}</span>`
          }}
        />
        {/* Transparent textarea for input */}
        <textarea
          value={displayValue}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onScroll={handleScroll}
          style={{
            position: 'relative',
            width: '100%',
            height: 300,
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
