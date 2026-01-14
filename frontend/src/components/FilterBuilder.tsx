import { useEffect, useState } from 'react'
import {
  Drawer,
  Box,
  Typography,
  FormGroup,
  FormControlLabel,
  Checkbox,
  IconButton,
  Divider,
  Button,
  CircularProgress,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from '@mui/material'
import { Close as CloseIcon, FilterList as FilterListIcon, ExpandMore as ExpandMoreIcon } from '@mui/icons-material'
import { fetchAssetTypes, fetchAssetAttributeDefinitions, fetchAttributeValues } from '../api/assets'
import type { AssetType, AssetTypeAttribute } from '../types'

export interface AttributeFilter {
  assetTypeId: string
  attributeKey: string
  attributeName: string
  attributeType: string
  operator: string
  value: any
}

interface FilterBuilderProps {
  workspaceId: string
  selectedAssetTypes: string[]
  onAssetTypesChange: (assetTypeIds: string[]) => void
  attributeFilters: AttributeFilter[]
  onAttributeFiltersChange: (filters: AttributeFilter[]) => void
  nameFilter?: string
  onNameFilterChange?: (name: string) => void
  open?: boolean
  onClose?: () => void
  onToggle?: () => void
}

export default function FilterBuilder({
  workspaceId,
  selectedAssetTypes,
  onAssetTypesChange,
  attributeFilters,
  onAttributeFiltersChange,
  nameFilter = '',
  onNameFilterChange,
  open: externalOpen,
  onClose: externalOnClose,
  onToggle
}: FilterBuilderProps) {
  const [assetTypes, setAssetTypes] = useState<AssetType[]>([])
  const [attributeDefinitions, setAttributeDefinitions] = useState<Record<string, AssetTypeAttribute[]>>({})
  const [loading, setLoading] = useState(true)
  const [internalOpen, setInternalOpen] = useState(false)
  const [selectedTypeForAttributes, setSelectedTypeForAttributes] = useState<string | null>(null)
  const [selectedAttribute, setSelectedAttribute] = useState<AssetTypeAttribute | null>(null)
  const [attributeValues, setAttributeValues] = useState<any[]>([])
  const [loadingValues, setLoadingValues] = useState(false)

  const open = externalOpen !== undefined ? externalOpen : internalOpen
  const handleClose = externalOnClose || (() => setInternalOpen(false))

  useEffect(() => {
    if (workspaceId) {
      loadAssetTypes()
    }
  }, [workspaceId])

  useEffect(() => {
    // Load attribute definitions for selected asset types
    selectedAssetTypes.forEach(typeId => {
      if (!attributeDefinitions[typeId]) {
        loadAttributeDefinitions(typeId)
      }
    })
  }, [selectedAssetTypes])

  async function loadAssetTypes() {
    if (!workspaceId) return
    try {
      const types = await fetchAssetTypes(workspaceId)
      setAssetTypes(Array.isArray(types) ? types : types.results || [])
    } catch (error) {
      console.error('Failed to load asset types:', error)
      setAssetTypes([])
    } finally {
      setLoading(false)
    }
  }

  async function loadAttributeDefinitions(assetTypeId: string) {
    if (!workspaceId) return
    try {
      const defs = await fetchAssetAttributeDefinitions(workspaceId, assetTypeId, 1, 1000)
      const attributes = Array.isArray(defs) ? defs : defs.results || []
      setAttributeDefinitions(prev => ({
        ...prev,
        [assetTypeId]: attributes
      }))
    } catch (error) {
      console.error('Failed to load attribute definitions:', error)
    }
  }

  async function loadAttributeValues(assetTypeId: string, attributeDefinitionId: string) {
    if (!workspaceId) return
    setLoadingValues(true)
    try {
      const values = await fetchAttributeValues(workspaceId, assetTypeId, attributeDefinitionId)
      setAttributeValues(values)
    } catch (error) {
      console.error('Failed to load attribute values:', error)
      setAttributeValues([])
    } finally {
      setLoadingValues(false)
    }
  }

  const handleAttributeSelect = (attr: AssetTypeAttribute) => {
    setSelectedAttribute(attr)
    if (selectedTypeForAttributes) {
      loadAttributeValues(selectedTypeForAttributes, attr.id)
    }
  }

  const handleValueClick = (value: any) => {
    if (selectedAttribute && selectedTypeForAttributes) {
      const currentFilter = attributeFilters.find(
        f => f.assetTypeId === selectedTypeForAttributes && f.attributeKey === selectedAttribute.apiKey
      )

      let newValue: any

      if (currentFilter) {
        // Check if current value is an array (multiple values selected)
        if (Array.isArray(currentFilter.value)) {
          const valueIndex = currentFilter.value.indexOf(value)
          if (valueIndex > -1) {
            // Remove value
            const newArray = [...currentFilter.value]
            newArray.splice(valueIndex, 1)
            newValue = newArray.length === 1 ? newArray[0] : newArray.length === 0 ? '' : newArray
          } else {
            // Add value
            newValue = [...currentFilter.value, value]
          }
        } else {
          // Convert to array if clicking a different value
          if (currentFilter.value === value) {
            newValue = '' // Deselect
          } else {
            newValue = [currentFilter.value, value]
          }
        }
      } else {
        newValue = value
      }

      const operator = Array.isArray(newValue) && newValue.length > 1 ? 'in' : 'exact'

      handleAttributeFilterChange(
        selectedTypeForAttributes,
        selectedAttribute.apiKey,
        selectedAttribute.name,
        selectedAttribute.attribute_type,
        operator,
        newValue
      )
    }
  }

  const isValueSelected = (value: any) => {
    if (!selectedAttribute || !selectedTypeForAttributes) return false

    const currentFilter = attributeFilters.find(
      f => f.assetTypeId === selectedTypeForAttributes && f.attributeKey === selectedAttribute.apiKey
    )

    if (!currentFilter) return false

    if (Array.isArray(currentFilter.value)) {
      return currentFilter.value.indexOf(value) > -1
    }

    return currentFilter.value === value
  }

  const handleToggle = (assetTypeId: string) => {
    const currentIndex = selectedAssetTypes.indexOf(assetTypeId)
    const newSelected = [...selectedAssetTypes]

    if (currentIndex === -1) {
      newSelected.push(assetTypeId)
      setSelectedTypeForAttributes(assetTypeId)
    } else {
      newSelected.splice(currentIndex, 1)
      // Remove attribute filters for this asset type
      onAttributeFiltersChange(attributeFilters.filter(f => f.assetTypeId !== assetTypeId))
      if (selectedTypeForAttributes === assetTypeId) {
        setSelectedTypeForAttributes(newSelected[0] || null)
      }
    }

    onAssetTypesChange(newSelected)
  }

  const handleTypeClick = (assetTypeId: string) => {
    setSelectedTypeForAttributes(assetTypeId)
  }

  const handleSelectAll = () => {
    onAssetTypesChange(assetTypes.map(type => type.id))
  }

  const handleClearAll = () => {
    onAssetTypesChange([])
    onAttributeFiltersChange([])
  }

  const handleAttributeFilterChange = (
    assetTypeId: string,
    attributeKey: string,
    attributeName: string,
    attributeType: string,
    operator: string,
    value: any
  ) => {
    const existingIndex = attributeFilters.findIndex(
      f => f.assetTypeId === assetTypeId && f.attributeKey === attributeKey
    )

    if (value === '' || value === null || value === undefined) {
      // Remove filter if value is empty
      if (existingIndex > -1) {
        const newFilters = [...attributeFilters]
        newFilters.splice(existingIndex, 1)
        onAttributeFiltersChange(newFilters)
      }
    } else {
      // Add or update filter
      const newFilter: AttributeFilter = {
        assetTypeId,
        attributeKey,
        attributeName,
        attributeType,
        operator,
        value
      }

      if (existingIndex > -1) {
        const newFilters = [...attributeFilters]
        newFilters[existingIndex] = newFilter
        onAttributeFiltersChange(newFilters)
      } else {
        onAttributeFiltersChange([...attributeFilters, newFilter])
      }
    }
  }

  const getAttributeFilterValue = (assetTypeId: string, attributeKey: string) => {
    const filter = attributeFilters.find(
      f => f.assetTypeId === assetTypeId && f.attributeKey === attributeKey
    )
    return filter?.value ?? ''
  }

  const getAttributeFilterOperator = (assetTypeId: string, attributeKey: string) => {
    const filter = attributeFilters.find(
      f => f.assetTypeId === assetTypeId && f.attributeKey === attributeKey
    )
    return filter?.operator ?? 'exact'
  }

  const renderAttributeInput = (
    assetTypeId: string,
    attr: AssetTypeAttribute
  ) => {
    const value = getAttributeFilterValue(assetTypeId, attr.apiKey)
    const operator = getAttributeFilterOperator(assetTypeId, attr.apiKey)

    const handleValueChange = (newValue: any) => {
      handleAttributeFilterChange(
        assetTypeId,
        attr.apiKey,
        attr.name,
        attr.attribute_type,
        operator,
        newValue
      )
    }

    const handleOperatorChange = (newOperator: string) => {
      handleAttributeFilterChange(
        assetTypeId,
        attr.apiKey,
        attr.name,
        attr.attribute_type,
        newOperator,
        value
      )
    }

    switch (attr.attribute_type) {
      case 'boolean':
        return (
          <FormControl fullWidth size="small">
            <Select
              value={value === '' ? '' : String(value)}
              onChange={(e) => handleValueChange(e.target.value === '' ? '' : e.target.value === 'true')}
              displayEmpty
            >
              <MenuItem value="">Any</MenuItem>
              <MenuItem value="true">True</MenuItem>
              <MenuItem value="false">False</MenuItem>
            </Select>
          </FormControl>
        )

      case 'number':
        return (
          <Box sx={{ display: 'flex', gap: 1 }}>
            <FormControl size="small" sx={{ minWidth: 100 }}>
              <Select
                value={operator}
                onChange={(e) => handleOperatorChange(e.target.value)}
              >
                <MenuItem value="exact">Equals</MenuItem>
                <MenuItem value="gt">Greater than</MenuItem>
                <MenuItem value="gte">Greater or equal</MenuItem>
                <MenuItem value="lt">Less than</MenuItem>
                <MenuItem value="lte">Less or equal</MenuItem>
              </Select>
            </FormControl>
            <TextField
              fullWidth
              size="small"
              type="number"
              value={value}
              onChange={(e) => handleValueChange(e.target.value ? Number(e.target.value) : '')}
              placeholder="Enter value"
            />
          </Box>
        )

      case 'text':
        return (
          <Box sx={{ display: 'flex', gap: 1 }}>
            <FormControl size="small" sx={{ minWidth: 100 }}>
              <Select
                value={operator}
                onChange={(e) => handleOperatorChange(e.target.value)}
              >
                <MenuItem value="exact">Exact</MenuItem>
                <MenuItem value="icontains">Contains</MenuItem>
                <MenuItem value="istartswith">Starts with</MenuItem>
                <MenuItem value="iendswith">Ends with</MenuItem>
              </Select>
            </FormControl>
            <TextField
              fullWidth
              size="small"
              value={value}
              onChange={(e) => handleValueChange(e.target.value)}
              placeholder="Enter value"
            />
          </Box>
        )

      case 'link':
        return (
          <Box sx={{ display: 'flex', gap: 1 }}>
            <FormControl size="small" sx={{ minWidth: 100 }}>
              <Select
                value={operator}
                onChange={(e) => handleOperatorChange(e.target.value)}
              >
                <MenuItem value="exact">Exact</MenuItem>
                <MenuItem value="icontains">Contains</MenuItem>
                <MenuItem value="istartswith">Starts with</MenuItem>
                <MenuItem value="iendswith">Ends with</MenuItem>
              </Select>
            </FormControl>
            <TextField
              fullWidth
              size="small"
              type="url"
              value={value}
              onChange={(e) => handleValueChange(e.target.value)}
              placeholder="Enter URL"
            />
          </Box>
        )

      case 'date':
      case 'datetime':
        return (
          <Box sx={{ display: 'flex', gap: 1 }}>
            <FormControl size="small" sx={{ minWidth: 100 }}>
              <Select
                value={operator}
                onChange={(e) => handleOperatorChange(e.target.value)}
              >
                <MenuItem value="exact">On</MenuItem>
                <MenuItem value="gt">After</MenuItem>
                <MenuItem value="gte">On or after</MenuItem>
                <MenuItem value="lt">Before</MenuItem>
                <MenuItem value="lte">On or before</MenuItem>
              </Select>
            </FormControl>
            <TextField
              fullWidth
              size="small"
              type={attr.attribute_type === 'datetime' ? 'datetime-local' : 'date'}
              value={value}
              onChange={(e) => handleValueChange(e.target.value)}
            />
          </Box>
        )

      default:
        return (
          <TextField
            fullWidth
            size="small"
            value={value}
            onChange={(e) => handleValueChange(e.target.value)}
            placeholder="Enter value"
          />
        )
    }
  }

  const totalFilters = selectedAssetTypes.length + attributeFilters.length

  return (
    <Box
      sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        transition: 'transform 0.3s ease-in-out',
        transform: open ? 'translateY(0)' : 'translateY(calc(-100% + 32px))',
        bgcolor: 'rgba(0, 0, 0, 0.6)',
        color: '#ffffff',
        borderBottomLeftRadius: '4px',
        borderBottomRightRadius: '4px',
        boxShadow: 3,
        maxHeight: '50vh',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <Box sx={{ px: 3, pt: 2, pb: 3, mb: 2, overflowY: 'auto', flexGrow: 1 }}>
        <Box sx={{ mb: 1 }}>
          <Typography variant="h6">Filters</Typography>
        </Box>

        <Divider sx={{ mb: 2 }} />

        {/* Name Filter */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
            Search by Name
          </Typography>
          <TextField
            fullWidth
            size="small"
            placeholder="Filter by asset name..."
            value={nameFilter}
            onChange={(e) => onNameFilterChange?.(e.target.value)}
            sx={{
              '& .MuiOutlinedInput-root': {
                bgcolor: 'rgba(255, 255, 255, 0.1)',
                '& fieldset': {
                  borderColor: 'rgba(255, 255, 255, 0.3)',
                },
                '&:hover fieldset': {
                  borderColor: 'rgba(255, 255, 255, 0.5)',
                },
                '&.Mui-focused fieldset': {
                  borderColor: 'primary.main',
                },
              },
              '& .MuiOutlinedInput-input': {
                color: 'white',
                '&::placeholder': {
                  color: 'rgba(255, 255, 255, 0.7)',
                  opacity: 1,
                },
              },
            }}
          />
        </Box>

        <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
          <Button
            size="small"
            onClick={handleSelectAll}
            disabled={loading}
          >
            Select All Types
          </Button>
          <Button
            size="small"
            onClick={handleClearAll}
            disabled={loading}
          >
            Clear All
          </Button>
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Box sx={{ display: 'flex', gap: 3 }}>
            {/* Left side: Asset Types */}
            <Box sx={{ flex: '0 0 300px', minWidth: 250 }}>
              <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'bold' }}>
                Asset Types
              </Typography>
              <Box sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: 1
              }}>
                {assetTypes.map((assetType) => {
                  const isSelected = selectedAssetTypes.indexOf(assetType.id) > -1
                  const isActive = selectedTypeForAttributes === assetType.id

                  return (
                    <Box
                      key={assetType.id}
                      onClick={() => {
                        if (!isSelected) {
                          handleToggle(assetType.id)
                        } else {
                          handleTypeClick(assetType.id)
                        }
                      }}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        px: 2,
                        py: 1,
                        borderRadius: 1,
                        border: 2,
                        borderColor: isActive ? 'primary.main' : isSelected ? 'primary.light' : 'grey.300',
                        bgcolor: isActive ? 'primary.light' : isSelected ? 'primary.50' : 'transparent',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        '&:hover': {
                          borderColor: 'primary.main',
                          bgcolor: isActive ? 'primary.light' : 'primary.50'
                        }
                      }}
                    >
                      <Checkbox
                        checked={isSelected}
                        onChange={(e) => {
                          e.stopPropagation()
                          handleToggle(assetType.id)
                        }}
                        size="small"
                        sx={{ p: 0 }}
                      />
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: isActive ? 'bold' : 'normal' }}>
                          {assetType.name}
                        </Typography>
                        {assetType.description && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            {assetType.description}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  )
                })}
              </Box>
            </Box>

            {/* Middle: Attribute selection */}
            {selectedTypeForAttributes && selectedAssetTypes.indexOf(selectedTypeForAttributes) > -1 && (
              <>
                <Divider orientation="vertical" flexItem />
                <Box sx={{ flex: '0 0 300px', minWidth: 250 }}>
                  <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'bold' }}>
                    Attributes
                  </Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {(attributeDefinitions[selectedTypeForAttributes] || []).map(attr => (
                      <Box
                        key={attr.id}
                        onClick={() => handleAttributeSelect(attr)}
                        sx={{
                          px: 2,
                          py: 1,
                          borderRadius: 1,
                          border: 1,
                          borderColor: selectedAttribute?.id === attr.id ? 'primary.main' : 'grey.300',
                          bgcolor: selectedAttribute?.id === attr.id ? 'primary.50' : 'transparent',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          '&:hover': {
                            borderColor: 'primary.main',
                            bgcolor: 'primary.50'
                          }
                        }}
                      >
                        <Typography variant="body2" sx={{ fontWeight: selectedAttribute?.id === attr.id ? 'bold' : 'normal' }}>
                          {attr.name}
                        </Typography>
                        {attr.description && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            {attr.description}
                          </Typography>
                        )}
                      </Box>
                    ))}
                  </Box>
                </Box>
              </>
            )}

            {/* Right side: Existing values for selected attribute */}
            {selectedAttribute && selectedTypeForAttributes && selectedAssetTypes.indexOf(selectedTypeForAttributes) > -1 && (
              <>
                <Divider orientation="vertical" flexItem />
                <Box sx={{ flex: 1, minWidth: 350 }}>
                  <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'bold' }}>
                    Values: {selectedAttribute.name}
                  </Typography>
                  {selectedAttribute.description && (
                    <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
                      {selectedAttribute.description}
                    </Typography>
                  )}
                  {loadingValues ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                      <CircularProgress size={20} />
                    </Box>
                  ) : (
                    <Box sx={{
                      maxHeight: 400,
                      overflowY: 'auto',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 0.5
                    }}>
                      {attributeValues.length === 0 ? (
                        <Typography variant="caption" color="text.secondary">
                          No values found
                        </Typography>
                      ) : (
                        attributeValues.map((value, idx) => {
                          const isSelected = isValueSelected(value)
                          return (
                            <Box
                              key={idx}
                              onClick={() => handleValueClick(value)}
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1,
                                px: 1.5,
                                py: 0.75,
                                borderRadius: 0.5,
                                border: 1,
                                borderColor: isSelected ? 'primary.main' : 'grey.300',
                                bgcolor: isSelected ? 'primary.50' : 'transparent',
                                cursor: 'pointer',
                                fontSize: '0.875rem',
                                transition: 'all 0.2s',
                                '&:hover': {
                                  borderColor: 'primary.main',
                                  bgcolor: 'primary.50'
                                }
                              }}
                            >
                              <Checkbox
                                checked={isSelected}
                                size="small"
                                sx={{ p: 0 }}
                                onChange={() => handleValueClick(value)}
                                onClick={(e) => e.stopPropagation()}
                              />
                              <Typography variant="body2">{String(value)}</Typography>
                            </Box>
                          )
                        })
                      )}
                    </Box>
                  )}
                </Box>
              </>
            )}
          </Box>
        )}
      </Box>

      <Button
        onClick={onToggle || (() => setInternalOpen(!internalOpen))}
        variant="contained"
        startIcon={
          <FilterListIcon
            sx={{
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          />
        }
        fullWidth
        sx={{
          borderRadius: 0,
          py: 0.5,
          boxShadow: 'none',
          backgroundColor: '#666464',
          color: '#ffffff',
          '&:hover': {
            backgroundColor: '#898989',
          }
        }}
      >
        Filters {totalFilters > 0 && `(${totalFilters})`}
      </Button>
    </Box>
  )
}
