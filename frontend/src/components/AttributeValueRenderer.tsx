import { Box, Typography, Chip, IconButton, Tooltip } from '@mui/material'
import { OpenInNew as OpenInNewIcon, ContentCopy as CopyIcon } from '@mui/icons-material'
import type { AssetTypeAttribute } from '../types'
import TruncatedText from './TruncatedText'
import { TextRenderer as TextRendererComponent } from './TextRenderer'
import { JsonFormatter } from './JsonFormatter'

interface AttributeValueRendererProps {
  attribute: AssetTypeAttribute
  value: any
  maxLines?: number
}

// Format JSON with syntax highlighting using TextRenderer
function JsonRenderer({ value, maxLines = 3 }: { value: any; maxLines?: number }) {
  // Convert value to JSON string if it's not already a string
  const jsonText = typeof value === 'string' ? value : JSON.stringify(value, null, 2)

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
        enableFullscreen={true}
      />
    </Box>
  )
}

// Boolean renderer with chip
function BooleanRenderer({ value }: { value: boolean }) {
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
    </Box>
  )
}

// Date/datetime renderer
function DateRenderer({ value, includeTime = false }: { value: string; includeTime?: boolean }) {
  const date = new Date(value)
  const formatted = includeTime
    ? date.toLocaleString()
    : date.toLocaleDateString()

  return (
    <TruncatedText variant="body2" maxLines={1} title="Date">
      {formatted}
    </TruncatedText>
  )
}

// Link renderer - supports both string URLs and {url, text} objects
function LinkRenderer({ value, maxLines = 3 }: { value: string | { url: string; text?: string }; maxLines?: number }) {
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
function NumberRenderer({ value, unit }: { value: number; unit?: string }) {
  const formatted = typeof value === 'number' && !Number.isInteger(value)
    ? value.toLocaleString(undefined, { maximumFractionDigits: 6 })
    : value.toLocaleString()

  const displayText = unit ? `${formatted} ${unit}` : formatted

  return (
    <TruncatedText variant="body2" maxLines={1} title="Number" sx={{ fontVariantNumeric: 'tabular-nums' }}>
      {displayText}
    </TruncatedText>
  )
}

// Default text renderer using TruncatedText
function SimpleTextRenderer({ value, maxLines = 3 }: { value: string; maxLines?: number }) {
  return (
    <TruncatedText variant="body2" maxLines={maxLines} title="Text">
      {value}
    </TruncatedText>
  )
}

export default function AttributeValueRenderer({ attribute, value, maxLines = 3 }: AttributeValueRendererProps) {
  // Handle null/undefined
  if (value === null || value === undefined) {
    return <Typography variant="body2" color="text.disabled">—</Typography>
  }

  // Render based on attribute type
  switch (attribute.attributeType) {
    case 'json':
      return <JsonRenderer value={value.rawJson ?? value} maxLines={maxLines} />

    case 'boolean':
      return <BooleanRenderer value={Boolean(value)} />

    case 'date':
      return <DateRenderer value={value} includeTime={false} />

    case 'datetime':
      return <DateRenderer value={value} includeTime={true} />

    case 'number':
      return <NumberRenderer value={value} unit={attribute.unit} />

    case 'link':
      return <LinkRenderer value={value} maxLines={maxLines} />

    case 'text':
    default:
      // Check if it looks like a URL
      if (typeof value === 'string' && /^https?:\/\//.test(value)) {
        return <LinkRenderer value={value} maxLines={maxLines} />
      }
      // For objects that aren't typed as JSON, still render as JSON
      if (typeof value === 'object') {
        return <JsonRenderer value={value} maxLines={maxLines} />
      }
      return <SimpleTextRenderer value={String(value)} maxLines={maxLines} />
  }
}

// Export individual renderers for direct use if needed
// Note: TextRenderer here refers to SimpleTextRenderer for backward compatibility
export { JsonRenderer, BooleanRenderer, DateRenderer, LinkRenderer, NumberRenderer, SimpleTextRenderer as TextRenderer }
