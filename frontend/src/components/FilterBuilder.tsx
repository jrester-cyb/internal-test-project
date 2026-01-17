import { useEffect, useState, useCallback, useMemo, type CSSProperties } from 'react'
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
  AccordionDetails,
  Slide,
  Tooltip,
  Chip
} from '@mui/material'
import { Close as CloseIcon, FilterList as FilterListIcon, ExpandMore as ExpandMoreIcon } from '@mui/icons-material'
import { FixedSizeList as List } from 'react-window'
import { AutoSizer } from 'react-virtualized-auto-sizer'
import { ChevronRight as ChevronRightIcon } from '@mui/icons-material'
import { fetchAssetTypes, fetchAssetAttributeDefinitions, fetchAttributeValues, type AttributeValuesResponse } from '../api/assets'
import VirtualizedList from './VirtualizedList'
import CopyableText from './CopyableText'
import AttributeFilterPopover from './AttributeFilterPopover'
import AttributeValueRenderer from './AttributeValueRenderer'
import type { AssetType, AssetTypeAttribute } from '../types'

export interface AttributeFilter {
  assetTypeId: string
  attributeKey: string
  attributeName: string
  attributeType: string
  operator: string
  value: any
  unit?: string  // Unit for number attributes (query in this unit, will be converted)
  excludedValues?: any[]  // Values excluded from filter (for inverted UI)
  totalCount?: number  // Total count of values for this attribute (for showing active count)
}

interface FilterBuilderProps {
  workspaceId: string
  selectedAssetTypes: string[]
  onAssetTypesChange: (assetTypeIds: string[]) => void
  attributeFilters: AttributeFilter[]
  onAttributeFiltersChange: (filters: AttributeFilter[]) => void
  nameFilter?: string
  onNameFilterChange?: (name: string) => void
  geometryTypeFilter?: string[]
  onGeometryTypeFilterChange?: (types: string[]) => void
  open?: boolean
  onClose?: () => void
  onToggle?: () => void
}

// Available geometry types for filtering (values must match PostGIS GeometryType() output - uppercase)
const GEOMETRY_TYPES = [
  { value: 'POINT', label: 'Points' },
  { value: 'LINESTRING', label: 'Lines' },
  { value: 'POLYGON', label: 'Polygons' },
]

