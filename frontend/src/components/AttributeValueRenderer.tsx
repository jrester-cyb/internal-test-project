import { useState } from 'react'
import { Box, Typography, Chip, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, Button } from '@mui/material'
import { OpenInNew as OpenInNewIcon, DataObject as JsonIcon } from '@mui/icons-material'
import type { AssetTypeAttribute } from '../types'
import TruncatedText from './TruncatedText'

interface AttributeValueRendererProps {
  attribute: AssetTypeAttribute
  value: any
  maxLines?: number
}

// Format JSON with syntax highlighting
function JsonRenderer({ value, maxLines = 3 }: { value: any; maxLines?: number }) {
  const [dialogOpen, setDialogOpen] = useState(false)

  const formattedJson = JSON.stringify(value, null, 2)
  const lines = formattedJson.split('\n')
  const isTruncated = lines.length > maxLines
  const displayJson = isTruncated ? lines.slice(0, maxLines).join('\n') + '\n...' : formattedJson

  // Simple syntax highlighting
  const highlightJson = (json: string) => {
    return json
      .replace(/"([^"]+)":/g, '<span style="color: #9cdcfe">"$1"</span>:') // keys
      .replace(/: "([^"]*)"/g, ': <span style="color: #ce9178">"$1"</span>') // string values
      .replace(/: (\d+\.?\d*)/g, ': <span style="color: #b5cea8">$1</span>') // numbers
      .replace(/: (true|false)/g, ': <span style="color: #569cd6">$1</span>') // booleans
      .replace(/: (null)/g, ': <span style="color: #569cd6">$1</span>') // null
  }

  return (
    <>
      <Box
        onClick={isTruncated ? () => setDialogOpen(true) : undefined}
        sx={{
          fontFamily: 'monospace',
          fontSize: '0.75rem',
          bgcolor: 'action.hover',
          borderRadius: 1,
          p: 0.75,
          overflow: 'hidden',
          cursor: isTruncated ? 'pointer' : 'default',
          '&:hover': isTruncated ? { bgcolor: 'action.selected' } : undefined,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
        dangerouslySetInnerHTML={{ __html: highlightJson(displayJson) }}
      />

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <JsonIcon />
          JSON Value
        </DialogTitle>
        <DialogContent>
          <Box
            sx={{
              fontFamily: 'monospace',
              fontSize: '0.8rem',
              bgcolor: 'grey.900',
              color: 'grey.100',
              borderRadius: 1,
              p: 2,
              overflow: 'auto',
              maxHeight: '60vh',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
            dangerouslySetInnerHTML={{ __html: highlightJson(formattedJson) }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => navigator.clipboard.writeText(formattedJson)}>
            Copy
          </Button>
          <Button onClick={() => setDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

// Boolean renderer with chip
function BooleanRenderer({ value }: { value: boolean }) {
  return (
    <Chip
      label={value ? 'Yes' : 'No'}
      size="small"
      color={value ? 'success' : 'default'}
      variant="outlined"
      sx={{ height: 22 }}
    />
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

// Link renderer (for future use)
function LinkRenderer({ value, maxLines = 3 }: { value: string; maxLines?: number }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
      <TruncatedText
        variant="body2"
        maxLines={maxLines}
        title="Link"
        sx={{
          color: 'primary.main',
          cursor: 'pointer',
          '&:hover': { textDecoration: 'underline' },
        }}
        onClick={() => window.open(value, '_blank')}
      >
        {value}
      </TruncatedText>
      <IconButton size="small" href={value} target="_blank" rel="noopener noreferrer" sx={{ flexShrink: 0 }}>
        <OpenInNewIcon sx={{ fontSize: 14 }} />
      </IconButton>
    </Box>
  )
}

// Number renderer with formatting
function NumberRenderer({ value }: { value: number }) {
  const formatted = typeof value === 'number' && !Number.isInteger(value)
    ? value.toLocaleString(undefined, { maximumFractionDigits: 6 })
    : value.toLocaleString()

  return (
    <TruncatedText variant="body2" maxLines={1} title="Number" sx={{ fontVariantNumeric: 'tabular-nums' }}>
      {formatted}
    </TruncatedText>
  )
}

// Default text renderer using TruncatedText
function TextRenderer({ value, maxLines = 3 }: { value: string; maxLines?: number }) {
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
      return <JsonRenderer value={value} maxLines={maxLines} />

    case 'boolean':
      return <BooleanRenderer value={Boolean(value)} />

    case 'date':
      return <DateRenderer value={value} includeTime={false} />

    case 'datetime':
      return <DateRenderer value={value} includeTime={true} />

    case 'number':
      return <NumberRenderer value={value} />

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
      return <TextRenderer value={String(value)} maxLines={maxLines} />
  }
}

// Export individual renderers for direct use if needed
export { JsonRenderer, BooleanRenderer, DateRenderer, LinkRenderer, NumberRenderer, TextRenderer }
