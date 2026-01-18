import { Box, Typography, CircularProgress } from '@mui/material'
import TruncatedText from './TruncatedText'

export interface FieldConfig {
  /** The key in the data object */
  key: string
  /** Display label for the field (can be a function for dynamic labels) */
  label: string | ((data: unknown) => string)
  /** How to format the value: 'text' (default), 'monospace' (for IDs/URLs), 'date', 'number' */
  format?: 'text' | 'monospace' | 'date' | 'number'
  /** Show loading spinner if value is undefined (for async-loaded fields) */
  showLoading?: boolean
  /** Custom render function for complex field values */
  render?: (value: unknown, data: unknown) => string
}

interface SystemDetailsGridProps<T> {
  /** The data object to display */
  data: T | null
  /** Field configurations - will be displayed in alphabetical order by label */
  fields: FieldConfig[]
}

function formatValue(value: unknown, format: FieldConfig['format']): string {
  if (value === null || value === undefined) {
    return '-'
  }

  switch (format) {
    case 'date':
      return new Date(value as string).toLocaleString()
    case 'number':
      return typeof value === 'number' ? value.toLocaleString() : String(value)
    default:
      return String(value)
  }
}

function getLabel(field: FieldConfig, data: unknown): string {
  return typeof field.label === 'function' ? field.label(data) : field.label
}

export default function SystemDetailsGrid<T>({
  data,
  fields,
}: SystemDetailsGridProps<T>) {
  // Sort fields alphabetically by label (resolve dynamic labels first)
  const sortedFields = [...fields].sort((a, b) =>
    getLabel(a, data).localeCompare(getLabel(b, data))
  )

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr',
        gap: 2,
        rowGap: 1.5,
      }}
    >
      {sortedFields.map((field) => {
        const value = (data as Record<string, unknown>)?.[field.key]
        const isUndefined = value === undefined
        const showLoading = field.showLoading && isUndefined

        // Skip fields that are null/undefined and don't have showLoading enabled
        if ((value === null || isUndefined) && !showLoading) {
          return null
        }

        const label = getLabel(field, data)
        const displayValue = field.render ? field.render(value, data) : formatValue(value, field.format)

        return (
          <Box key={field.key} sx={{ display: 'contents' }}>
            <Typography variant="body2" color="text.secondary">
              {label}
            </Typography>
            {showLoading ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CircularProgress size={16} />
                <Typography variant="body2">Loading...</Typography>
              </Box>
            ) : field.format === 'monospace' ? (
              <TruncatedText
                maxLines={field.key.toLowerCase().includes('url') ? 2 : 1}
                title={label}
                sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
              >
                {displayValue}
              </TruncatedText>
            ) : (
              <Typography variant="body2">
                {displayValue}
              </Typography>
            )}
          </Box>
        )
      })}
    </Box>
  )
}
