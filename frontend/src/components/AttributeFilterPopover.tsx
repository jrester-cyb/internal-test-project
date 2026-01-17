import { useState, useEffect, useRef, useCallback } from 'react'
import { Box, Typography, Chip, IconButton, Popover, Switch, FormControlLabel, Autocomplete, TextField, Tooltip, Stack, CircularProgress, Badge } from '@mui/material'
import { FilterList as FilterIcon } from '@mui/icons-material'
import { fetchAttributeTypes } from '../api/assets'

export interface AttributeFilterOptions {
  showHidden: boolean
  selectedTags: string[]
  excludedScopes?: string[]
}

interface AttributeFilterPopoverProps {
  // Filter state
  showHidden: boolean
  onShowHiddenChange: (value: boolean) => void
  selectedTags: string[]
  onSelectedTagsChange: (tags: string[]) => void
  selectedTypes?: string[]
  onSelectedTypesChange?: (types: string[]) => void
  // Optional scope filtering
  excludedScopes?: string[]
  onExcludedScopesChange?: (scopes: string[]) => void
  showScopeFilter?: boolean
  // Global values only toggle
  globalValuesOnly?: boolean
  onGlobalValuesOnlyChange?: (value: boolean) => void
  // Data
  hiddenCount: number
  availableTags: string[]
  // Whether to show type filter (will fetch types when opened)
  showTypeFilter?: boolean
  // Optional loading state
  isLoading?: boolean
  // Number of hidden attributes that have active filters (shown as badge when showHidden is false)
  hiddenWithFiltersCount?: number
}

