import { useState, useEffect, useMemo } from 'react'
import { Autocomplete, TextField, Box, Typography, CircularProgress, Stack, FormControl, InputLabel, Select, MenuItem } from '@mui/material'
import { fetchUnitCategories } from '../api/assets'
import type { UnitCategory } from '../types'

interface UnitOption {
  code: string
  symbol: string
  name: string
  isBase: boolean
  category: string
}

interface UnitAutocompleteProps {
  value: string | undefined
  onChange: (unitCode: string | undefined) => void
  label?: string
  placeholder?: string
  helperText?: string
  layout?: 'single' | 'split' // New prop to control layout
}

export default function UnitAutocomplete({
  value,
  onChange,
  label = 'Unit of Measurement',
  placeholder = 'Search units...',
  helperText = 'Optional unit for this numeric attribute',
  layout = 'single'
}: UnitAutocompleteProps) {
  const [unitCategories, setUnitCategories] = useState<UnitCategory[]>([])
  const [searchInput, setSearchInput] = useState('')
  const [categorySearchInput, setCategorySearchInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string>('')

  // Fetch unit categories with debounced search (for single layout) or by category (for split layout)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setIsLoading(true)
      const search = searchInput || undefined  // Allow search in both modes
      const category = layout === 'split' ? (selectedCategory || undefined) : undefined
      // Use 'units' mode when filtering by category in split layout for better performance
      const mode = (layout === 'split' && selectedCategory) ? 'units' : 'full'

      fetchUnitCategories(search, category, mode)
        .then(categories => setUnitCategories(categories))
        .catch(err => console.error('Failed to fetch unit categories:', err))
        .finally(() => setIsLoading(false))
    }, 300) // 300ms debounce

    return () => clearTimeout(timeoutId)
  }, [searchInput, selectedCategory, layout])

  // For split layout, fetch categories with optional search
  const [allCategories, setAllCategories] = useState<UnitCategory[]>([])
  useEffect(() => {
    if (layout === 'split') {
      const timeoutId = setTimeout(() => {
        const search = categorySearchInput || undefined
        fetchUnitCategories(search, undefined, 'categories')
          .then(categories => setAllCategories(categories))
          .catch(err => console.error('Failed to fetch all categories:', err))
      }, 300) // 300ms debounce for category search

      return () => clearTimeout(timeoutId)
    }
  }, [layout, categorySearchInput])

  // Process unit categories into options - handle both nested and flat formats
  const options: UnitOption[] = useMemo(() => {
    if (!unitCategories.length) return []

    // Check if we have a flat list of units (from mode=units)
    const firstItem = unitCategories[0] as any
    if (firstItem.code && firstItem.categoryName) {
      // Flat list of units with category metadata
      return unitCategories.map((unit: any) => ({
        ...unit,
        category: unit.categoryName
      }))
    } else {
      // Nested categories with units
      return unitCategories.flatMap(category =>
        category.units.map(unit => ({ ...unit, category: category.name }))
      )
    }
  }, [unitCategories])

  // Find the currently selected value in options
  const selectedValue = options.find(u => u.code === value) || null

  // Set category when value changes (for split layout)
  useEffect(() => {
    if (layout === 'split' && value && !selectedCategory) {
      const unit = options.find(u => u.code === value)
      if (unit) {
        const category = allCategories.find(cat => cat.units.some(u => u.code === value))
        if (category) {
          setSelectedCategory(category.key)
        }
      }
    }
  }, [value, options, allCategories, selectedCategory, layout])

  if (layout === 'split') {
    return (
      <Stack spacing={2}>
        <Autocomplete
          options={allCategories}
          getOptionLabel={(option) => option.name}
          value={allCategories.find(cat => cat.key === selectedCategory) || null}
          onChange={(_, newValue) => {
            setSelectedCategory(newValue?.key || '')
            onChange(undefined) // Clear unit selection when category changes
          }}
          inputValue={categorySearchInput}
          onInputChange={(_, newInputValue) => setCategorySearchInput(newInputValue)}
          isOptionEqualToValue={(option, val) => option.key === val.key}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Category"
              placeholder="Search categories..."
            />
          )}
          renderOption={(props, option) => (
            <li {...props} key={option.key}>
              {option.name}
            </li>
          )}
        />

        <Autocomplete
          options={options}
          getOptionLabel={(option) => `${option.name} (${option.symbol})`}
          value={selectedValue}
          onChange={(_, newValue) => onChange(newValue?.code || undefined)}
          inputValue={searchInput}
          onInputChange={(_, newInputValue) => setSearchInput(newInputValue)}
          isOptionEqualToValue={(option, val) => option.code === val.code}
          disabled={!selectedCategory}
          loading={isLoading}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Unit"
              placeholder={selectedCategory ? "Select a unit..." : "Select category first"}
              helperText={selectedCategory ? helperText : "Choose a category to see available units"}
              slotProps={{
                input: {
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {isLoading ? <CircularProgress color="inherit" size={20} /> : null}
                      {params.InputProps.endAdornment}
                    </>
                  ),
                },
              }}
            />
          )}
          renderOption={(props, option) => (
            <li {...props} key={option.code}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                <span>{option.name}</span>
                <Typography variant="body2" color="text.secondary" sx={{ ml: 2 }}>
                  {option.symbol}
                </Typography>
              </Box>
            </li>
          )}
        />
      </Stack>
    )
  }

  // Single layout (original behavior)
  return (
    <Autocomplete
      options={options}
      groupBy={(option) => option.category}
      getOptionLabel={(option) => `${option.name} (${option.symbol})`}
      value={selectedValue}
      onChange={(_, newValue) => onChange(newValue?.code || undefined)}
      onInputChange={(_, newInputValue, reason) => {
        if (reason === 'input') {
          setSearchInput(newInputValue)
        }
      }}
      isOptionEqualToValue={(option, val) => option.code === val.code}
      filterOptions={(x) => x} // Disable client-side filtering, server handles it
      loading={isLoading}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={placeholder}
          helperText={helperText}
          slotProps={{
            input: {
              ...params.InputProps,
              endAdornment: (
                <>
                  {isLoading ? <CircularProgress color="inherit" size={20} /> : null}
                  {params.InputProps.endAdornment}
                </>
              ),
            },
          }}
        />
      )}
      renderOption={(props, option) => (
        <li {...props} key={option.code}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
            <span>{option.name}</span>
            <Typography variant="body2" color="text.secondary" sx={{ ml: 2 }}>
              {option.symbol}
            </Typography>
          </Box>
        </li>
      )}
    />
  )
}
