import { useState } from 'react'
import { Box, Typography, Chip, IconButton, Popover, Checkbox, FormControlLabel, Autocomplete, TextField, Tooltip, Stack, CircularProgress } from '@mui/material'
import { FilterList as FilterIcon } from '@mui/icons-material'

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
  // Data
  hiddenCount: number
  availableTags: string[]
  availableTypes?: string[]
  // Optional loading state
  isLoading?: boolean
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
  hiddenCount,
  availableTags,
  availableTypes = [],
  isLoading = false,
}: AttributeFilterPopoverProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)

  const hasActiveFilters = showHidden || selectedTags.length > 0 || selectedTypes.length > 0 || excludedScopes.length > 0

  const handleScopeToggle = (scope: string) => {
    if (!onExcludedScopesChange) return
    if (excludedScopes.includes(scope)) {
      onExcludedScopesChange(excludedScopes.filter(s => s !== scope))
    } else {
      onExcludedScopesChange([...excludedScopes, scope])
    }
  }

  const hasOptions = hiddenCount > 0 || availableTags.length > 0 || availableTypes.length > 0 || showScopeFilter

  return (
    <>
      <Tooltip title={hasActiveFilters ? "Filters applied" : "Filter"} arrow placement="top">
        <IconButton
          size="small"
          onClick={(e) => setAnchorEl(e.currentTarget)}
          sx={{
            color: hasActiveFilters
              ? (theme => theme.palette.mode === 'light' ? 'primary.main' : 'secondary.main')
              : 'text.secondary',
          }}
        >
          <FilterIcon />
        </IconButton>
      </Tooltip>
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ p: 2, minWidth: 280 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
            <Typography variant="subtitle2">Filter Options</Typography>
            {isLoading && <CircularProgress size={14} />}
          </Stack>

          {hiddenCount > 0 && (
            <FormControlLabel
              control={
                <Checkbox
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

          {availableTags.length > 0 && (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>Tags</Typography>
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
                sx={{ minWidth: 250 }}
                slotProps={{
                  popper: {
                    sx: { zIndex: 1500 }
                  }
                }}
              />
            </>
          )}

          {availableTypes.length > 0 && onSelectedTypesChange && (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5, mt: 1.5 }}>Type</Typography>
              <Autocomplete
                multiple
                size="small"
                options={availableTypes}
                value={selectedTypes}
                onChange={(_, newValue) => onSelectedTypesChange(newValue)}
                renderInput={(params) => (
                  <TextField {...params} placeholder={selectedTypes.length === 0 ? "Select types..." : ""} />
                )}
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => (
                    <Chip {...getTagProps({ index })} label={option} size="small" key={option} />
                  ))
                }
                sx={{ minWidth: 250 }}
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
