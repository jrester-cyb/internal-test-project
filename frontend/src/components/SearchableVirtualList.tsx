import { useState, useMemo, useEffect, type ReactNode } from 'react'
import { Box, TextField, Typography } from '@mui/material'
import { FixedSizeList as List } from 'react-window'
import { AutoSizer } from 'react-virtualized-auto-sizer'

interface SearchableVirtualListProps<T> {
  /** Items to display */
  items: T[]
  /** Function to extract searchable text from an item */
  getSearchableText: (item: T) => string
  /** Function to get a unique key for each item */
  getItemKey: (item: T, index: number) => string | number
  /** Height of each item in pixels */
  itemHeight: number
  /** Render function for each item */
  renderItem: (item: T, index: number, style: React.CSSProperties) => ReactNode
  /** Placeholder text for search input */
  searchPlaceholder?: string
  /** Message to show when no items match search */
  emptySearchMessage?: string
  /** Message to show when items array is empty */
  emptyMessage?: string
  /** Whether to show the search box */
  showSearch?: boolean
  /** External search value (controlled mode) */
  searchValue?: string
  /** Callback when search value changes (controlled mode) */
  onSearchChange?: (value: string) => void
  /** Header content to render above the list */
  header?: ReactNode
}

export default function SearchableVirtualList<T>({
  items,
  getSearchableText,
  getItemKey,
  itemHeight,
  renderItem,
  searchPlaceholder = 'Search...',
  emptySearchMessage = 'No matches found',
  emptyMessage = 'No items',
  showSearch = true,
  searchValue: controlledSearchValue,
  onSearchChange,
  header,
}: SearchableVirtualListProps<T>) {
  const [internalSearchValue, setInternalSearchValue] = useState('')

  // Use controlled or internal search value
  const searchValue = controlledSearchValue !== undefined ? controlledSearchValue : internalSearchValue
  const setSearchValue = onSearchChange || setInternalSearchValue

  // Filter items based on search
  const filteredItems = useMemo(() => {
    const search = searchValue.trim().toLowerCase()
    if (!search) return items
    return items.filter(item => getSearchableText(item).toLowerCase().includes(search))
  }, [items, searchValue, getSearchableText])

  // Reset internal search when items change significantly (e.g., new selection)
  useEffect(() => {
    if (controlledSearchValue === undefined) {
      setInternalSearchValue('')
    }
  }, [items.length, controlledSearchValue])

  if (items.length === 0) {
    return (
      <>
        {header}
        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
          {emptyMessage}
        </Typography>
      </>
    )
  }

  return (
    <>
      {header}
      {showSearch && (
        <TextField
          size="small"
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          sx={{ mb: 1, flexShrink: 0 }}
        />
      )}
      {filteredItems.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
          {emptySearchMessage}
        </Typography>
      ) : (
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <AutoSizer
            renderProp={({ height, width }) => {
              if (!height || !width) return null
              return (
                <List
                  height={height}
                  width={width}
                  itemCount={filteredItems.length}
                  itemSize={itemHeight}
                  itemKey={(index) => getItemKey(filteredItems[index], index)}
                >
                  {({ index, style }) => renderItem(filteredItems[index], index, style)}
                </List>
              )
            }}
          />
        </Box>
      )}
    </>
  )
}
