import { Box, Typography, Stack, Switch as MuiSwitch, FormControlLabel, Link, Skeleton, Button, TextField, IconButton, Tooltip, Dialog, DialogTitle, DialogContent, DialogActions, InputAdornment, ToggleButton, ToggleButtonGroup, Popover } from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'
import EditOffIcon from '@mui/icons-material/EditOff'
import FullscreenIcon from '@mui/icons-material/Fullscreen'
import CloseIcon from '@mui/icons-material/Close'
import CheckIcon from '@mui/icons-material/Check'
import ClearIcon from '@mui/icons-material/Clear'
import type { Asset, AssetTypeAttribute } from '../types'
import { useLoaderData, useLocation, useParams, Link as RouterLink } from 'react-router-dom'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { fetchAssetsByType } from '../api/assets'
import AttributeValueRenderer from '../components/AttributeValueRenderer'
import VirtualizedGrid, { type ColumnDefinition, type CellEditorProps } from '../components/VirtualizedGrid'

export default function AssetListPage() {
  const initialData = useLoaderData() as {
    assets: Asset[],
    attributes?: AssetTypeAttribute[],
    totalCount: number,
    pageSize: number,
    workspaceId: string
  }

  const { assetTypeId } = useParams()
  const location = useLocation()

  // Convert initial assets array to Map for VirtualizedGrid
  const initialItemsMap = useMemo(() => {
    const map = new Map<number, Asset>()
    initialData.assets?.forEach((asset, index) => {
      map.set(index, asset)
    })
    return map
  }, [initialData.assets])

  // State for virtualized grid with offset pagination
  const [items, setItems] = useState<Map<number, Asset>>(initialItemsMap)
  const [attributes] = useState<AssetTypeAttribute[]>(initialData.attributes || [])
  const [totalCount, setTotalCount] = useState(initialData.totalCount)
  const [isLoading, setIsLoading] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  const [editingEnabled, setEditingEnabled] = useState(false)

  // Filter attributes based on showHidden toggle
  const hiddenCount = useMemo(() => attributes.filter(attr => attr.isHidden).length, [attributes])
  const displayAttributes = useMemo(
    () => showHidden ? attributes : attributes.filter(attr => !attr.isHidden),
    [attributes, showHidden]
  )

  // Reset when route changes (different asset type)
  useEffect(() => {
    const map = new Map<number, Asset>()
    initialData.assets?.forEach((asset, index) => {
      map.set(index, asset)
    })
    setItems(map)
    setTotalCount(initialData.totalCount)
  }, [initialData])

  // Load a range of items
  const handleLoadRange = useCallback(async (startIndex: number, endIndex: number) => {
    if (isLoading) return

    setIsLoading(true)
    try {
      const limit = endIndex - startIndex + 1
      const response = await fetchAssetsByType(
        initialData.workspaceId,
        assetTypeId!,
        limit,
        startIndex
      )

      const newAssets = response.results || []
      setItems(prev => {
        const updated = new Map(prev)
        newAssets.forEach((asset: Asset, i: number) => {
          updated.set(startIndex + i, asset)
        })
        return updated
      })
      setTotalCount(response.count)
    } catch (error) {
      console.error('Failed to load assets:', error)
    } finally {
      setIsLoading(false)
    }
  }, [assetTypeId, initialData.workspaceId, isLoading])

  // Handle cell edit
  const handleCellEdit = useCallback((asset: Asset, columnKey: string, newValue: string, rowIndex: number) => {
    console.log('Cell edited:', { asset, columnKey, newValue, rowIndex })
    // TODO: Implement actual save logic (API call)
    // For now, just update local state
    setItems(prev => {
      const updated = new Map(prev)
      const existingAsset = updated.get(rowIndex)
      if (existingAsset) {
        // Handle attribute columns (prefixed with 'attr-')
        if (columnKey.startsWith('attr-')) {
          const attrId = columnKey.replace('attr-', '')
          const attribute = attributes.find(a => a.id === attrId)
          if (attribute) {
            // Convert value based on attribute type
            let valueToStore: any = newValue.trim() === '' ? null : newValue

            if (valueToStore !== null) {
              switch (attribute.attributeType) {
                case 'boolean':
                  valueToStore = newValue === 'true'
                  break
                case 'number':
                  valueToStore = parseFloat(newValue) || null
                  break
                case 'date':
                case 'datetime':
                  // Store as ISO string
                  valueToStore = newValue ? new Date(newValue).toISOString() : null
                  break
                case 'link':
                  // Try to parse as JSON object {url, text}, otherwise keep as string URL
                  try {
                    const parsed = JSON.parse(newValue)
                    if (typeof parsed === 'object' && parsed.url !== undefined) {
                      valueToStore = parsed
                    }
                  } catch {
                    // Keep as string URL
                  }
                  break
                // 'json', 'text', 'string' stay as strings
              }
            }

            updated.set(rowIndex, {
              ...existingAsset,
              attributes: {
                ...existingAsset.attributes,
                [attribute.apiKey]: valueToStore
              }
            })
          }
        } else if (columnKey === 'name') {
          updated.set(rowIndex, { ...existingAsset, name: newValue })
        }
      }
      return updated
    })
  }, [attributes])

  const formatCoordinates = (assetLocation: any) => {
    if (!assetLocation?.coordinates) {
      return 'N/A'
    }

    const coords = assetLocation.coordinates
    // Location is always a Point: [lng, lat]
    if (Array.isArray(coords) && coords.length >= 2 && typeof coords[0] === 'number') {
      return `${coords[1].toFixed(6)}, ${coords[0].toFixed(6)}`
    }

    return 'N/A'
  }

  const getAttributeValue = (asset: Asset, apiKey: string) => {
    return asset?.attributes?.[apiKey] ?? null
  }

  // Helper to format attribute value as string for copying
  const formatAttributeValueForCopy = (value: any, attributeType: string): string => {
    if (value === null || value === undefined) return ''
    if (attributeType === 'json') {
      const jsonValue = value.rawJson ?? value
      return typeof jsonValue === 'string' ? jsonValue : JSON.stringify(jsonValue)
    }
    if (attributeType === 'boolean') return value ? 'Yes' : 'No'
    if (attributeType === 'date' || attributeType === 'datetime') {
      const date = new Date(value)
      return attributeType === 'datetime' ? date.toLocaleString() : date.toLocaleDateString()
    }
    if (attributeType === 'link') {
      if (typeof value === 'string') return value
      // For {url, text} objects, show display text if available, otherwise URL
      return value.text || value.url || ''
    }
    return String(value)
  }

  // JSON cell editor for inline editing of JSON attributes
  const JsonCellEditor = useCallback(({ value, onSave, onCancel, style, selectionBorders }: CellEditorProps<Asset>) => {
    const [editValue, setEditValue] = useState(value)
    const [isFullscreen, setIsFullscreen] = useState(false)
    const inputRef = useRef<HTMLTextAreaElement>(null)
    const fullscreenInputRef = useRef<HTMLTextAreaElement>(null)

    useEffect(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, [])

    // Focus fullscreen input when dialog opens
    useEffect(() => {
      if (isFullscreen) {
        // Small delay to ensure dialog is rendered
        setTimeout(() => {
          fullscreenInputRef.current?.focus()
          fullscreenInputRef.current?.select()
        }, 50)
      }
    }, [isFullscreen])

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        onSave(editValue)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
      e.stopPropagation()
    }

    const handleFullscreenKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setIsFullscreen(false)
      }
      e.stopPropagation()
    }

    const handleFullscreenSave = () => {
      setIsFullscreen(false)
      onSave(editValue)
    }

    const handleFullscreenCancel = () => {
      setIsFullscreen(false)
      onCancel()
    }

    return (
      <>
        <Box
          style={style}
          sx={{
            display: 'flex',
            alignItems: 'center',
            bgcolor: 'background.paper',
            position: 'relative',
            zIndex: 2,
            borderBottom: selectionBorders?.bottom ? 'none' : '1px solid',
            borderRight: selectionBorders?.right ? 'none' : '1px solid',
            borderRightColor: 'divider',
            borderBottomColor: 'divider',
            '&::after': selectionBorders ? {
              content: '""',
              position: 'absolute',
              top: -1,
              right: -1,
              bottom: -1,
              left: -1,
              borderTop: `${selectionBorders?.top ? 2 : 0}px solid`,
              borderRight: `${selectionBorders?.right ? 2 : 0}px solid`,
              borderBottom: `${selectionBorders?.bottom ? 2 : 0}px solid`,
              borderLeft: `${selectionBorders?.left ? 2 : 0}px solid`,
              borderColor: (theme: any) => theme.palette.mode === 'dark' ? theme.palette.secondary.main : theme.palette.primary.main,
              pointerEvents: 'none',
              zIndex: 10,
            } : undefined,
            boxSizing: 'border-box',
            '& .fullscreen-btn': { opacity: 0 },
            '&:hover .fullscreen-btn': { opacity: 1 },
          }}
        >
          <TextField
            inputRef={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              // Don't save on blur if opening fullscreen
              if (!isFullscreen) {
                onSave(editValue)
              }
            }}
            variant="standard"
            fullWidth
            multiline
            maxRows={4}
            size="small"
            slotProps={{
              input: {
                disableUnderline: true,
                sx: {
                  px: 1,
                  py: 0.5,
                  fontSize: '0.75rem',
                  fontFamily: 'monospace',
                }
              }
            }}
          />
          <Tooltip title="Edit JSON" arrow>
            <IconButton
              className="fullscreen-btn"
              size="small"
              onMouseDown={(e) => {
                e.preventDefault() // Prevent blur
                e.stopPropagation()
                setIsFullscreen(true)
              }}
              sx={{
                p: 0.25,
                mr: 0.5,
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
          onClose={handleFullscreenCancel}
          maxWidth="md"
          fullWidth
          onClick={(e) => e.stopPropagation()}
        >
          <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
            <Typography variant="h6">Edit JSON</Typography>
            <IconButton onClick={handleFullscreenCancel} size="small">
              <CloseIcon />
            </IconButton>
          </DialogTitle>
          <DialogContent sx={{ p: 2 }}>
            <TextField
              inputRef={fullscreenInputRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleFullscreenKeyDown}
              variant="outlined"
              fullWidth
              multiline
              minRows={10}
              maxRows={20}
              slotProps={{
                input: {
                  sx: {
                    fontFamily: 'monospace',
                    fontSize: '0.875rem',
                  }
                }
              }}
            />
          </DialogContent>
          <DialogActions sx={{ px: 2, pb: 2 }}>
            <Button onClick={handleFullscreenCancel} color="inherit">
              Cancel
            </Button>
            <Button onClick={handleFullscreenSave} variant="contained">
              Save
            </Button>
          </DialogActions>
        </Dialog>
      </>
    )
  }, [])

  // Number cell editor with unit display
  const createNumberWithUnitEditor = useCallback((unit?: string) => {
    return ({ value, onSave, onCancel, style, selectionBorders }: CellEditorProps<Asset>) => {
      // Filter initial value to only valid number characters
      const filterNumber = (v: string) => v.replace(/[^0-9.\-]/g, '')
      const [editValue, setEditValue] = useState(filterNumber(value))
      const inputRef = useRef<HTMLInputElement>(null)
      // Detect if opened via keyboard input (single valid digit/character)
      const isKeyboardInputRef = useRef(value.length === 1 && /^[0-9.\-]$/.test(value))

      useEffect(() => {
        const input = inputRef.current
        if (!input) return
        input.focus()
        // If opened via keyboard input, put cursor at end
        // Otherwise select all text
        if (isKeyboardInputRef.current) {
          const len = input.value.length
          input.setSelectionRange(len, len)
        } else {
          input.select()
        }
      }, [])

      const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        // Only allow valid number characters: digits, decimal point, minus sign
        const filtered = filterNumber(e.target.value)
        setEditValue(filtered)
      }

      const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          onSave(editValue)
        } else if (e.key === 'Escape') {
          e.preventDefault()
          onCancel()
        } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
          onSave(editValue)
          return // Don't stop propagation - let grid handle navigation
        }
        e.stopPropagation()
      }

      return (
        <Box
          style={style}
          sx={{
            display: 'flex',
            alignItems: 'center',
            bgcolor: 'background.paper',
            position: 'relative',
            zIndex: 2,
            borderBottom: selectionBorders?.bottom ? 'none' : '1px solid',
            borderRight: selectionBorders?.right ? 'none' : '1px solid',
            borderRightColor: 'divider',
            borderBottomColor: 'divider',
            '&::after': selectionBorders ? {
              content: '""',
              position: 'absolute',
              top: -1,
              right: -1,
              bottom: -1,
              left: -1,
              borderTop: `${selectionBorders?.top ? 2 : 0}px solid`,
              borderRight: `${selectionBorders?.right ? 2 : 0}px solid`,
              borderBottom: `${selectionBorders?.bottom ? 2 : 0}px solid`,
              borderLeft: `${selectionBorders?.left ? 2 : 0}px solid`,
              borderColor: (theme: any) => theme.palette.mode === 'dark' ? theme.palette.secondary.main : theme.palette.primary.main,
              pointerEvents: 'none',
              zIndex: 10,
            } : undefined,
            boxSizing: 'border-box',
          }}
        >
          <TextField
            inputRef={inputRef}
            value={editValue}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onBlur={() => onSave(editValue)}
            variant="standard"
            fullWidth
            type="text"
            inputMode="decimal"
            size="small"
            slotProps={{
              input: {
                disableUnderline: true,
                endAdornment: unit ? (
                  <InputAdornment position="end">
                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                      {unit}
                    </Typography>
                  </InputAdornment>
                ) : undefined,
                sx: {
                  px: 1,
                  py: 0.5,
                  fontSize: '0.75rem',
                  fontVariantNumeric: 'tabular-nums',
                }
              }
            }}
          />
        </Box>
      )
    }
  }, [])

  // Boolean cell editor with toggle buttons
  const BooleanCellEditor = useCallback(({ value, onSave, onCancel, style, selectionBorders }: CellEditorProps<Asset>) => {
    // Parse value - handle string 'true'/'false' and actual booleans
    const parseBool = (v: string) => v === 'true' || v === 'Yes' || v === '1'
    const [editValue, setEditValue] = useState<boolean | null>(
      value === '' ? null : parseBool(value)
    )

    const handleChange = (_: React.MouseEvent<HTMLElement>, newValue: boolean | null) => {
      setEditValue(newValue)
      // Save immediately on selection
      if (newValue !== null) {
        onSave(newValue ? 'true' : 'false')
      }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        onSave(editValue !== null ? (editValue ? 'true' : 'false') : '')
      }
      e.stopPropagation()
    }

    return (
      <Box
        style={style}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'background.paper',
          position: 'relative',
          zIndex: 2,
          borderBottom: selectionBorders?.bottom ? 'none' : '1px solid',
          borderRight: selectionBorders?.right ? 'none' : '1px solid',
          borderRightColor: 'divider',
          borderBottomColor: 'divider',
          '&::after': selectionBorders ? {
            content: '""',
            position: 'absolute',
            top: -1,
            right: -1,
            bottom: -1,
            left: -1,
            borderTop: `${selectionBorders?.top ? 2 : 0}px solid`,
            borderRight: `${selectionBorders?.right ? 2 : 0}px solid`,
            borderBottom: `${selectionBorders?.bottom ? 2 : 0}px solid`,
            borderLeft: `${selectionBorders?.left ? 2 : 0}px solid`,
            borderColor: (theme: any) => theme.palette.mode === 'dark' ? theme.palette.secondary.main : theme.palette.primary.main,
            pointerEvents: 'none',
            zIndex: 10,
          } : undefined,
          boxSizing: 'border-box',
        }}
      >
        <ToggleButtonGroup
          value={editValue}
          exclusive
          onChange={handleChange}
          size="small"
          sx={{ height: 28 }}
        >
          <ToggleButton value={true} sx={{ px: 1.5, py: 0.25 }}>
            <CheckIcon sx={{ fontSize: 16, color: 'success.main' }} />
          </ToggleButton>
          <ToggleButton value={false} sx={{ px: 1.5, py: 0.25 }}>
            <ClearIcon sx={{ fontSize: 16, color: 'error.main' }} />
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>
    )
  }, [])

  // Date cell editor
  const DateCellEditor = useCallback(({ value, onSave, onCancel, style, selectionBorders }: CellEditorProps<Asset>) => {
    // Convert display date to input format (YYYY-MM-DD)
    const parseDate = (v: string) => {
      if (!v) return ''
      try {
        const date = new Date(v)
        if (isNaN(date.getTime())) return ''
        return date.toISOString().split('T')[0]
      } catch {
        return ''
      }
    }
    const [editValue, setEditValue] = useState(parseDate(value))
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
      inputRef.current?.focus()
    }, [])

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        onSave(editValue)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
      e.stopPropagation()
    }

    return (
      <Box
        style={style}
        sx={{
          display: 'flex',
          alignItems: 'center',
          bgcolor: 'background.paper',
          position: 'relative',
          zIndex: 2,
          borderBottom: selectionBorders?.bottom ? 'none' : '1px solid',
          borderRight: selectionBorders?.right ? 'none' : '1px solid',
          borderRightColor: 'divider',
          borderBottomColor: 'divider',
          '&::after': selectionBorders ? {
            content: '""',
            position: 'absolute',
            top: -1,
            right: -1,
            bottom: -1,
            left: -1,
            borderTop: `${selectionBorders?.top ? 2 : 0}px solid`,
            borderRight: `${selectionBorders?.right ? 2 : 0}px solid`,
            borderBottom: `${selectionBorders?.bottom ? 2 : 0}px solid`,
            borderLeft: `${selectionBorders?.left ? 2 : 0}px solid`,
            borderColor: (theme: any) => theme.palette.mode === 'dark' ? theme.palette.secondary.main : theme.palette.primary.main,
            pointerEvents: 'none',
            zIndex: 10,
          } : undefined,
          boxSizing: 'border-box',
        }}
      >
        <TextField
          inputRef={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => onSave(editValue)}
          variant="standard"
          fullWidth
          type="date"
          size="small"
          slotProps={{
            input: {
              disableUnderline: true,
              sx: {
                px: 1,
                py: 0.5,
                fontSize: '0.75rem',
              }
            }
          }}
        />
      </Box>
    )
  }, [])

  // DateTime cell editor
  const DateTimeCellEditor = useCallback(({ value, onSave, onCancel, style, selectionBorders }: CellEditorProps<Asset>) => {
    // Convert display datetime to input format (YYYY-MM-DDTHH:mm)
    const parseDateTime = (v: string) => {
      if (!v) return ''
      try {
        const date = new Date(v)
        if (isNaN(date.getTime())) return ''
        return date.toISOString().slice(0, 16)
      } catch {
        return ''
      }
    }
    const [editValue, setEditValue] = useState(parseDateTime(value))
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
      inputRef.current?.focus()
    }, [])

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        onSave(editValue)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
      e.stopPropagation()
    }

    return (
      <Box
        style={style}
        sx={{
          display: 'flex',
          alignItems: 'center',
          bgcolor: 'background.paper',
          position: 'relative',
          zIndex: 2,
          borderBottom: selectionBorders?.bottom ? 'none' : '1px solid',
          borderRight: selectionBorders?.right ? 'none' : '1px solid',
          borderRightColor: 'divider',
          borderBottomColor: 'divider',
          '&::after': selectionBorders ? {
            content: '""',
            position: 'absolute',
            top: -1,
            right: -1,
            bottom: -1,
            left: -1,
            borderTop: `${selectionBorders?.top ? 2 : 0}px solid`,
            borderRight: `${selectionBorders?.right ? 2 : 0}px solid`,
            borderBottom: `${selectionBorders?.bottom ? 2 : 0}px solid`,
            borderLeft: `${selectionBorders?.left ? 2 : 0}px solid`,
            borderColor: (theme: any) => theme.palette.mode === 'dark' ? theme.palette.secondary.main : theme.palette.primary.main,
            pointerEvents: 'none',
            zIndex: 10,
          } : undefined,
          boxSizing: 'border-box',
        }}
      >
        <TextField
          inputRef={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => onSave(editValue)}
          variant="standard"
          fullWidth
          type="datetime-local"
          size="small"
          slotProps={{
            input: {
              disableUnderline: true,
              sx: {
                px: 1,
                py: 0.5,
                fontSize: '0.75rem',
              }
            }
          }}
        />
      </Box>
    )
  }, [])

  // Link cell editor with popover for URL and display text
  const LinkCellEditor = useCallback(({ value, onSave, onCancel, style, selectionBorders }: CellEditorProps<Asset>) => {
    // Parse incoming value - could be string URL or {url, text} object
    // Also detect if value is a single printable character (from keyboard input)
    const parseLink = (v: string): { url: string; text: string; isKeyboardInput: boolean } => {
      if (!v) return { url: '', text: '', isKeyboardInput: false }
      // Check if this is a single printable character (keyboard input to start editing)
      if (v.length === 1 && /^[a-zA-Z0-9]$/.test(v)) {
        return { url: v, text: '', isKeyboardInput: true }
      }
      try {
        const parsed = JSON.parse(v)
        if (typeof parsed === 'object' && parsed.url !== undefined) {
          return { url: parsed.url || '', text: parsed.text || '', isKeyboardInput: false }
        }
      } catch {
        // Not JSON, treat as plain URL string
      }
      return { url: v, text: '', isKeyboardInput: false }
    }

    const initialLink = parseLink(value)
    const [urlValue, setUrlValue] = useState(initialLink.url)
    const [textValue, setTextValue] = useState(initialLink.text)
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
    const cellRef = useRef<HTMLDivElement>(null)
    const urlInputRef = useRef<HTMLInputElement>(null)
    const isKeyboardInputRef = useRef(initialLink.isKeyboardInput)

    // Open popover on mount
    useEffect(() => {
      if (cellRef.current) {
        setAnchorEl(cellRef.current)
      }
    }, [])

    // Focus URL input when popover opens
    useEffect(() => {
      if (anchorEl) {
        setTimeout(() => {
          const input = urlInputRef.current
          if (!input) return
          input.focus()
          // If opened via keyboard input, put cursor at end (after the typed character)
          // Otherwise select all text
          if (isKeyboardInputRef.current) {
            const len = input.value.length
            input.setSelectionRange(len, len)
          } else {
            input.select()
          }
        }, 50)
      }
    }, [anchorEl])

    const saveValue = () => {
      // If both are empty, save empty string
      if (!urlValue && !textValue) {
        onSave('')
        return
      }
      // If only URL with no display text, just save the URL string for simplicity
      if (urlValue && !textValue) {
        onSave(urlValue)
        return
      }
      // Save as JSON object with url and text
      onSave(JSON.stringify({ url: urlValue, text: textValue }))
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        saveValue()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
      e.stopPropagation()
    }

    const handlePopoverClose = () => {
      saveValue()
    }

    // Display text for the cell
    const displayText = textValue || urlValue || ''

    return (
      <>
        <Box
          ref={cellRef}
          style={style}
          sx={{
            display: 'flex',
            alignItems: 'center',
            bgcolor: 'background.paper',
            position: 'relative',
            zIndex: 2,
            borderBottom: selectionBorders?.bottom ? 'none' : '1px solid',
            borderRight: selectionBorders?.right ? 'none' : '1px solid',
            borderRightColor: 'divider',
            borderBottomColor: 'divider',
            '&::after': selectionBorders ? {
              content: '""',
              position: 'absolute',
              top: -1,
              right: -1,
              bottom: -1,
              left: -1,
              borderTop: `${selectionBorders?.top ? 2 : 0}px solid`,
              borderRight: `${selectionBorders?.right ? 2 : 0}px solid`,
              borderBottom: `${selectionBorders?.bottom ? 2 : 0}px solid`,
              borderLeft: `${selectionBorders?.left ? 2 : 0}px solid`,
              borderColor: (theme: any) => theme.palette.mode === 'dark' ? theme.palette.secondary.main : theme.palette.primary.main,
              pointerEvents: 'none',
              zIndex: 10,
            } : undefined,
            boxSizing: 'border-box',
            px: 1,
          }}
        >
          <Typography
            variant="body2"
            sx={{
              fontSize: '0.75rem',
              color: urlValue ? 'primary.main' : 'text.secondary',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {displayText || 'Click to edit link...'}
          </Typography>
        </Box>

        <Popover
          open={Boolean(anchorEl)}
          anchorEl={anchorEl}
          onClose={handlePopoverClose}
          anchorOrigin={{
            vertical: 'bottom',
            horizontal: 'left',
          }}
          transformOrigin={{
            vertical: 'top',
            horizontal: 'left',
          }}
          slotProps={{
            paper: {
              sx: { p: 2, width: 320 }
            }
          }}
        >
          <Stack spacing={2}>
            <TextField
              inputRef={urlInputRef}
              value={urlValue}
              onChange={(e) => setUrlValue(e.target.value)}
              onKeyDown={handleKeyDown}
              label="URL"
              type="url"
              placeholder="https://..."
              size="small"
              fullWidth
            />
            <TextField
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              onKeyDown={handleKeyDown}
              label="Display Text"
              placeholder="Optional text to show instead of URL"
              size="small"
              fullWidth
            />
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button size="small" onClick={onCancel}>
                Cancel
              </Button>
              <Button size="small" variant="contained" onClick={saveValue}>
                Save
              </Button>
            </Stack>
          </Stack>
        </Popover>
      </>
    )
  }, [])

  // Build column definitions
  const columns: ColumnDefinition<Asset>[] = useMemo(() => {
    const baseColumns: ColumnDefinition<Asset>[] = [
      {
        key: 'name',
        header: <Box sx={{ px: 2 }}>Name</Box>,
        width: 200,
        minWidth: 150,
        editable: editingEnabled,
        render: (asset) => (
          <Box sx={{ px: 2 }}>
            {editingEnabled ? (
              asset.name
            ) : (
              <Link
                component={RouterLink}
                to={asset.id}
                underline="hover"
                state={{
                  ...location.state,
                  assetName: asset.name
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {asset.name}
              </Link>
            )}
          </Box>
        ),
        getCellValue: (asset) => asset.name,
        headerSx: { fontWeight: 600 },
      },
      {
        key: 'coordinates',
        header: <Box sx={{ px: 2 }}>Coordinates</Box>,
        width: 200,
        minWidth: 100,
        render: (asset) => (
          <Box sx={{ px: 2, fontFamily: 'monospace', fontSize: '0.75rem', color: 'text.secondary' }}>
            {formatCoordinates(asset.location)}
          </Box>
        ),
        getCellValue: (asset) => formatCoordinates(asset.location),
        headerSx: { fontWeight: 600 },
      },
    ]

    // Helper to get the editor for an attribute type
    const getEditorForAttribute = (attr: AssetTypeAttribute) => {
      switch (attr.attributeType) {
        case 'json': return JsonCellEditor
        case 'number': return createNumberWithUnitEditor(attr.unit)
        case 'boolean': return BooleanCellEditor
        case 'date': return DateCellEditor
        case 'datetime': return DateTimeCellEditor
        case 'link': return LinkCellEditor
        default: return undefined
      }
    }

    // All attribute types are now editable
    const editableTypes = ['string', 'number', 'text', 'json', 'boolean', 'date', 'datetime', 'link']

    // Add dynamic attribute columns
    const attributeColumns: ColumnDefinition<Asset>[] = displayAttributes.map(attr => ({
      key: `attr-${attr.id}`,
      header: (
        <Box sx={{ px: 2, opacity: attr.isHidden ? 0.5 : 1 }}>
          {attr.name}
        </Box>
      ),
      width: 150,
      minWidth: 100,
      editable: editingEnabled && editableTypes.includes(attr.attributeType),
      editor: getEditorForAttribute(attr),
      render: (asset) => (
        <Box sx={{ px: 2, overflow: 'hidden', opacity: attr.isHidden ? 0.5 : 1 }}>
          <AttributeValueRenderer
            attribute={attr}
            value={getAttributeValue(asset, attr.apiKey)}
            maxLines={1}
            lineNumbers="fullscreen"
            showCopyButton={false}
            compact
          />
        </Box>
      ),
      getCellValue: (asset) => formatAttributeValueForCopy(
        getAttributeValue(asset, attr.apiKey),
        attr.attributeType
      ),
      headerSx: { fontWeight: 600 },
    }))

    return [...baseColumns, ...attributeColumns]
  }, [displayAttributes, location.state, editingEnabled, JsonCellEditor, createNumberWithUnitEditor, BooleanCellEditor, DateCellEditor, DateTimeCellEditor, LinkCellEditor])

  // Cell placeholder for loading state
  const cellPlaceholder = (
    <Box sx={{ px: 2, width: '100%' }}>
      <Skeleton variant="text" width="100%" height={20} />
    </Box>
  )

  // Header with title and controls
  const header = (
    <Box sx={{ flexShrink: 0, p: 3, pb: 2 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5" component="h2">Assets</Typography>
        <Stack direction="row" alignItems="center" spacing={2}>
          <Button
            size="small"
            variant={editingEnabled ? 'contained' : 'outlined'}
            color={editingEnabled ? 'primary' : 'inherit'}
            startIcon={editingEnabled ? <EditOffIcon /> : <EditIcon />}
            onClick={() => setEditingEnabled(!editingEnabled)}
          >
            {editingEnabled ? 'Done Editing' : 'Edit'}
          </Button>
          {hiddenCount > 0 && (
            <FormControlLabel
              control={
                <MuiSwitch
                  size="small"
                  checked={showHidden}
                  onChange={(e) => setShowHidden(e.target.checked)}
                />
              }
              label={
                <Typography variant="body2" color="text.secondary">
                  Show hidden ({hiddenCount})
                </Typography>
              }
            />
          )}
          <Typography color="text.secondary">
            {items.size} of {totalCount}
          </Typography>
        </Stack>
      </Stack>
    </Box>
  )

  return (
    <Box sx={{
      flexGrow: 1,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      bgcolor: 'background.default',
      height: '100%',
      minHeight: 0,
      pb: 2
    }}>
      <VirtualizedGrid<Asset>
        items={items}
        totalCount={totalCount}
        getRowKey={(asset) => asset.id}
        columns={columns}
        onLoadRange={handleLoadRange}
        isLoading={isLoading}
        estimatedRowHeight={52}
        emptyMessage="No assets found"
        header={header}
        loadingPlaceholder={cellPlaceholder}
        stickyHeader
        headerHeight={48}
        onCellEdit={editingEnabled ? handleCellEdit : undefined}
      />
    </Box>
  )
}
