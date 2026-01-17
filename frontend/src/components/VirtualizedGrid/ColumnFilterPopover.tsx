import React from 'react'
import {
  Box,
  IconButton,
  Popover,
  TextField,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Checkbox,
  ListItemText,
  Chip,
  InputAdornment,
} from '@mui/material'
import { Clear as ClearIcon } from '@mui/icons-material'
import type { ColumnDefinition, ColumnFilterValue } from '@app/components/VirtualizedGrid/types'

export interface ColumnFilterPopoverProps {
  column: ColumnDefinition<any>
  value: ColumnFilterValue
  onChange: (value: ColumnFilterValue) => void
  anchorEl: HTMLElement | null
  onClose: () => void
}

export function ColumnFilterPopover({
  column,
  value,
  onChange,
  anchorEl,
  onClose,
}: ColumnFilterPopoverProps) {
  const filter = column.filter
  if (!filter) return null

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    onChange(newValue || null)
  }

  const handleSelectChange = (e: any) => {
    const newValue = e.target.value
    if (filter.multiple) {
      onChange(newValue.length > 0 ? newValue : null)
    } else {
      onChange(newValue || null)
    }
  }

  const handleBooleanChange = (e: any) => {
    const val = e.target.value
    if (val === '') {
      onChange(null)
    } else {
      onChange(val === 'true')
    }
  }

  const handleClear = () => {
    onChange(null)
    onClose()
  }

  return (
    <Popover
      open={Boolean(anchorEl)}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      slotProps={{
        paper: {
          sx: { p: 1.5, minWidth: 200 }
        }
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {filter.type === 'text' && (
          <TextField
            size="small"
            placeholder={filter.placeholder || 'Filter...'}
            value={(value as string) || ''}
            onChange={handleTextChange}
            autoFocus
            InputProps={{
              endAdornment: value ? (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={handleClear} edge="end">
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : null,
            }}
          />
        )}

        {filter.type === 'select' && !filter.multiple && (
          <FormControl size="small" fullWidth>
            <InputLabel>{filter.placeholder || 'Select'}</InputLabel>
            <Select
              value={(value as string) || ''}
              onChange={handleSelectChange}
              label={filter.placeholder || 'Select'}
            >
              <MenuItem value="">
                <em>All</em>
              </MenuItem>
              {filter.options?.map(opt => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        {filter.type === 'select' && filter.multiple && (
          <FormControl size="small" fullWidth>
            <InputLabel>{filter.placeholder || 'Select'}</InputLabel>
            <Select
              multiple
              value={(value as string[]) || []}
              onChange={handleSelectChange}
              label={filter.placeholder || 'Select'}
              renderValue={(selected) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {(selected as string[]).map((val) => {
                    const opt = filter.options?.find(o => o.value === val)
                    return <Chip key={val} label={opt?.label || val} size="small" />
                  })}
                </Box>
              )}
            >
              {filter.options?.map(opt => (
                <MenuItem key={opt.value} value={opt.value}>
                  <Checkbox checked={((value as string[]) || []).includes(opt.value)} />
                  <ListItemText primary={opt.label} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        {filter.type === 'boolean' && (
          <FormControl size="small" fullWidth>
            <InputLabel>{filter.placeholder || 'Value'}</InputLabel>
            <Select
              value={value === null ? '' : String(value)}
              onChange={handleBooleanChange}
              label={filter.placeholder || 'Value'}
            >
              <MenuItem value="">
                <em>All</em>
              </MenuItem>
              <MenuItem value="true">Yes</MenuItem>
              <MenuItem value="false">No</MenuItem>
            </Select>
          </FormControl>
        )}

        {value !== null && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <IconButton size="small" onClick={handleClear} title="Clear filter">
              <ClearIcon fontSize="small" />
            </IconButton>
          </Box>
        )}
      </Box>
    </Popover>
  )
}
