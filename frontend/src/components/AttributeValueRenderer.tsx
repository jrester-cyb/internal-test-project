import { useState } from 'react'
import { Box, Typography, Chip, IconButton, Tooltip, Dialog, DialogTitle, DialogContent } from '@mui/material'
import { OpenInNew as OpenInNewIcon, ContentCopy as CopyIcon, Fullscreen as FullscreenIcon, Close as CloseIcon } from '@mui/icons-material'
import type { AssetTypeAttribute } from '../types'
import TruncatedText from './TruncatedText'
import { TextRenderer as TextRendererComponent } from './TextRenderer'
import { JsonFormatter } from './JsonFormatter'

interface AttributeValueRendererProps {
  attribute: AssetTypeAttribute
  value: any
  maxLines?: number
  /** Where to show line numbers for JSON: 'both' (default), 'inline', 'fullscreen', or 'none' */
  lineNumbers?: 'both' | 'inline' | 'fullscreen' | 'none'
  /** Whether to show copy button on supported renderers (default: true) */
  showCopyButton?: boolean
}

// Compact JSON renderer with fullscreen button for grid cells
function CompactJsonRenderer({ value }: { value: any }) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const compactJson = typeof value === 'string' ? value : JSON.stringify(value)
  const formattedJson = typeof value === 'string' ? value : JSON.stringify(value, null, 2)

  return (
    <>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          width: '100%',
          minWidth: 0,
          '& .fullscreen-btn': { opacity: 0 },
          '&:hover .fullscreen-btn': { opacity: 1 },
        }}
      >
        <Typography
          variant="body2"
          component="span"
          sx={{
            fontFamily: 'monospace',
            fontSize: '0.75rem',
            color: 'text.secondary',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            flex: 1,
            minWidth: 0,
          }}
        >
          {compactJson}
        </Typography>
        <Tooltip title="View JSON" arrow>
          <IconButton
            className="fullscreen-btn"
            size="small"
            onClick={(e) => {
              e.stopPropagation()
              setIsFullscreen(true)
            }}
            sx={{
              p: 0.25,
              flexShrink: 0,
              color: 'text.secondary',
              transition: 'opacity 0.15s',
              '&:hover': { color: 'primary.main' },
            }}
          >
            <FullscreenIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </Box>

      <Dialog
        open={isFullscreen}
        onClose={() => setIsFullscreen(false)}
        maxWidth="md"
        fullWidth
        onClick={(e) => e.stopPropagation()}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
          <Typography variant="h6">JSON Value</Typography>
          <IconButton onClick={() => setIsFullscreen(false)} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          <Box
            sx={{
              bgcolor: 'action.hover',
              '& textarea': {
                fontSize: '0.875rem !important',
              },
              '& .syntax-highlight': {
                fontSize: '0.875rem !important',
              },
            }}
          >
            <TextRendererComponent
              value={formattedJson}
              onChange={() => {}}
              formatter={JsonFormatter}
              height={400}
              lineNumbers="inline"
              enableFullscreen={false}
            />
          </Box>
        </DialogContent>
      </Dialog>
    </>
  )
}

// Format JSON with syntax highlighting using TextRenderer
function JsonRenderer({ value, maxLines = 3, lineNumbers = 'both' }: { value: any; maxLines?: number; lineNumbers?: 'both' | 'inline' | 'fullscreen' | 'none' }) {
  // Convert value to JSON string if it's not already a string
  const jsonText = typeof value === 'string' ? value : JSON.stringify(value, null, 2)

  // For single line display (e.g., in grid cells), show a compact preview with fullscreen button
  if (maxLines === 1) {
    return <CompactJsonRenderer value={value} />
  }

  // Calculate preview height based on line count
  const lines = jsonText.split('\n')
  const previewLineCount = Math.min(lines.length, maxLines + 1) // +1 for some breathing room
  const lineHeight = 1.5 // matches TextRenderer's line-height
  const fontSize = 0.75 // rem
  const padding = 0.75 // rem
  const previewHeight = (previewLineCount * lineHeight * fontSize * 16) + (padding * 2 * 16)

  return (
    <Box
      sx={{
        width: '100%',
        bgcolor: 'action.hover',
        borderRadius: 1,
        overflow: 'hidden',
        // Override TextRenderer's default styles for compact view
        '& textarea': {
          fontSize: '0.75rem !important',
          padding: '6px !important',
        },
        '& .syntax-highlight': {
          fontSize: '0.75rem !important',
          padding: '6px !important',
        },
      }}
    >
      <TextRendererComponent
        value={jsonText}
        onChange={() => { }}
        formatter={JsonFormatter}
        height={previewHeight}
        lineNumbers={lineNumbers}
        enableFullscreen={true}
      />
    </Box>
  )
}

