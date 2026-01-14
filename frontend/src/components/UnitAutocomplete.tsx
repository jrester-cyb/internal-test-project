import { useState, useEffect } from 'react'
import { Autocomplete, TextField, Box, Typography, CircularProgress } from '@mui/material'
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
}

export default function UnitAutocomplete({
  value,
  onChange,
  label = 'Unit of Measurement',
  placeholder = 'Search units...',
  helperText = 'Optional unit for this numeric attribute'
}: UnitAutocompleteProps) {
  const [unitCategories, setUnitCategories] = useState<UnitCategory[]>([])
  const [searchInput, setSearchInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  // Fetch unit categories with debounced search
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setIsLoading(true)
      fetchUnitCategories(searchInput || undefined)
        .then(categories => setUnitCategories(categories))
        .catch(err => console.error('Failed to fetch unit categories:', err))
        .finally(() => setIsLoading(false))
    }, 300) // 300ms debounce

    return () => clearTimeout(timeoutId)
  }, [searchInput])

  // Flatten categories into options with category name attached
  const options: UnitOption[] = unitCategories.flatMap(category =>
    category.units.map(unit => ({ ...unit, category: category.name }))
  )

  // Find the currently selected value in options
  const selectedValue = options.find(u => u.code === value) || null

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