export default function AttributeFilterPopover({
  showHidden,
  onShowHiddenChange,
  selectedTags,
  onSelectedTagsChange,
  selectedTypes = [],
  onSelectedTypesChange,
  excludedScopes = [],
  onExcludedScopesChange,
  showScopeFilter = false,
  globalValuesOnly = false,
  onGlobalValuesOnlyChange,
  hiddenCount,
  availableTags,
  showTypeFilter = false,
  isLoading = false,
  hiddenWithFiltersCount = 0,
}: AttributeFilterPopoverProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const [availableTypes, setAvailableTypes] = useState<{ value: string; label: string }[]>([])
  const [isLoadingTypes, setIsLoadingTypes] = useState(false)
  const typesFetchedRef = useRef(false)

  const hasActiveFilters = showHidden || selectedTags.length > 0 || selectedTypes.length > 0 || excludedScopes.length > 0 || globalValuesOnly

  // Fetch types when popover opens (only once)
  const loadTypes = useCallback(async () => {
    if (typesFetchedRef.current || !showTypeFilter || !onSelectedTypesChange) return

    setIsLoadingTypes(true)
    try {
      const types = await fetchAttributeTypes()
      setAvailableTypes(types)
      typesFetchedRef.current = true
    } catch (error) {
      console.error('Failed to fetch attribute types:', error)
    } finally {
      setIsLoadingTypes(false)
    }
  }, [showTypeFilter, onSelectedTypesChange])

  useEffect(() => {
    if (anchorEl && !typesFetchedRef.current) {
      loadTypes()
    }
  }, [anchorEl, loadTypes])

  const handleScopeToggle = (scope: string) => {
    if (!onExcludedScopesChange) return
    if (excludedScopes.includes(scope)) {
      onExcludedScopesChange(excludedScopes.filter(s => s !== scope))
    } else {
      onExcludedScopesChange([...excludedScopes, scope])
    }
  }

  const hasOptions = hiddenCount > 0 || availableTags.length > 0 || showTypeFilter || showScopeFilter

  // Helper to get label for a type value
  const getTypeLabel = (value: string) => {
    const type = availableTypes.find(t => t.value === value)
    return type?.label ?? value
  }

  // Show badge when hidden attributes have filters and we're not showing hidden
  const showBadge = !showHidden && hiddenWithFiltersCount > 0

  return (
    <>
      <Tooltip
        title={showBadge
          ? `${hiddenWithFiltersCount} hidden attribute${hiddenWithFiltersCount > 1 ? 's have' : ' has'} filters`
          : hasActiveFilters ? "Filters applied" : "Filter"
        }
        arrow
        placement="top"
      >
        <IconButton
          size="small"
          onClick={(e) => setAnchorEl(e.currentTarget)}
          sx={{
            color: hasActiveFilters
              ? (theme => theme.palette.mode === 'light' ? 'primary.main' : 'secondary.main')
              : 'text.secondary',
          }}
        >
          <Badge
            badgeContent={showBadge ? hiddenWithFiltersCount : 0}
            color="warning"
            sx={{
              '& .MuiBadge-badge': {
                fontSize: '0.65rem',
                height: 16,
                minWidth: 16,
              }
            }}
          >
            <FilterIcon />
          </Badge>
        </IconButton>
      </Tooltip>
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ p: 2, minWidth: 280, maxWidth: 320 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
            <Typography variant="subtitle2">Filter Options</Typography>
            {(isLoading || isLoadingTypes) && <CircularProgress size={14} />}
          </Stack>

          {onGlobalValuesOnlyChange && (
            <FormControlLabel
              control={
                <Switch
                  checked={globalValuesOnly}
                  onChange={() => onGlobalValuesOnlyChange(!globalValuesOnly)}
                  size="small"
                  color="success"
                />
              }
              label="Show global asset"
              sx={{ mb: 1.5, display: 'block' }}
            />
          )}

          {hiddenCount > 0 && (
            <FormControlLabel
              control={
                <Switch
                  checked={showHidden}
                  onChange={() => onShowHiddenChange(!showHidden)}
                  size="small"
                />
              }
              label={`Include hidden attributes (${hiddenCount})`}
              sx={{ mb: 1.5, display: 'block' }}
            />
          )}

          {showScopeFilter && onExcludedScopesChange && (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>Scope</Typography>
              <Stack direction="row" spacing={0.5} sx={{ mb: 1.5, flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
                {[
                  { value: 'global', label: 'Global', color: 'success' as const },
                  { value: 'override', label: 'Override', color: 'warning' as const },
                  { value: 'local', label: 'Local', color: 'info' as const },
                ].map(scope => {
                  const isExcluded = excludedScopes.includes(scope.value)
                  return (
                    <Chip
                      key={scope.value}
                      label={scope.label}
                      size="small"
                      color={isExcluded ? 'default' : scope.color}
                      variant={isExcluded ? 'outlined' : 'filled'}
                      onClick={() => handleScopeToggle(scope.value)}
                      sx={{ cursor: 'pointer' }}
                    />
                  )
                })}
              </Stack>
            </>
          )}

          {showTypeFilter && onSelectedTypesChange && (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>Type</Typography>
              <Autocomplete
                multiple
                size="small"
                options={availableTypes.map(t => t.value)}
                getOptionLabel={(option) => getTypeLabel(option)}
                value={selectedTypes}
                loading={isLoadingTypes}
                onChange={(_, newValue) => onSelectedTypesChange(newValue)}
                renderInput={(params) => (
                  <TextField {...params} placeholder={selectedTypes.length === 0 ? "Select types..." : ""} />
                )}
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => (
                    <Chip {...getTagProps({ index })} label={getTypeLabel(option)} size="small" key={option} />
                  ))
                }
                slotProps={{
                  popper: {
                    sx: { zIndex: 1500 }
                  }
                }}
              />
            </>
          )}

          {availableTags.length > 0 && (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5, mt: 1.5 }}>Tags</Typography>
              <Autocomplete
                multiple
                size="small"
                options={availableTags}
                value={selectedTags}
                onChange={(_, newValue) => onSelectedTagsChange(newValue)}
                renderInput={(params) => (
                  <TextField {...params} placeholder={selectedTags.length === 0 ? "Select tags..." : ""} />
                )}
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => (
                    <Chip {...getTagProps({ index })} label={option} size="small" key={option} />
                  ))
                }
                slotProps={{
                  popper: {
                    sx: { zIndex: 1500 }
                  }
                }}
              />
            </>
          )}

          {!hasOptions && (
            <Typography variant="body2" color="text.secondary">
              No filter options available
            </Typography>
          )}
        </Box>
      </Popover>
    </>
  )
}
