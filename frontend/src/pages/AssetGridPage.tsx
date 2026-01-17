import { Box, Typography, Stack, Switch as MuiSwitch, FormControlLabel, Link, Skeleton, Button, TextField, IconButton, Tooltip, Dialog, DialogTitle, DialogContent, DialogActions, InputAdornment, ToggleButton, ToggleButtonGroup, Popover, MenuItem, Select, CircularProgress, Snackbar, Alert } from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'
import EditOffIcon from '@mui/icons-material/EditOff'
import SaveIcon from '@mui/icons-material/Save'
import FullscreenIcon from '@mui/icons-material/Fullscreen'
import CloseIcon from '@mui/icons-material/Close'
import CheckIcon from '@mui/icons-material/Check'
import ClearIcon from '@mui/icons-material/Clear'
import MapIcon from '@mui/icons-material/Map'
import type { Asset, AssetTypeAttribute } from '../types'
import { useLoaderData, useLocation, useParams, Link as RouterLink, useBlocker, useNavigate } from 'react-router-dom'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { fetchAssetsByType, updateAsset } from '../api/assets'
import AttributeValueRenderer from '../components/AttributeValueRenderer'
import VirtualizedGrid, { type ColumnDefinition, type CellEditorProps } from '../components/VirtualizedGrid'

// Type for tracking pending changes per asset
// Stores name change and/or attribute changes (keyed by apiKey)
interface AssetChanges {
  name?: string
  attributes?: Record<string, any>  // keyed by apiKey
}