// Boolean renderer with chip
function BooleanRenderer({ value, showCopyButton = true }: { value: boolean; showCopyButton?: boolean }) {
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        '& .copy-button': { opacity: 0 },
        '&:hover .copy-button': { opacity: 0.7 },
      }}
    >
      <Chip
        label={value ? 'Yes' : 'No'}
        size="small"
        color={value ? 'success' : 'default'}
        variant="outlined"
        sx={{ height: 22 }}
      />
      {showCopyButton && (
        <Tooltip title="Copy" arrow>
          <IconButton
            className="copy-button"
            size="small"
            onClick={() => navigator.clipboard.writeText(value ? 'True' : 'False')}
            sx={{
              p: 0.25,
              flexShrink: 0,
              color: 'inherit',
              '&:hover': { opacity: 1 },
            }}
          >
            <CopyIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  )
}

// Date/datetime renderer
function DateRenderer({ value, includeTime = false, showCopyButton = true }: { value: string; includeTime?: boolean; showCopyButton?: boolean }) {
  const date = new Date(value)
  const formatted = includeTime
    ? date.toLocaleString()
    : date.toLocaleDateString()

  return (
    <TruncatedText variant="body2" maxLines={1} title="Date" showCopy={showCopyButton}>
      {formatted}
    </TruncatedText>
  )
}

// Link renderer - supports both string URLs and {url, text} objects
function LinkRenderer({ value, maxLines = 3, showCopyButton = true }: { value: string | { url: string; text?: string }; maxLines?: number; showCopyButton?: boolean }) {
  // Normalize value to always have url and text
  const linkData = typeof value === 'string'
    ? { url: value, text: value }
    : { url: value.url, text: value.text || value.url }

  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
      <TruncatedText
        variant="body2"
        maxLines={maxLines}
        title={linkData.url}
        showCopy={showCopyButton}
        sx={{
          color: 'primary.main',
          cursor: 'pointer',
          '&:hover': { textDecoration: 'underline' },
        }}
        onClick={() => window.open(linkData.url, '_blank')}
      >
        {linkData.text}
      </TruncatedText>
      <IconButton size="small" href={linkData.url} target="_blank" rel="noopener noreferrer" sx={{ flexShrink: 0 }}>
        <OpenInNewIcon sx={{ fontSize: 14 }} />
      </IconButton>
    </Box>
  )
}

// Number renderer with formatting and optional unit
function NumberRenderer({ value, unit, showCopyButton = true }: { value: number; unit?: string; showCopyButton?: boolean }) {
  const formatted = typeof value === 'number' && !Number.isInteger(value)
    ? value.toLocaleString(undefined, { maximumFractionDigits: 6 })
    : value.toLocaleString()

  const displayText = unit ? `${formatted} ${unit}` : formatted

  return (
    <TruncatedText variant="body2" maxLines={1} title="Number" showCopy={showCopyButton} sx={{ fontVariantNumeric: 'tabular-nums' }}>
      {displayText}
    </TruncatedText>
  )
}

// Default text renderer using TruncatedText
function SimpleTextRenderer({ value, maxLines = 3, showCopyButton = true }: { value: string; maxLines?: number; showCopyButton?: boolean }) {
  return (
    <TruncatedText variant="body2" maxLines={maxLines} title="Text" showCopy={showCopyButton}>
      {value}
    </TruncatedText>
  )
}

export default function AttributeValueRenderer({ attribute, value, maxLines = 3, lineNumbers = 'both', showCopyButton = true }: AttributeValueRendererProps) {
  // Handle null/undefined
  if (value === null || value === undefined) {
    return <Typography variant="body2" color="text.disabled">—</Typography>
  }

  // Render based on attribute type
  switch (attribute.attributeType) {
    case 'json':
      return <JsonRenderer value={value.rawJson ?? value} maxLines={maxLines} lineNumbers={lineNumbers} />

    case 'boolean':
      return <BooleanRenderer value={Boolean(value)} showCopyButton={showCopyButton} />

    case 'date':
      return <DateRenderer value={value} includeTime={false} showCopyButton={showCopyButton} />

    case 'datetime':
      return <DateRenderer value={value} includeTime={true} showCopyButton={showCopyButton} />

    case 'number':
      return <NumberRenderer value={value} unit={attribute.unit} showCopyButton={showCopyButton} />

    case 'link':
      return <LinkRenderer value={value} maxLines={maxLines} showCopyButton={showCopyButton} />

    case 'text':
    default:
      // Check if it looks like a URL
      if (typeof value === 'string' && /^https?:\/\//.test(value)) {
        return <LinkRenderer value={value} maxLines={maxLines} showCopyButton={showCopyButton} />
      }
      // For objects that aren't typed as JSON, still render as JSON
      if (typeof value === 'object') {
        return <JsonRenderer value={value} maxLines={maxLines} />
      }
      return <SimpleTextRenderer value={String(value)} maxLines={maxLines} showCopyButton={showCopyButton} />
  }
}

// Export individual renderers for direct use if needed
// Note: TextRenderer here refers to SimpleTextRenderer for backward compatibility
export { JsonRenderer, BooleanRenderer, DateRenderer, LinkRenderer, NumberRenderer, SimpleTextRenderer as TextRenderer }
