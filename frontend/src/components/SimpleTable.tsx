import { useState, useEffect, useRef, type ReactNode } from 'react'
import { Box, Typography, Paper, Table, TableBody, TableCell, TableHead, TableRow, IconButton, CircularProgress, TextField } from '@mui/material'
import { Add as AddIcon, DragIndicator as DragIndicatorIcon, Search as SearchIcon } from '@mui/icons-material'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { FixedSizeList as List } from 'react-window'

export interface ColumnDef<T> {
  key: string
  header: string | ReactNode
  width?: string | number
  render: (item: T) => ReactNode
}

export interface SimpleTableProps<T extends { id: string | number }> {
  items: T[]
  columns: ColumnDef<T>[]
  selectedItem?: T | null
  onSelect?: (item: T) => void
  onAdd?: () => void
  onReorder?: (items: T[]) => Promise<void>
  onLoadMore?: () => Promise<{ results: T[], next: string | null }>
  nextUrl?: string | null
  totalCount?: number
  emptyMessage?: string
  emptyDescription?: string
  searchPlaceholder?: string
  searchValue?: string
  onSearchChange?: (value: string) => void
  draggable?: boolean
  rowHeight?: number
}

export default function SimpleTable<T extends { id: string | number }>({
  items,
  columns,
  selectedItem,
  onSelect,
  onAdd,
  onReorder,
  onLoadMore,
  nextUrl: initialNextUrl,
  totalCount = items.length,
  emptyMessage = 'No items yet',
  emptyDescription = 'Click the + button to create your first item.',
  searchPlaceholder = 'Search...',
  searchValue = '',
  onSearchChange,
  draggable = true,
  rowHeight = 53,
}: SimpleTableProps<T>) {
  const listRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const fetchInProgressRef = useRef(false)

  const [allItems, setAllItems] = useState(items)
  const [nextUrl, setNextUrl] = useState<string | null>(initialNextUrl || null)
  const [listHeight, setListHeight] = useState(600)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(!!initialNextUrl)

  // Sync with props when items change
  useEffect(() => {
    setAllItems(items)
  }, [items])

  // Sync nextUrl with props
  useEffect(() => {
    setNextUrl(initialNextUrl || null)
    setHasMore(!!initialNextUrl)
  }, [initialNextUrl])

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Infinite scroll handler
  useEffect(() => {
    const handleScroll = async (e: Event) => {
      const container = e.target as HTMLDivElement
      if (!container || fetchInProgressRef.current || !hasMore || !nextUrl || !onLoadMore || allItems.length >= totalCount) return

      const { scrollTop, scrollHeight, clientHeight } = container
      const scrollPercentage = (scrollTop + clientHeight) / scrollHeight

      // Load more when scrolled to 80%
      if (scrollPercentage > 0.8) {
        fetchInProgressRef.current = true
        setIsLoadingMore(true)
        try {
          const response = await onLoadMore()
          const newItems = response.results || []

          if (newItems.length > 0) {
            setAllItems(prev => {
              // Filter out duplicates by checking existing IDs
              const existingIds = new Set(prev.map(item => item.id))
              const uniqueNewItems = newItems.filter(item => !existingIds.has(item.id))
              return [...prev, ...uniqueNewItems]
            })
            setNextUrl(response.next || null)
            setHasMore(!!response.next)
          } else {
            setHasMore(false)
            setNextUrl(null)
          }
        } catch (error) {
          console.error('Failed to load more items:', error)
          setHasMore(false)
          setNextUrl(null)
        } finally {
          fetchInProgressRef.current = false
          setIsLoadingMore(false)
        }
      }
    }

    const list = listRef.current
    if (list) {
      const container = list._outerRef
      if (container) {
        container.addEventListener('scroll', handleScroll)
        return () => container.removeEventListener('scroll', handleScroll)
      }
    }
  }, [nextUrl, isLoadingMore, hasMore, allItems.length, totalCount, onLoadMore])

  // Update list height when container size changes
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateHeight = () => {
      const rect = container.getBoundingClientRect()
      if (rect.height > 0) {
        setListHeight(rect.height)
      }
    }

    updateHeight()

    const resizeObserver = new ResizeObserver(updateHeight)
    resizeObserver.observe(container)

    return () => resizeObserver.disconnect()
  }, [])

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id && onReorder) {
      const oldIndex = allItems.findIndex((item) => item.id === active.id)
      const newIndex = allItems.findIndex((item) => item.id === over.id)

      const newItems = arrayMove(allItems, oldIndex, newIndex)
      setAllItems(newItems)

      try {
        await onReorder(newItems)
      } catch (error) {
        console.error('Failed to reorder items:', error)
        // Revert local state on error
        setAllItems(allItems)
      }
    }
  }

  function SortableRow({ item, style: virtualStyle }: { item: T, style: React.CSSProperties }) {
    const {
      attributes: dndAttributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: item.id })

    const combinedStyle: React.CSSProperties = {
      ...virtualStyle,
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    }

    const isSelected = selectedItem?.id === item.id

    return (
      <Box
        component={Table}
        ref={setNodeRef}
        style={combinedStyle}
        sx={{ tableLayout: 'fixed', cursor: 'pointer' }}
        onClick={() => onSelect?.(item)}
      >
        <TableBody>
          <TableRow hover selected={isSelected}>
            {draggable && (
              <TableCell sx={{ minWidth: '40px', padding: '8px', width: '40px' }}>
                <IconButton size="small" {...dndAttributes} {...listeners} sx={{ cursor: 'grab', '&:active': { cursor: 'grabbing' } }}>
                  <DragIndicatorIcon fontSize="small" />
                </IconButton>
              </TableCell>
            )}
            {columns.map((col) => (
              <TableCell key={col.key} sx={{ width: col.width }}>
                {col.render(item)}
              </TableCell>
            ))}
          </TableRow>
        </TableBody>
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%' }}>
      {/* Search Bar */}
      {onSearchChange && (
        <Box sx={{ mb: 2 }}>
          <TextField
            size="small"
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            sx={{ width: '100%' }}
            InputProps={{
              startAdornment: <SearchIcon sx={{ color: 'text.secondary', mr: 1 }} />,
            }}
          />
        </Box>
      )}
      <Box ref={containerRef} sx={{ position: 'relative', flexGrow: 1, minHeight: 0, overflow: 'hidden' }}>
        <Box component={Paper} sx={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, maxWidth: '100%', display: 'flex', flexDirection: 'column' }}>
          {/* Table Header */}
          <Table size="small" sx={{ tableLayout: 'fixed' }}>
            <TableHead>
              <TableRow>
                {draggable && <TableCell sx={{ fontWeight: 600, width: '40px' }}></TableCell>}
                {columns.map((col) => (
                  <TableCell key={col.key} sx={{ fontWeight: 600, width: col.width }}>
                    {col.header}
                  </TableCell>
                ))}
                {onAdd && (
                  <TableCell sx={{ fontWeight: 600, width: '48px', textAlign: 'right', pr: 1 }}>
                    <IconButton size="small" color="primary" onClick={onAdd}>
                      <AddIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                )}
              </TableRow>
            </TableHead>
          </Table>

          {/* Virtual Scrolling List */}
          {allItems.length === 0 ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 2, p: 4 }}>
              <Typography variant="h6" color="text.secondary">
                {searchValue ? 'No items found' : emptyMessage}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {searchValue
                  ? `No items match "${searchValue}". Try a different search term.`
                  : emptyDescription}
              </Typography>
            </Box>
          ) : draggable ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
              modifiers={[restrictToVerticalAxis]}
            >
              <SortableContext items={allItems.map(a => a.id)} strategy={verticalListSortingStrategy}>
                <List
                  ref={listRef}
                  height={listHeight}
                  itemCount={allItems.length}
                  itemSize={rowHeight}
                  width="100%"
                >
                  {({ index, style }) => {
                    const item = allItems[index]
                    return <SortableRow key={item.id} item={item} style={style} />
                  }}
                </List>
              </SortableContext>
            </DndContext>
          ) : (
            <List
              ref={listRef}
              height={listHeight}
              itemCount={allItems.length}
              itemSize={rowHeight}
              width="100%"
            >
              {({ index, style }) => {
                const item = allItems[index]
                const isSelected = selectedItem?.id === item.id
                return (
                  <Box
                    component={Table}
                    style={style}
                    sx={{ tableLayout: 'fixed', cursor: 'pointer' }}
                    onClick={() => onSelect?.(item)}
                  >
                    <TableBody>
                      <TableRow hover selected={isSelected}>
                        {columns.map((col) => (
                          <TableCell key={col.key} sx={{ width: col.width }}>
                            {col.render(item)}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableBody>
                  </Box>
                )
              }}
            </List>
          )}
        </Box>

        {isLoadingMore && (
          <Box sx={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)' }}>
            <CircularProgress size={24} />
          </Box>
        )}
      </Box>
    </Box>
  )
}