export default function AssetGridPage() {
  const initialData = useLoaderData() as {
    assets: Asset[],
    attributes?: AssetTypeAttribute[],
    totalCount: number,
    pageSize: number,
    workspaceId: string
  }

  const { assetTypeId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()

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

  // State for tracking pending changes and save status
  const [pendingChanges, setPendingChanges] = useState<Map<string, AssetChanges>>(new Map())
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false)

  // Track the last saved state - used for discarding unsaved changes
  // This gets updated after each successful save
  const lastSavedItemsRef = useRef<Map<number, Asset>>(initialItemsMap)

  // Track if there are unsaved changes
  const hasUnsavedChanges = pendingChanges.size > 0

  // Filter attributes based on showHidden toggle
  const hiddenCount = useMemo(() => attributes.filter(attr => attr.isHidden).length, [attributes])
  const displayAttributes = useMemo(
    () => showHidden ? attributes : attributes.filter(attr => !attr.isHidden),
    [attributes, showHidden]
  )

  // Track the previous initialData to detect actual route changes
  const prevInitialDataRef = useRef(initialData)

  // Reset when route changes (different asset type) - but not if we have unsaved changes
  useEffect(() => {
    // Only reset if initialData actually changed (route change), not just on re-render
    if (prevInitialDataRef.current === initialData) return
    prevInitialDataRef.current = initialData

    // Don't reset if we have unsaved changes - the blocker dialog should handle navigation
    if (pendingChanges.size > 0) return

    const map = new Map<number, Asset>()
    initialData.assets?.forEach((asset, index) => {
      map.set(index, asset)
    })
    setItems(map)
    setTotalCount(initialData.totalCount)
    // Also update the last saved state ref for the new route
    lastSavedItemsRef.current = map
  }, [initialData, pendingChanges.size])

  // Warn user before closing browser/tab with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault()
        // Modern browsers ignore custom messages, but we still need to set returnValue
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?'
        return e.returnValue
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedChanges])

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

  // Helper to convert value based on attribute type
  const convertValueForAttribute = useCallback((newValue: string, attributeType: string): any => {
    let valueToStore: any = newValue.trim() === '' ? null : newValue

    if (valueToStore !== null) {
      switch (attributeType) {
        case 'boolean':
          valueToStore = newValue === 'true'
          break
        case 'number':
          valueToStore = Number.parseFloat(newValue) || null
          break
        case 'date':
        case 'datetime': {
          // Store as ISO string, handle invalid dates
          if (newValue) {
            const date = new Date(newValue)
            valueToStore = Number.isNaN(date.getTime()) ? null : date.toISOString()
          } else {
            valueToStore = null
          }
          break
        }
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
    return valueToStore
  }, [])

  // Helper to check if two values are equal (handles null, undefined, objects)
  const valuesAreEqual = useCallback((a: any, b: any): boolean => {
    if (a === b) return true
    if (a == null && b == null) return true
    if (a == null || b == null) return false
    if (typeof a === 'object' && typeof b === 'object') {
      return JSON.stringify(a) === JSON.stringify(b)
    }
    return false
  }, [])

  // Handle cell edit - updates local state and tracks pending changes
  const handleCellEdit = useCallback((asset: Asset, columnKey: string, newValue: string, rowIndex: number) => {
    // Get the original value from last saved state
    const originalAsset = lastSavedItemsRef.current.get(rowIndex)

    // Update local state for immediate UI feedback
    setItems(prev => {
      const updated = new Map(prev)
      const existingAsset = updated.get(rowIndex)
      if (existingAsset) {
        // Handle attribute columns (prefixed with 'attr-')
        if (columnKey.startsWith('attr-')) {
          const attrId = columnKey.replace('attr-', '')
          const attribute = attributes.find(a => a.id === attrId)
          if (attribute) {
            const valueToStore = convertValueForAttribute(newValue, attribute.attributeType)
            const originalValue = originalAsset?.attributes?.[attribute.apiKey]

            updated.set(rowIndex, {
              ...existingAsset,
              attributes: {
                ...existingAsset.attributes,
                [attribute.apiKey]: valueToStore
              }
            })

            // Track or remove the change based on whether it matches original
            setPendingChanges(prevChanges => {
              const newChanges = new Map(prevChanges)
              const assetChanges = newChanges.get(asset.id) || {}
              const newAttributes = { ...assetChanges.attributes }

              if (valuesAreEqual(valueToStore, originalValue)) {
                // Value reverted to original - remove this attribute from pending changes
                delete newAttributes[attribute.apiKey]
              } else {
                // Value changed - track it
                newAttributes[attribute.apiKey] = valueToStore
              }

              // Check if there are any remaining changes for this asset
              const hasNameChange = assetChanges.name !== undefined && !valuesAreEqual(assetChanges.name, originalAsset?.name)
              const hasAttrChanges = Object.keys(newAttributes).length > 0

              if (!hasNameChange && !hasAttrChanges) {
                // No changes left for this asset - remove it entirely
                newChanges.delete(asset.id)
              } else {
                newChanges.set(asset.id, {
                  ...(hasNameChange ? { name: assetChanges.name } : {}),
                  ...(hasAttrChanges ? { attributes: newAttributes } : {})
                })
              }
              return newChanges
            })
          }
        } else if (columnKey === 'name') {
          const originalName = originalAsset?.name
          updated.set(rowIndex, { ...existingAsset, name: newValue })

          // Track or remove the change based on whether it matches original
          setPendingChanges(prevChanges => {
            const newChanges = new Map(prevChanges)
            const assetChanges = newChanges.get(asset.id) || {}

            if (valuesAreEqual(newValue, originalName)) {
              // Value reverted to original - remove name from pending changes
              const { name: _, ...rest } = assetChanges
              const hasAttrChanges = rest.attributes && Object.keys(rest.attributes).length > 0

              if (!hasAttrChanges) {
                // No changes left for this asset - remove it entirely
                newChanges.delete(asset.id)
              } else {
                newChanges.set(asset.id, rest)
              }
            } else {
              // Value changed - track it
              newChanges.set(asset.id, {
                ...assetChanges,
                name: newValue
              })
            }
            return newChanges
          })
        }
      }
      return updated
    })
  }, [attributes, convertValueForAttribute, valuesAreEqual])

  // Handle paste range - paste data into multiple cells, tiling to fill the selection
  // If clipboard data is larger than selection, paste all the data (extending beyond selection)
  // If clipboard data is smaller than selection, tile/repeat to fill the selection
  // Column layout: [name, coordinates, ...displayAttributes]
  const handlePasteRange = useCallback((data: string[][], startRow: number, startCol: number, endRow: number, endCol: number) => {
    if (data.length === 0 || !data[0] || data[0].length === 0) return

    // Track changes to batch update pendingChanges
    const pasteChanges = new Map<string, AssetChanges>()

    setItems(prev => {
      const updated = new Map(prev)
      // Base columns: name (0), coordinates (1)
      // Attribute columns start at index 2
      const baseColumnCount = 2

      // Calculate the selection dimensions
      const selectionRows = endRow - startRow + 1
      const selectionCols = endCol - startCol + 1

      // Data dimensions
      const dataRows = data.length
      const dataCols = data[0].length

      // Use the larger of selection or data dimensions
      const rowsToProcess = Math.max(selectionRows, dataRows)
      const colsToProcess = Math.max(selectionCols, dataCols)

      // Total columns in grid (for bounds checking)
      const totalCols = baseColumnCount + displayAttributes.length

      // Iterate over the paste range
      for (let rowOffset = 0; rowOffset < rowsToProcess; rowOffset++) {
        const targetRow = startRow + rowOffset
        if (targetRow >= totalCount) continue

        const existingAsset = updated.get(targetRow)
        if (!existingAsset) continue

        let updatedAsset = { ...existingAsset }
        let assetChanges = pasteChanges.get(existingAsset.id) || {}

        const sourceRowIndex = rowOffset % dataRows
        const sourceRow = data[sourceRowIndex]

        for (let colOffset = 0; colOffset < colsToProcess; colOffset++) {
          const targetCol = startCol + colOffset
          if (targetCol >= totalCols) continue

          const sourceColIndex = colOffset % dataCols
          const cellValue = sourceRow[sourceColIndex] ?? ''

          // Handle name column (index 0, editable when editing is enabled)
          if (targetCol === 0 && editingEnabled) {
            updatedAsset = { ...updatedAsset, name: cellValue }
            assetChanges = { ...assetChanges, name: cellValue }
            continue
          }

          // Handle coordinates column (index 1, not editable)
          if (targetCol === 1) {
            continue
          }

          // Handle attribute columns (index 2+)
          const attrIndex = targetCol - baseColumnCount
          if (attrIndex >= 0 && attrIndex < displayAttributes.length) {
            const attribute = displayAttributes[attrIndex]
            if (!attribute) continue

            // Convert value based on attribute type (special handling for paste boolean values)
            let valueToStore: any = cellValue.trim() === '' ? null : cellValue
            if (valueToStore !== null) {
              if (attribute.attributeType === 'boolean') {
                // More flexible boolean parsing for paste
                valueToStore = cellValue.toLowerCase() === 'true' || cellValue.toLowerCase() === 'yes' || cellValue === '1'
              } else {
                valueToStore = convertValueForAttribute(cellValue, attribute.attributeType)
              }
            }

            updatedAsset = {
              ...updatedAsset,
              attributes: {
                ...updatedAsset.attributes,
                [attribute.apiKey]: valueToStore
              }
            }
            assetChanges = {
              ...assetChanges,
              attributes: {
                ...assetChanges.attributes,
                [attribute.apiKey]: valueToStore
              }
            }
          }
        }

        updated.set(targetRow, updatedAsset)
        if (assetChanges.name !== undefined || assetChanges.attributes) {
          pasteChanges.set(existingAsset.id, assetChanges)
        }
      }

      return updated
    })

    // Batch update pending changes
    if (pasteChanges.size > 0) {
      setPendingChanges(prevChanges => {
        const newChanges = new Map(prevChanges)
        pasteChanges.forEach((changes, assetId) => {
          const existing = newChanges.get(assetId) || {}
          newChanges.set(assetId, {
            ...existing,
            ...changes,
            attributes: {
              ...existing.attributes,
              ...changes.attributes
            }
          })
        })
        return newChanges
      })
    }
  }, [displayAttributes, totalCount, editingEnabled, convertValueForAttribute])

  // Save all pending changes to the server
  const saveChanges = useCallback(async () => {
    if (pendingChanges.size === 0) return

    setIsSaving(true)
    setSaveError(null)

    const errors: string[] = []
    const savePromises: Promise<void>[] = []

    pendingChanges.forEach((changes, assetId) => {
      const savePromise = (async () => {
        try {
          // Build the update payload
          const payload: { name?: string; attributes?: Record<string, any> } = {}

          if (changes.name !== undefined) {
            payload.name = changes.name
          }

          if (changes.attributes && Object.keys(changes.attributes).length > 0) {
            payload.attributes = changes.attributes
          }

          if (Object.keys(payload).length > 0) {
            // We don't need to use the response - local state already has the correct values
            // from the optimistic update when the user edited the cell
            await updateAsset(initialData.workspaceId, assetId, payload)
          }
        } catch (error) {
          errors.push(`Failed to save asset: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      })()

      savePromises.push(savePromise)
    })

    await Promise.all(savePromises)

    setIsSaving(false)

    if (errors.length > 0) {
      setSaveError(errors.join('\n'))
    } else {
      // Local state already has the correct values from optimistic updates
      // Update the last saved state ref so discard will revert to this state
      lastSavedItemsRef.current = new Map(items)
      // Clear pending changes on success
      setPendingChanges(new Map())
      setSaveSuccess(true)
      setEditingEnabled(false)
    }
  }, [pendingChanges, initialData.workspaceId, items])

  // Handle Done Editing button - save changes or show discard dialog
  const handleDoneEditing = useCallback(() => {
    if (hasUnsavedChanges) {
      saveChanges()
    } else {
      setEditingEnabled(false)
    }
  }, [hasUnsavedChanges, saveChanges])

  // Handle discarding changes
  const handleDiscardChanges = useCallback(() => {
    // Revert to the last saved state (not the original loader data)
    setItems(new Map(lastSavedItemsRef.current))
    setPendingChanges(new Map())
    setDiscardDialogOpen(false)
    setEditingEnabled(false)
  }, [])

  // Handle clicking Edit button when changes exist (to cancel)
  const handleEditToggle = useCallback(() => {
    if (editingEnabled && hasUnsavedChanges) {
      setDiscardDialogOpen(true)
    } else {
      setEditingEnabled(!editingEnabled)
    }
  }, [editingEnabled, hasUnsavedChanges])

  // Block navigation when there are unsaved changes
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      hasUnsavedChanges && currentLocation.pathname !== nextLocation.pathname
  )

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
    return ({ value, onSave, onCancel, style, selectionBorders, isReplacing }: CellEditorProps<Asset>) => {
      // Filter initial value to only valid number characters
      const filterNumber = (v: string) => v.replace(/[^0-9.\-]/g, '')
      const [editValue, setEditValue] = useState(filterNumber(value))
      const inputRef = useRef<HTMLInputElement>(null)

      useEffect(() => {
        const input = inputRef.current
        if (!input) return
        input.focus()
        // If replacing (opened via keyboard input or backspace), put cursor at end
        // Otherwise select all text
        if (isReplacing) {
          setTimeout(() => {
            if (inputRef.current) {
              const len = inputRef.current.value.length
              inputRef.current.setSelectionRange(len, len)
            }
          }, 0)
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
    const containerRef = useRef<HTMLDivElement>(null)

    // Focus container on mount
    useEffect(() => {
      containerRef.current?.focus()
    }, [])

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

    const handleBlur = (e: React.FocusEvent) => {
      // Check if focus is moving outside the container
      if (!containerRef.current?.contains(e.relatedTarget as Node)) {
        onSave(editValue !== null ? (editValue ? 'true' : 'false') : '')
      }
    }

    return (
      <Box
        ref={containerRef}
        style={style}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
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
  const LinkCellEditor = useCallback(({ value, onSave, onCancel, style, selectionBorders, isReplacing }: CellEditorProps<Asset>) => {
    // Parse incoming value - could be string URL or {url, text} object
    const parseLink = (v: string): { url: string; text: string } => {
      if (!v) return { url: '', text: '' }
      try {
        const parsed = JSON.parse(v)
        if (typeof parsed === 'object' && parsed.url !== undefined) {
          return { url: parsed.url || '', text: parsed.text || '' }
        }
      } catch {
        // Not JSON, treat as plain URL string
      }
      return { url: v, text: '' }
    }

    const initialLink = parseLink(value)
    const [urlValue, setUrlValue] = useState(initialLink.url)
    const [textValue, setTextValue] = useState(initialLink.text)
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
    const cellRef = useRef<HTMLDivElement>(null)
    const urlInputRef = useRef<HTMLInputElement>(null)
    const isReplacingRef = useRef(isReplacing)

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
          // If replacing (opened via keyboard input or backspace), put cursor at end
          // Otherwise select all text
          if (isReplacingRef.current) {
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

  // Choices cell editor - for attributes with predefined choices
  const createChoicesCellEditor = useCallback((choices: NonNullable<AssetTypeAttribute['choices']>) => {
    return ({ value, onSave, onCancel, style, selectionBorders }: CellEditorProps<Asset>) => {
      // Find the current choice by matching value
      const currentChoice = choices.find(c => String(c.value) === value || c.label === value)
      const [selectedValue, setSelectedValue] = useState(currentChoice?.value ?? '')
      const [open, setOpen] = useState(true)

      const handleChange = (newValue: any) => {
        setSelectedValue(newValue)
        // Save immediately on selection
        onSave(String(newValue))
      }

      const handleClose = () => {
        setOpen(false)
        // Save current value when closing
        onSave(String(selectedValue))
      }

      const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          onCancel()
        }
        e.stopPropagation()
      }

      return (
        <Box
          style={style}
          onKeyDown={handleKeyDown}
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
          <Select
            value={selectedValue}
            onChange={(e) => handleChange(e.target.value)}
            onClose={handleClose}
            open={open}
            variant="standard"
            fullWidth
            size="small"
            autoFocus
            MenuProps={{
              anchorOrigin: { vertical: 'bottom', horizontal: 'left' },
              transformOrigin: { vertical: 'top', horizontal: 'left' },
            }}
            sx={{
              '& .MuiSelect-select': {
                px: 1,
                py: 0.5,
                fontSize: '0.75rem',
              },
              '&::before, &::after': { display: 'none' },
            }}
          >
            {choices.map((choice) => (
              <MenuItem key={choice.id} value={choice.value}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {choice.color && (
                    <Box
                      sx={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        bgcolor: choice.color,
                        flexShrink: 0,
                      }}
                    />
                  )}
                  {choice.label}
                </Box>
              </MenuItem>
            ))}
          </Select>
        </Box>
      )
    }
  }, [])

  // Build column definitions
  const columns: ColumnDefinition<Asset>[] = useMemo(() => {
    const baseColumns: ColumnDefinition<Asset>[] = [
      {
        key: 'name',
        header: <Box sx={{ px: 2 }}>Name</Box>,
        width: 250,
        minWidth: 180,
        editable: editingEnabled,
        render: (asset) => (
          <Box sx={{ px: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Tooltip title="View on Map" arrow placement="right">
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation()
                  // Open map in new window with asset centered
                  const coords = asset.location?.coordinates
                  const basePath = window.location.pathname.replace(/\/asset-types\/.*/, '/map')
                  if (coords && coords.length >= 2) {
                    window.open(`${basePath}?lat=${coords[1]}&lng=${coords[0]}&zoom=16&assetId=${asset.id}`, '_blank')
                  } else {
                    window.open(`${basePath}?assetId=${asset.id}`, '_blank')
                  }
                }}
                sx={{
                  p: 0.5,
                  color: 'text.secondary',
                  '&:hover': { color: 'primary.main' }
                }}
              >
                <MapIcon fontSize="small" />
              </IconButton>
            </Tooltip>
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
      // If the attribute has choices, use the choices editor regardless of type
      if (attr.choices && attr.choices.length > 0) {
        return createChoicesCellEditor(attr.choices)
      }

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
  }, [displayAttributes, location.state, editingEnabled, navigate, JsonCellEditor, createNumberWithUnitEditor, BooleanCellEditor, DateCellEditor, DateTimeCellEditor, LinkCellEditor, createChoicesCellEditor])

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
        <Stack direction="row" alignItems="center" spacing={2}>
          {hasUnsavedChanges && (
            <Typography variant="body2" color="warning.main" sx={{ fontWeight: 500 }}>
              {pendingChanges.size} unsaved change{pendingChanges.size !== 1 ? 's' : ''}
            </Typography>
          )}
        </Stack>
        <Stack direction="row" alignItems="center" spacing={2}>
          {editingEnabled ? (
            <>
              <Button
                size="small"
                variant="outlined"
                color="inherit"
                onClick={handleEditToggle}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                size="small"
                variant="contained"
                color="primary"
                startIcon={isSaving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
                onClick={handleDoneEditing}
                disabled={isSaving || !hasUnsavedChanges}
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </>
          ) : (
            <Button
              size="small"
              variant="outlined"
              color="inherit"
              startIcon={<EditIcon />}
              onClick={handleEditToggle}
            >
              Edit
            </Button>
          )}
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
        </Stack>
      </Stack>
    </Box>
  )

  return (
    <>
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
          onPasteRange={editingEnabled ? handlePasteRange : undefined}
        />
      </Box>

      {/* Discard changes confirmation dialog */}
      <Dialog open={discardDialogOpen} onClose={() => setDiscardDialogOpen(false)}>
        <DialogTitle>Discard Changes?</DialogTitle>
        <DialogContent>
          <Typography>
            You have {pendingChanges.size} unsaved change{pendingChanges.size !== 1 ? 's' : ''}.
            Are you sure you want to discard them?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDiscardDialogOpen(false)}>Keep Editing</Button>
          <Button onClick={handleDiscardChanges} color="error">Discard</Button>
        </DialogActions>
      </Dialog>

      {/* Navigation blocker dialog */}
      <Dialog open={blocker.state === 'blocked'} onClose={() => blocker.reset?.()}>
        <DialogTitle>Unsaved Changes</DialogTitle>
        <DialogContent>
          <Typography>
            You have unsaved changes. Do you want to save them before leaving?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => blocker.reset?.()}>Cancel</Button>
          <Button onClick={() => { blocker.proceed?.() }} color="error">Leave Without Saving</Button>
          <Button
            onClick={async () => {
              await saveChanges()
              blocker.proceed?.()
            }}
            variant="contained"
          >
            Save and Leave
          </Button>
        </DialogActions>
      </Dialog>

      {/* Success snackbar */}
      <Snackbar
        open={saveSuccess}
        autoHideDuration={3000}
        onClose={() => setSaveSuccess(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setSaveSuccess(false)} severity="success" variant="filled">
          Changes saved successfully
        </Alert>
      </Snackbar>

      {/* Error snackbar */}
      <Snackbar
        open={!!saveError}
        autoHideDuration={6000}
        onClose={() => setSaveError(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setSaveError(null)} severity="error" variant="filled">
          {saveError}
        </Alert>
      </Snackbar>
    </>
  )
}