export default function FilterBuilder({
  workspaceId,
  selectedAssetTypes,
  onAssetTypesChange,
  attributeFilters,
  onAttributeFiltersChange,
  nameFilter = '',
  onNameFilterChange,
  geometryTypeFilter = [],
  onGeometryTypeFilterChange,
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
  // Sparse map for attribute values (index -> value)
  const [attributeValuesMap, setAttributeValuesMap] = useState<Map<number, any>>(new Map())
  const [attributeValuesTotalCount, setAttributeValuesTotalCount] = useState(0)
  const [loadingValues, setLoadingValues] = useState(false)
  const [attributeTotalCounts, setAttributeTotalCounts] = useState<Record<string, number>>({})

  // Attribute filter popover state
  const [attrFilterShowHidden, setAttrFilterShowHidden] = useState(false)
  const [attrFilterSelectedTags, setAttrFilterSelectedTags] = useState<string[]>([])
  const [attrFilterSelectedTypes, setAttrFilterSelectedTypes] = useState<string[]>([])
  const [attrFilterExcludedScopes, setAttrFilterExcludedScopes] = useState<string[]>([])

  const open = externalOpen !== undefined ? externalOpen : internalOpen
  const handleClose = externalOnClose || (() => setInternalOpen(false))

  useEffect(() => {
    if (workspaceId) {
      loadAssetTypes()
    }
  }, [workspaceId])

  useEffect(() => {
    // Load attribute definitions for the selected type for attributes panel
    if (selectedTypeForAttributes && !attributeDefinitions[selectedTypeForAttributes]) {
      loadAttributeDefinitions(selectedTypeForAttributes)
    }
  }, [selectedTypeForAttributes])

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

  async function loadAttributeValues(assetTypeId: string, attributeDefinitionId: string, apiKey: string) {
    if (!workspaceId) return
    setLoadingValues(true)
    // Reset the map when loading a new attribute
    setAttributeValuesMap(new Map())
    setAttributeValuesTotalCount(0)
    try {
      const response = await fetchAttributeValues(workspaceId, assetTypeId, attributeDefinitionId, { limit: 50, offset: 0 })
      const newMap = new Map<number, any>()
      response.results.forEach((value, index) => {
        newMap.set(index, value)
      })
      setAttributeValuesMap(newMap)
      setAttributeValuesTotalCount(response.count)
      setAttributeTotalCounts(prev => ({
        ...prev,
        [`${assetTypeId}-${apiKey}`]: response.count
      }))
    } catch (error) {
      console.error('Failed to load attribute values:', error)
      setAttributeValuesMap(new Map())
      setAttributeValuesTotalCount(0)
    } finally {
      setLoadingValues(false)
    }
  }

  // Load more attribute values for pagination
  const loadAttributeValuesRange = useCallback(async (startIndex: number, endIndex: number) => {
    if (!workspaceId || !selectedTypeForAttributes || !selectedAttribute) return

    try {
      const limit = endIndex - startIndex + 1
      const response = await fetchAttributeValues(
        workspaceId,
        selectedTypeForAttributes,
        selectedAttribute.id,
        { limit, offset: startIndex }
      )
      setAttributeValuesMap(prev => {
        const newMap = new Map(prev)
        response.results.forEach((value, index) => {
          newMap.set(startIndex + index, value)
        })
        return newMap
      })
    } catch (error) {
      console.error('Failed to load more attribute values:', error)
    }
  }, [workspaceId, selectedTypeForAttributes, selectedAttribute])

  const handleAttributeSelect = (attr: AssetTypeAttribute) => {
    setSelectedAttribute(attr)
    if (selectedTypeForAttributes) {
      loadAttributeValues(selectedTypeForAttributes, attr.id, attr.apiKey)
    }
  }

  const handleValueClick = (value: any) => {
    if (!selectedAttribute || !selectedTypeForAttributes) return

    const currentFilter = attributeFilters.find(
      f => f.assetTypeId === selectedTypeForAttributes && f.attributeKey === selectedAttribute.apiKey
    )

    if (value === "Blank") {
      value = null
      if (!currentFilter) {
        // No filter means all are included. Clicking "Blank" means exclude "Blank"
        handleAttributeFilterChange(
          selectedTypeForAttributes,
          selectedAttribute.apiKey,
          selectedAttribute.name,
          selectedAttribute.attributeType,
          'nin',
          [null],
          [null],
          attributeValuesTotalCount
        )
      } else {
        const currentExcluded = currentFilter.excludedValues || []
        const isCurrentlySelected = currentExcluded.indexOf(null) === -1
        let newExcluded
        if (isCurrentlySelected) {
          // deselect, add null to excluded
          newExcluded = [...currentExcluded, null]
        } else {
          // select, remove null from excluded
          newExcluded = currentExcluded.filter(v => v !== null)
        }
        handleAttributeFilterChange(
          selectedTypeForAttributes,
          selectedAttribute.apiKey,
          selectedAttribute.name,
          selectedAttribute.attributeType,
          'nin',
          newExcluded,
          newExcluded,
          attributeValuesTotalCount
        )
      }
    } else {
      const currentExcluded = currentFilter?.excludedValues || []
      const isCurrentlyExcluded = currentExcluded.indexOf(value) > -1
      let newExcluded
      if (isCurrentlyExcluded) {
        newExcluded = currentExcluded.filter(v => v !== value)
      } else {
        newExcluded = [...currentExcluded, value]
      }
      if (newExcluded.length === 0) {
        handleAttributeFilterChange(
          selectedTypeForAttributes,
          selectedAttribute.apiKey,
          selectedAttribute.name,
          selectedAttribute.attributeType,
          'nin',
          [],
          [],
          attributeValuesTotalCount
        )
      } else {
        handleAttributeFilterChange(
          selectedTypeForAttributes,
          selectedAttribute.apiKey,
          selectedAttribute.name,
          selectedAttribute.attributeType,
          'nin',
          newExcluded,
          newExcluded,
          attributeValuesTotalCount
        )
      }
    }
  }

  // Check if a value is included (checked) - inverted logic: checked by default
  const isValueSelected = (value: any) => {
    if (!selectedAttribute || !selectedTypeForAttributes) return true // Default to checked for all

    const currentFilter = attributeFilters.find(
      f => f.assetTypeId === selectedTypeForAttributes && f.attributeKey === selectedAttribute.apiKey
    )

    if (!currentFilter) return true // No filter = all included

    // Check if value is in excluded list
    const excluded = currentFilter.excludedValues || []
    if (value === "Blank") {
      value = null
    }
    return excluded.indexOf(value) === -1 // Selected if NOT excluded
  }

  // Get active count for an attribute (total - excluded, or total if no exclusions)
  // Returns null if we don't have the total count yet
  const getActiveCount = (assetTypeId: string, attributeKey: string): number | null => {
    const totalCount = attributeTotalCounts[`${assetTypeId}-${attributeKey}`]
    if (totalCount === undefined) return null

    const currentFilter = attributeFilters.find(
      f => f.assetTypeId === assetTypeId && f.attributeKey === attributeKey
    )
    const excludedCount = currentFilter?.excludedValues?.length || 0
    return totalCount - excludedCount
  }

  const handleToggle = (assetTypeId: string) => {
    // When selectedAssetTypes is empty, all types are shown
    // Unchecking one means we want all EXCEPT that one
    if (selectedAssetTypes.length === 0) {
      // Create array with all types except the one being unchecked
      const allExceptThis = assetTypes.filter(t => t.id !== assetTypeId).map(t => t.id)
      onAssetTypesChange(allExceptThis)
      // Remove attribute filters for the unchecked type
      onAttributeFiltersChange(attributeFilters.filter(f => f.assetTypeId !== assetTypeId))
      if (selectedTypeForAttributes === assetTypeId) {
        setSelectedTypeForAttributes(allExceptThis[0] || null)
      }
    } else {
      const currentIndex = selectedAssetTypes.indexOf(assetTypeId)
      const newSelected = [...selectedAssetTypes]

      if (currentIndex === -1) {
        // Adding this type back
        newSelected.push(assetTypeId)
        // If this makes it all types, reset to empty (show all)
        if (newSelected.length === assetTypes.length) {
          onAssetTypesChange([])
        } else {
          onAssetTypesChange(newSelected)
        }
      } else {
        // Removing this type
        newSelected.splice(currentIndex, 1)
        // Remove attribute filters for this asset type
        onAttributeFiltersChange(attributeFilters.filter(f => f.assetTypeId !== assetTypeId))
        if (selectedTypeForAttributes === assetTypeId) {
          setSelectedTypeForAttributes(newSelected[0] || null)
        }
        onAssetTypesChange(newSelected)
      }
    }
  }

  const handleTypeClick = (assetTypeId: string) => {
    setSelectedTypeForAttributes(assetTypeId)
    // Load attribute definitions if not already loaded
    if (!attributeDefinitions[assetTypeId]) {
      loadAttributeDefinitions(assetTypeId)
    }
  }

  const handleSelectAll = () => {
    // Inverted: "Select All" means show all = clear the exclusion list
    onAssetTypesChange([])
  }

  const handleClearAll = () => {
    // Clear all filters including exclusions, attribute filters, name filter, and geometry filter
    onAssetTypesChange([])
    onAttributeFiltersChange([])
    onNameFilterChange?.('')
    onGeometryTypeFilterChange?.([])
    setSelectedTypeForAttributes(null)
    setSelectedAttribute(null)
  }

  const handleAttributeFilterChange = (
    assetTypeId: string,
    attributeKey: string,
    attributeName: string,
    attributeType: string,
    operator: string,
    value: any,
    excludedValues?: any[],
    totalCount?: number
  ) => {
    const existingIndex = attributeFilters.findIndex(
      f => f.assetTypeId === assetTypeId && f.attributeKey === attributeKey
    )

    // Remove filter if no exclusions (value is empty and excludedValues is empty)
    if ((value === '' || value === null || value === undefined || (Array.isArray(value) && value.length === 0))
      && (!excludedValues || excludedValues.length === 0)) {
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
        value,
        excludedValues,
        totalCount
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
        attr.attributeType,
        operator,
        newValue
      )
    }

    const handleOperatorChange = (newOperator: string) => {
      handleAttributeFilterChange(
        assetTypeId,
        attr.apiKey,
        attr.name,
        attr.attributeType,
        newOperator,
        value
      )
    }

    switch (attr.attributeType) {
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
              slotProps={{
                input: {
                  endAdornment: attr.unit ? (
                    <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5, whiteSpace: 'nowrap' }}>
                      {attr.unit}
                    </Typography>
                  ) : undefined,
                },
              }}
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
              type={attr.attributeType === 'datetime' ? 'datetime-local' : 'date'}
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

  // Count filters: type filters (when not all selected) + attribute filters + name filter
  // When selectedAssetTypes is empty, all types are shown (no type filter active)
  // When selectedAssetTypes has items, those are the only types shown (type filter active)
  const typeFilterCount = selectedAssetTypes.length > 0 && selectedAssetTypes.length < assetTypes.length ? 1 : 0
  const geometryFilterCount = geometryTypeFilter.length > 0 ? 1 : 0
  const totalFilters = typeFilterCount + attributeFilters.length + (nameFilter.trim() ? 1 : 0) + geometryFilterCount

  // Handle geometry type filter toggle
  const handleGeometryTypeToggle = (geometryType: string) => {
    if (!onGeometryTypeFilterChange) return

    const currentIndex = geometryTypeFilter.indexOf(geometryType)
    if (currentIndex === -1) {
      // Add to filter (exclude this type)
      onGeometryTypeFilterChange([...geometryTypeFilter, geometryType])
    } else {
      // Remove from filter (include this type)
      const newFilter = [...geometryTypeFilter]
      newFilter.splice(currentIndex, 1)
      onGeometryTypeFilterChange(newFilter)
    }
  }

  const filterContent = (
    <Box sx={{ px: 3, py: 2, display: 'flex', flexDirection: 'column', height: 'calc(70vh - 36px)', minHeight: 0 }}>
      <Divider sx={{ mb: 2 }} />

      {/* Name Filter - temporarily hidden */}
      {/* <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
            Search by Name
          </Typography>
          <TextField
            fullWidth
            size="small"
            placeholder="Filter by asset name..."
            value={nameFilter}
            onChange={(e) => onNameFilterChange?.(e.target.value)}
          />
        </Box> */}

      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexShrink: 0 }}>
        <Button
          size="small"
          onClick={handleSelectAll}
          disabled={loading || selectedAssetTypes.length === 0}
        >
          Select All Types
        </Button>
        <Button
          size="small"
          onClick={handleClearAll}
          disabled={loading || totalFilters === 0}
        >
          Clear Filters
        </Button>
      </Box>

      {/* Geometry Type Filter */}
      {onGeometryTypeFilterChange && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexShrink: 0 }}>
          <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>
            Geometry:
          </Typography>
          {GEOMETRY_TYPES.map((geoType) => {
            const isIncluded = geometryTypeFilter.indexOf(geoType.value) === -1
            return (
              <Chip
                key={geoType.value}
                label={geoType.label}
                size="small"
                variant={isIncluded ? 'filled' : 'outlined'}
                color={isIncluded ? 'primary' : 'default'}
                onClick={() => handleGeometryTypeToggle(geoType.value)}
                sx={{
                  opacity: isIncluded ? 1 : 0.5,
                  cursor: 'pointer',
                }}
              />
            )
          })}
        </Box>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Box sx={{ display: 'flex', gap: 3, flex: 1, minHeight: 0 }}>
          {/* Left side: Asset Types */}
          <Box sx={{ flex: '0 0 300px', minWidth: 250, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'bold', flexShrink: 0 }}>
              Asset Types
            </Typography>
            <Box sx={{ flex: 1, minHeight: 0 }}>
              <AutoSizer
                renderProp={({ height, width }) => {
                  if (!height || !width) return null
                  return (
                    <List
                      height={height}
                      width={width}
                      itemCount={assetTypes.length}
                      itemSize={52}
                    >
                      {({ index, style }) => {
                        const assetType = assetTypes[index]
                        const isIncluded = selectedAssetTypes.length === 0 || selectedAssetTypes.indexOf(assetType.id) > -1
                        const isActive = selectedTypeForAttributes === assetType.id

                        return (
                          <div style={style}>
                            <Box
                              onClick={() => handleTypeClick(assetType.id)}
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1,
                                px: 1,
                                py: 0.5,
                                borderRadius: 1,
                                bgcolor: isActive ? 'action.selected' : 'transparent',
                                opacity: isIncluded ? 1 : 0.5,
                                cursor: 'pointer',
                                '&:hover': {
                                  bgcolor: isActive ? 'action.selected' : 'action.hover'
                                }
                              }}
                            >
                              <Checkbox
                                checked={isIncluded}
                                onChange={(e) => {
                                  e.stopPropagation()
                                  handleToggle(assetType.id)
                                }}
                                size="small"
                                sx={{ p: 0, flexShrink: 0 }}
                              />
                              <Box sx={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
                                <CopyableText variant="body2" sx={{ fontWeight: isActive ? 'bold' : 'normal' }}>
                                  {assetType.name}
                                </CopyableText>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }} noWrap>
                                  {assetType.description || 'No description'}
                                </Typography>
                              </Box>
                              <ChevronRightIcon sx={{ color: 'text.secondary', flexShrink: 0 }} />
                            </Box>
                          </div>
                        )
                      }}
                    </List>
                  )
                }}
              />
            </Box>
          </Box>

          {/* Middle: Attribute selection - always shown */}
          <Divider orientation="vertical" flexItem />
          <Box sx={{ flex: '0 0 300px', minWidth: 250, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexShrink: 0 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                Attributes
              </Typography>
              {selectedTypeForAttributes && (
                (() => {
                  const allAttrs = attributeDefinitions[selectedTypeForAttributes] || []
                  const hiddenCount = allAttrs.filter(a => a.isHidden).length
                  const availableTags = [...new Set(allAttrs.flatMap(a => a.tags || []))]
                  return (
                    <AttributeFilterPopover
                      showHidden={attrFilterShowHidden}
                      onShowHiddenChange={setAttrFilterShowHidden}
                      selectedTags={attrFilterSelectedTags}
                      onSelectedTagsChange={setAttrFilterSelectedTags}
                      selectedTypes={attrFilterSelectedTypes}
                      onSelectedTypesChange={setAttrFilterSelectedTypes}
                      excludedScopes={attrFilterExcludedScopes}
                      onExcludedScopesChange={setAttrFilterExcludedScopes}
                      showScopeFilter
                      hiddenCount={hiddenCount}
                      availableTags={availableTags}
                      showTypeFilter
                    />
                  )
                })()
              )}
            </Box>
            {selectedTypeForAttributes ? (
              (() => {
                const allAttrs = attributeDefinitions[selectedTypeForAttributes] || []
                // Filter attributes based on popover settings
                const attrs = allAttrs.filter(attr => {
                  // Hide hidden attributes unless showHidden is true
                  if (attr.isHidden && !attrFilterShowHidden) return false
                  // Filter by selected types
                  if (attrFilterSelectedTypes.length > 0 && !attrFilterSelectedTypes.includes(attr.attributeType)) return false
                  // Filter by selected tags
                  if (attrFilterSelectedTags.length > 0) {
                    const attrTags = attr.tags || []
                    if (!attrFilterSelectedTags.some(tag => attrTags.includes(tag))) return false
                  }
                  // Filter by excluded scopes
                  if (attrFilterExcludedScopes.length > 0 && attr.scope && attrFilterExcludedScopes.includes(attr.scope)) return false
                  return true
                })
                if (allAttrs.length === 0) {
                  return (
                    <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                      No attributes defined
                    </Typography>
                  )
                }
                if (attrs.length === 0) {
                  return (
                    <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                      No attributes match filters
                    </Typography>
                  )
                }
                return (
                  <Box sx={{ flex: 1, minHeight: 0 }}>
                    <AutoSizer
                      renderProp={({ height, width }) => {
                        if (!height || !width) return null
                        return (
                          <List
                            height={height}
                            width={width}
                            itemCount={attrs.length}
                            itemSize={52}
                          >
                            {({ index, style }) => {
                              const attr = attrs[index]
                              const isSelected = selectedAttribute?.id === attr.id
                              const activeCount = selectedTypeForAttributes
                                ? getActiveCount(selectedTypeForAttributes, attr.apiKey)
                                : null

                              return (
                                <div style={style}>
                                  <Box
                                    onClick={() => handleAttributeSelect(attr)}
                                    sx={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 1,
                                      px: 1,
                                      py: 0.5,
                                      borderRadius: 1,
                                      bgcolor: isSelected ? 'action.selected' : 'transparent',
                                      cursor: 'pointer',
                                      '&:hover': {
                                        bgcolor: isSelected ? 'action.selected' : 'action.hover'
                                      }
                                    }}
                                  >
                                    <Box sx={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
                                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <CopyableText variant="body2" sx={{ fontWeight: isSelected ? 'bold' : 'normal' }}>
                                          {attr.name}
                                        </CopyableText>
                                        {activeCount !== null && (
                                          <Chip
                                            label={activeCount}
                                            size="small"
                                            color="primary"
                                            sx={{ height: 18, fontSize: '0.7rem', '& .MuiChip-label': { px: 0.75 } }}
                                          />
                                        )}
                                      </Box>
                                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }} noWrap>
                                        {attr.description || 'No description'}
                                      </Typography>
                                    </Box>
                                    <ChevronRightIcon sx={{ color: 'text.secondary', flexShrink: 0 }} />
                                  </Box>
                                </div>
                              )
                            }}
                          </List>
                        )
                      }}
                    />
                  </Box>
                )
              })()
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                Select an asset type to view attributes
              </Typography>
            )}
          </Box>

          {/* Right side: Existing values for selected attribute - always shown */}
          <Divider orientation="vertical" flexItem />
          <Box sx={{ flex: 1, minWidth: 350, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'bold', flexShrink: 0 }}>
              Values{selectedAttribute ? `: ${selectedAttribute.name}` : ''}
            </Typography>
            {selectedAttribute && selectedTypeForAttributes ? (
              <>
                {selectedAttribute.description && (
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block', flexShrink: 0 }}>
                    {selectedAttribute.description}
                  </Typography>
                )}
                <VirtualizedList
                  items={attributeValuesMap}
                  totalCount={attributeValuesTotalCount}
                  getItemKey={(value, index) => `value-${index}-${String(value)}`}
                  onLoadRange={loadAttributeValuesRange}
                  isLoading={loadingValues}
                  estimatedItemHeight={36}
                  emptyMessage="No values found"
                  renderItem={(value, index, style) => {
                    const isSelected = isValueSelected(value)
                    return (
                      <Box
                        onClick={() => handleValueClick(value)}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          px: 1,
                          py: 0.5,
                          borderRadius: 1,
                          cursor: 'pointer',
                          '&:hover': {
                            bgcolor: 'action.hover'
                          }
                        }}
                      >
                        <Checkbox
                          checked={isSelected}
                          size="small"
                          sx={{ p: 0, flexShrink: 0 }}
                          onChange={() => handleValueClick(value)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <Box sx={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
                          <AttributeValueRenderer
                            attribute={selectedAttribute}
                            value={value}
                            compact
                            maxLines={1}
                            showCopyButton={false}
                            showUnit={false}
                          />
                        </Box>
                      </Box>
                    )
                  }}
                />
              </>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                Select an attribute to view values
              </Typography>
            )}
          </Box>
        </Box>
      )}
    </Box>
  )

  // Calculate the height of the filter content for the slide offset
  // The drawer slides from above the viewport, so we position it off-screen initially
  return (
    <Box
      sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          transform: open ? 'translateY(0)' : 'translateY(calc(-100% + 36px))',
          transition: 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Filter content */}
        <Box
          sx={{
            pointerEvents: open ? 'auto' : 'none',
            bgcolor: 'background.paper',
            boxShadow: 3,
            maxHeight: 'calc(50vh - 48px)',
            overflowY: 'auto',
            pb: 0.5,
          }}
        >
          {filterContent}
        </Box>

        {/* Toggle button - moves with content */}
        <Button
          onClick={onToggle || (() => setInternalOpen(!internalOpen))}
          variant="contained"
          startIcon={<FilterListIcon />}
          fullWidth
          sx={{
            pointerEvents: 'auto',
            borderRadius: 0,
            py: 0.75,
            justifyContent: 'center',
            boxShadow: 1,
          }}
        >
          Filters {totalFilters > 0 && `(${totalFilters})`}
        </Button>
      </Box>
    </Box>
  )
}
