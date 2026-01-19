import { useState, useRef } from 'react'
import { Box, TextField, InputAdornment, Popover, IconButton } from '@mui/material'
import PaletteIcon from '@mui/icons-material/Palette'

interface ColorPickerProps {
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

const PRESET_COLORS = [
  '#003162', '#1976d2', '#42a5f5', '#1565c0',
  '#fecf18', '#ff9800', '#ffb74d', '#f57c00',
  '#4caf50', '#2e7d32', '#81c784', '#388e3c',
  '#f44336', '#d32f2f', '#ef5350', '#c62828',
  '#9c27b0', '#7b1fa2', '#ba68c8', '#6a1b9a',
  '#000000', '#333333', '#666666', '#999999',
  '#cccccc', '#e0e0e0', '#f5f5f5', '#ffffff',
]

export function ColorPicker({ label, value, onChange, disabled = false }: ColorPickerProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!disabled) {
      setAnchorEl(event.currentTarget)
    }
  }

  const handleClose = () => {
    setAnchorEl(null)
  }

  const handlePresetClick = (color: string) => {
    onChange(color)
    handleClose()
  }

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.value
    // Allow typing without validation, but only emit valid hex colors
    if (/^#[0-9A-Fa-f]{6}$/.test(newValue)) {
      onChange(newValue)
    } else if (newValue.startsWith('#') || newValue === '') {
      // Allow partial input while typing
      onChange(newValue)
    }
  }

  const open = Boolean(anchorEl)

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
      <TextField
        ref={inputRef}
        label={label}
        value={value}
        onChange={handleInputChange}
        disabled={disabled}
        size="small"
        sx={{ width: 150 }}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <Box
                  sx={{
                    width: 20,
                    height: 20,
                    backgroundColor: /^#[0-9A-Fa-f]{6}$/.test(value) ? value : '#ffffff',
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 0.5,
                  }}
                />
              </InputAdornment>
            ),
          },
        }}
      />
      <IconButton onClick={handleClick} disabled={disabled} size="small">
        <PaletteIcon />
      </IconButton>
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'left',
        }}
      >
        <Box sx={{ p: 1.5, display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 0.5 }}>
          {PRESET_COLORS.map((color) => (
            <Box
              key={color}
              onClick={() => handlePresetClick(color)}
              sx={{
                width: 28,
                height: 28,
                backgroundColor: color,
                border: '1px solid',
                borderColor: color === value ? 'primary.main' : 'divider',
                borderWidth: color === value ? 2 : 1,
                borderRadius: 0.5,
                cursor: 'pointer',
                '&:hover': {
                  borderColor: 'primary.main',
                  transform: 'scale(1.1)',
                },
                transition: 'transform 0.1s',
              }}
            />
          ))}
        </Box>
        <Box sx={{ px: 1.5, pb: 1.5 }}>
          <input
            type="color"
            value={/^#[0-9A-Fa-f]{6}$/.test(value) ? value : '#000000'}
            onChange={(e) => onChange(e.target.value)}
            style={{ width: '100%', height: 30, cursor: 'pointer', border: 'none' }}
          />
        </Box>
      </Popover>
    </Box>
  )
}
