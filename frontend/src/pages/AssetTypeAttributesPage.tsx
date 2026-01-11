import { useState, useEffect, useRef, type ReactNode } from 'react'
import { Box, Typography, Paper, Table, TableBody, TableCell, TableHead, TableRow, Button, Stack, IconButton, Chip, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Select, MenuItem, FormControl, InputLabel, FormControlLabel, Checkbox, CircularProgress, Menu, Collapse, Divider } from '@mui/material'
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, DragIndicator as DragIndicatorIcon, MoreVert as MoreVertIcon, Search as SearchIcon, ExpandMore as ExpandMoreIcon, ExpandLess as ExpandLessIcon } from '@mui/icons-material'
import type { AssetTypeAttribute } from '../types'
import { useLoaderData, useParams, useSearchParams } from 'react-router-dom'
import { updateAssetTypeAttribute, deleteAssetTypeAttribute, createAssetTypeAttribute, reorderAssetTypeAttributes, fetchAssetAttributeDefinitionsFromUrl, fetchAssetAttributeDefinitions } from '../api/assets'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import AttributeChoicesSection from '../components/AttributeChoicesSection'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { FixedSizeList as List } from 'react-window'

export default function AssetTypeAttributesPage() {
  const loaderData = useLoaderData() as {
    initialData: AssetTypeAttribute[]
    initialNextUrl: string | null
    count: number
    assetTypeId: string
    workspaceId: string
  }

  const { initialData, initialNextUrl, count } = loaderData

  const { assetTypeId, workspaceId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const listRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const fetchInProgressRef = useRef(false)

  const [allAttributes, setAllAttributes] = useState(initialData || [])
  const [nextUrl, setNextUrl] = useState<string | null>(initialNextUrl)
  const [listHeight, setListHeight] = useState(600)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(!!initialNextUrl)
  const [selectedAttribute, setSelectedAttribute] = useState<AssetTypeAttribute | null>(null)
  const [leftColumnWidth, setLeftColumnWidth] = useState(50) // percentage
  const [isDraggingDivider, setIsDraggingDivider] = useState(false)
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null)
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '')
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    info: true,
    configuration: false,
    choices: false
  })
  const [sectionOrder, setSectionOrder] = useState<string[]>(['info', 'configuration', 'choices'])

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))
  }

  const sectionSensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleSectionDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setSectionOrder(prev => {
        const oldIndex = prev.indexOf(active.id as string)
        const newIndex = prev.indexOf(over.id as string)
        return arrayMove(prev, oldIndex, newIndex)
      })
    }
  }

  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingAttribute, setEditingAttribute] = useState<AssetTypeAttribute | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    apiKey: '',
    attributeType: 'text',
    isRequired: false,
    description: ''
  })

  // Debounced search effect - just update URL, let loader handle data fetching
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      // Update URL params
      const newSearchParams = new URLSearchParams(searchParams)
      if (searchTerm) {
        newSearchParams.set('search', searchTerm)
      } else {
        newSearchParams.delete('search')
      }
      setSearchParams(newSearchParams, { replace: true })
    }, 300) // 300ms debounce

    return () => clearTimeout(timeoutId)
  }, [searchTerm, assetTypeId])

  // Reset to loader data when it changes
  useEffect(() => {
    setAllAttributes(initialData || [])
    setNextUrl(initialNextUrl)
    setHasMore(!!initialNextUrl)
  }, [initialData, initialNextUrl])

  // Initialize search term from URL on mount only
  useEffect(() => {
    const initialSearch = searchParams.get('search')
    if (initialSearch && searchTerm !== initialSearch) {
      setSearchTerm(initialSearch)
    }
  }, []) // Only run on mount

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
      if (!container || fetchInProgressRef.current || !hasMore || !nextUrl || allAttributes.length >= count) return

      const { scrollTop, scrollHeight, clientHeight } = container
      const scrollPercentage = (scrollTop + clientHeight) / scrollHeight

      // Load more when scrolled to 80%
      if (scrollPercentage > 0.8) {
        fetchInProgressRef.current = true
        setIsLoadingMore(true)
        try {
          const response = await fetchAssetAttributeDefinitionsFromUrl(nextUrl)
          const newAttributes = response.results || []

          if (newAttributes.length > 0) {
            setAllAttributes(prev => {
              // Filter out duplicates by checking existing IDs
              const existingIds = new Set(prev.map(attr => attr.id))
              const uniqueNewAttributes = newAttributes.filter(attr => !existingIds.has(attr.id))
              const updatedAttributes = [...prev, ...uniqueNewAttributes]
              return updatedAttributes
            })
            setNextUrl(response.next || null)
            setHasMore(!!response.next)
          } else {
            setHasMore(false)
            setNextUrl(null)
          }
        } catch (error) {
          console.error('Failed to load more attributes:', error)
          setHasMore(false) // Stop trying on error
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
  }, [assetTypeId, nextUrl, isLoadingMore, hasMore, allAttributes.length, count])

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

  const handleDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDraggingDivider(true)
  }

  const handleDividerDoubleClick = () => {
    setLeftColumnWidth(50) // Center the divider
  }

  useEffect(() => {
    if (!isDraggingDivider) return

    const handleMouseMove = (e: MouseEvent) => {
      const container = document.querySelector('[data-resize-container]') as HTMLElement
      if (!container) return

      const rect = container.getBoundingClientRect()
      const newWidth = ((e.clientX - rect.left) / rect.width) * 100

      // Constrain between 20% and 80%
      const constrainedWidth = Math.min(Math.max(newWidth, 20), 80)
      setLeftColumnWidth(constrainedWidth)
    }

    const handleMouseUp = () => {
      setIsDraggingDivider(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDraggingDivider])

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = allAttributes.findIndex((attr) => attr.id === active.id)
      const newIndex = allAttributes.findIndex((attr) => attr.id === over.id)

      const newAttributes = arrayMove(allAttributes, oldIndex, newIndex)

      // Update the order field for all affected attributes
      const updatedAttributes = newAttributes.map((attr, index) => ({
        ...attr,
        order: index
      }))

      setAllAttributes(updatedAttributes)

      // Update orders in the backend with bulk API
      try {
        const updates = updatedAttributes.map(attr => ({
          id: attr.id,
          order: attr.order
        }))
        await reorderAssetTypeAttributes(workspaceId!, assetTypeId!, updates)
      } catch (error) {
        console.error('Failed to update attribute order:', error)
        alert('Failed to update attribute order')
        // Revert local state on error
        setAllAttributes(allAttributes)
      }
    }
  }

  const handleEdit = (attr: AssetTypeAttribute) => {
    setEditingAttribute(attr)
    setFormData({
      name: attr.name,
      apiKey: attr.apiKey,
      attributeType: attr.attributeType,
      isRequired: attr.isRequired,
      description: attr.description || ''
    })
    setEditDialogOpen(true)
  }

  const handleAdd = () => {
    setEditingAttribute(null)
    setFormData({
      name: '',
      apiKey: '',
      attributeType: 'text',
      isRequired: false,
      description: ''
    })
    setEditDialogOpen(true)
  }

  const generateApiKey = (name: string) => {
    return name
      .split(/[^a-zA-Z0-9]+/)
      .filter(Boolean)
      .map((word, index) =>
        index === 0
          ? word.toLowerCase()
          : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      )
      .join('')
  }

  const handleSave = async () => {
    try {
      const dataToSave = editingAttribute
        ? formData
        : { ...formData, order: count, apiKey: generateApiKey(formData.name) }

      if (editingAttribute) {
        const updatedAttr = await updateAssetTypeAttribute(workspaceId!, assetTypeId!, editingAttribute.id, dataToSave)
        // Update existing attribute in local state
        setAllAttributes(prev => prev.map(attr =>
          attr.id === editingAttribute.id ? { ...attr, ...updatedAttr } : attr
        ))
      } else {
        const newAttr = await createAssetTypeAttribute(workspaceId!, assetTypeId!, dataToSave)
        // Add new attribute to local state
        setAllAttributes(prev => [...prev, newAttr])
        // Select the newly created attribute
        setSelectedAttribute(newAttr)
      }
      setEditDialogOpen(false)
    } catch (error) {
      console.error('Failed to save attribute:', error)
      alert('Failed to save attribute')
    }
  }

  const handleDelete = async (attr: AssetTypeAttribute) => {
    if (!confirm(`Are you sure you want to delete the attribute "${attr.name}"?`)) {
      return
    }

    try {
      await deleteAssetTypeAttribute(workspaceId!, assetTypeId!, attr.id)
      // Remove from local state
      setAllAttributes(prev => prev.filter(a => a.id !== attr.id))
      if (selectedAttribute?.id === attr.id) {
        setSelectedAttribute(null)
      }
    } catch (error) {
      console.error('Failed to delete attribute:', error)
      alert('Failed to delete attribute')
    }
  }

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      text: 'default',
      number: 'primary',
      boolean: 'success',
      date: 'secondary',
      datetime: 'warning',
      json: 'info'
    }
    return colors[type] || 'default'
  }

  function SortableRow({ attr, style: virtualStyle, index }: { attr: AssetTypeAttribute, style: React.CSSProperties, index: number }) {
    const {
      attributes: dndAttributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: attr.id })

    const combinedStyle: React.CSSProperties = {
      ...virtualStyle,
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    }

    const isSelected = selectedAttribute?.id === attr.id

    return (
      <Box
        component={Table}
        ref={setNodeRef}
        style={combinedStyle}
        sx={{ tableLayout: 'fixed', cursor: 'pointer' }}
        onClick={() => setSelectedAttribute(attr)}
      >
        <TableBody>
          <TableRow
            hover
            selected={isSelected}
          >
            <TableCell sx={{ minWidth: '40px', padding: '8px', width: '40px' }}>
              <IconButton size="small" {...dndAttributes} {...listeners} sx={{ cursor: 'grab', '&:active': { cursor: 'grabbing' } }}>
                <DragIndicatorIcon fontSize="small" />
              </IconButton>
            </TableCell>
            <TableCell sx={{ fontWeight: 600 }}>{attr.name}</TableCell>
            <TableCell sx={{ width: '48px' }}></TableCell>
          </TableRow>
        </TableBody>
      </Box>
    )
  }

  function DraggableSection({ id, title, expanded, onToggle, children, flexGrow = false }: {
    id: string
    title?: string
    expanded?: boolean
    onToggle?: () => void
    children: ReactNode | ((props: { dndAttributes: ReturnType<typeof useSortable>['attributes']; listeners: ReturnType<typeof useSortable>['listeners'] }) => ReactNode)
    flexGrow?: boolean
  }) {
    const {
      attributes: dndAttributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id })

    const style: React.CSSProperties = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    }

    // For sections with toggle (Info, Configuration)
    if (onToggle !== undefined && expanded !== undefined && title) {
      return (
        <Box ref={setNodeRef} style={style} sx={{ flexGrow: flexGrow ? 1 : 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <Box
            sx={{ display: 'flex', alignItems: 'center', borderRadius: 1, mx: -1, px: 1 }}
          >
            <Box
              {...dndAttributes}
              {...listeners}
              sx={{ cursor: 'grab', '&:active': { cursor: 'grabbing' }, display: 'flex', alignItems: 'center', mr: 0.5 }}
            >
              <DragIndicatorIcon fontSize="small" color="action" />
            </Box>
            <Box
              onClick={onToggle}
              sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer', flexGrow: 1, '&:hover': { bgcolor: 'action.hover' }, borderRadius: 1 }}
            >
              {expanded ? <ExpandLessIcon fontSize="small" color="action" /> : <ExpandMoreIcon fontSize="small" color="action" />}
              <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 600, ml: 0.5 }}>
                {title}
              </Typography>
            </Box>
          </Box>
          <Collapse in={expanded}>
            {children as ReactNode}
          </Collapse>
        </Box>
      )
    }

    // For sections without toggle (Choices - has its own internal toggle)
    // Pass drag props to children so they can render their own drag handle
    return (
      <Box ref={setNodeRef} style={style} sx={{ flexGrow: flexGrow ? 1 : 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {typeof children === 'function' ? children({ dndAttributes, listeners }) : children}
      </Box>
    )
  }

  const renderSection = (sectionId: string) => {
    switch (sectionId) {
      case 'info':
        return (
          <DraggableSection
            key="info"
            id="info"
            title="Info"
            expanded={expandedSections.info}
            onToggle={() => toggleSection('info')}
          >
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Box>
                <Typography variant="subtitle2" color="text.secondary">Name</Typography>
                <Typography variant="body1" sx={{ fontWeight: 600 }}>{selectedAttribute!.name}</Typography>
              </Box>
              {selectedAttribute!.description && (
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">Description</Typography>
                  <Typography variant="body1">{selectedAttribute!.description}</Typography>
                </Box>
              )}
              <Box>
                <Typography variant="subtitle2" color="text.secondary">Usage</Typography>
                <Typography variant="body1">
                  {selectedAttribute!.assetCount ?? 0} {(selectedAttribute!.assetCount ?? 0) === 1 ? 'asset' : 'assets'}
                </Typography>
              </Box>
            </Stack>
          </DraggableSection>
        )
      case 'configuration':
        return (
          <DraggableSection
            key="configuration"
            id="configuration"
            title="Configuration"
            expanded={expandedSections.configuration}
            onToggle={() => toggleSection('configuration')}
          >
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Box>
                <Typography variant="subtitle2" color="text.secondary">Type</Typography>
                <Chip
                  label={selectedAttribute!.attributeType}
                  color={getTypeColor(selectedAttribute!.attributeType) as any}
                  size="small"
                />
              </Box>
              <Box>
                <Typography variant="subtitle2" color="text.secondary">Required</Typography>
                {selectedAttribute!.isRequired ? (
                  <Chip label="Required" color="error" size="small" />
                ) : (
                  <Chip label="Optional" variant="outlined" size="small" />
                )}
              </Box>
              <Box>
                <Typography variant="subtitle2" color="text.secondary">API Key</Typography>
                <Typography variant="body1" sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                  {selectedAttribute!.apiKey}
                </Typography>
              </Box>
            </Stack>
          </DraggableSection>
        )
      case 'choices':
        return (
          <DraggableSection key="choices" id="choices">
            {({ dndAttributes, listeners }) => (
              <AttributeChoicesSection
                attribute={selectedAttribute!}
                workspaceId={workspaceId!}
                assetTypeId={assetTypeId!}
                expanded={expandedSections.choices}
                onToggleExpanded={() => toggleSection('choices')}
                dragHandleProps={{ ...dndAttributes, ...listeners }}
              />
            )}
          </DraggableSection>
        )
      default:
        return null
    }
  }

  return (
    <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: 'background.default', p: 2 }}>
      <Box data-resize-container sx={{ flexGrow: 1, display: 'flex', overflow: 'hidden', mb: 2, position: 'relative' }}>
        {/* Left Column - Table */}
        <Box sx={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', p: 2, width: `${leftColumnWidth}%`, bgcolor: 'background.paper', borderRadius: 1 }}>
          {/* Search Bar */}
          <Box sx={{ mb: 2 }}>
            <TextField
              size="small"
              placeholder="Search attributes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              sx={{ width: '100%' }}
              InputProps={{
                startAdornment: <SearchIcon sx={{ color: 'text.secondary', mr: 1 }} />,
              }}
            />
          </Box>
          <Box ref={containerRef} sx={{ position: 'relative', flexGrow: 1, minHeight: 0, overflow: 'hidden' }}>
            <Box component={Paper} sx={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, maxWidth: '100%', display: 'flex', flexDirection: 'column' }}>
              {/* Table Header */}
              <Table size="small" sx={{ tableLayout: 'fixed' }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, width: '40px' }}></TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                    <TableCell sx={{ fontWeight: 600, width: '48px', textAlign: 'right', pr: 1 }}>
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={handleAdd}
                      >
                        <AddIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                </TableHead>
              </Table>

              {/* Virtual Scrolling List */}
              {allAttributes.length === 0 ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 2, p: 4 }}>
                  <Typography variant="h6" color="text.secondary">
                    {searchTerm ? 'No attributes found' : 'No attributes yet'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {searchTerm
                      ? `No attributes match "${searchTerm}". Try a different search term.`
                      : 'Click the + button to create your first attribute.'}
                  </Typography>
                </Box>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                  modifiers={[restrictToVerticalAxis]}
                >
                  <SortableContext items={allAttributes.map(a => a.id)} strategy={verticalListSortingStrategy}>
                    <List
                      ref={listRef}
                      height={listHeight}
                      itemCount={allAttributes.length}
                      itemSize={53}
                      width="100%"
                    >
                      {({ index, style }) => {
                        const attr = allAttributes[index]
                        return <SortableRow key={attr.id} attr={attr} style={style} index={index} />
                      }}
                    </List>
                  </SortableContext>
                </DndContext>
              )}
            </Box>

            {isLoadingMore && (
              <Box sx={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 1 }}>
                <CircularProgress size={24} />
              </Box>
            )}
          </Box>
        </Box>

        {/* Resizable Divider */}
        <Box
          onMouseDown={handleDividerMouseDown}
          onDoubleClick={handleDividerDoubleClick}
          sx={{
            width: '8px',
            cursor: 'col-resize',
            bgcolor: isDraggingDivider ? 'primary.main' : 'transparent',
            '&:hover': { bgcolor: 'primary.light' },
            transition: 'background-color 0.2s',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Box
            sx={{
              width: '3px',
              height: '40px',
              borderLeft: '1px solid',
              borderRight: '1px solid',
              borderColor: 'grey.400',
              opacity: isDraggingDivider ? 0 : 1,
            }}
          />
        </Box>

        {/* Right Column - Details Panel */}
        <Box sx={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', width: `${100 - leftColumnWidth}%`, bgcolor: 'background.paper', borderRadius: 1 }}>
          {selectedAttribute ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3} sx={{ flexShrink: 0, p: 2, pb: 0 }}>
                <Typography variant="h6" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  Details
                </Typography>
                <Stack direction="row" sx={{ overflow: 'hidden', alignItems: 'center' }}>
                  <Collapse in={leftColumnWidth <= 65} orientation="horizontal" timeout={250}>
                    <Button
                      size="small"
                      variant="outlined"
                      color="primary"
                      startIcon={<EditIcon />}
                      onClick={() => handleEdit(selectedAttribute)}
                      sx={{ whiteSpace: 'nowrap', mr: 1 }}
                    >
                      Edit
                    </Button>
                  </Collapse>
                  <Collapse in={leftColumnWidth <= 50} orientation="horizontal" timeout={250}>
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      startIcon={<DeleteIcon />}
                      onClick={() => handleDelete(selectedAttribute)}
                      sx={{ whiteSpace: 'nowrap', mr: 1 }}
                    >
                      Delete
                    </Button>
                  </Collapse>
                  <IconButton
                    size="small"
                    onClick={(e) => setMenuAnchorEl(e.currentTarget)}
                    sx={{
                      opacity: leftColumnWidth > 50 ? 1 : 0,
                      pointerEvents: leftColumnWidth > 50 ? 'auto' : 'none',
                      transition: 'opacity 150ms',
                      transitionDelay: leftColumnWidth > 50 ? '105ms' : '0ms',
                    }}
                  >
                    <MoreVertIcon />
                  </IconButton>
                  <Menu
                    anchorEl={menuAnchorEl}
                    open={Boolean(menuAnchorEl)}
                    onClose={() => setMenuAnchorEl(null)}
                  >
                    {leftColumnWidth > 65 && (
                      <MenuItem onClick={() => { handleEdit(selectedAttribute); setMenuAnchorEl(null); }}>
                        <EditIcon fontSize="small" sx={{ mr: 1 }} /> Edit
                      </MenuItem>
                    )}
                    <MenuItem onClick={() => { handleDelete(selectedAttribute); setMenuAnchorEl(null); }}>
                      <DeleteIcon fontSize="small" sx={{ mr: 1 }} /> Delete
                    </MenuItem>
                  </Menu>
                </Stack>
              </Stack>

              <Box sx={{ flex: 1, overflow: 'auto', px: 2, pb: 2, minHeight: 0 }}>
                <DndContext
                  sensors={sectionSensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleSectionDragEnd}
                  modifiers={[restrictToVerticalAxis]}
                >
                  <SortableContext items={sectionOrder} strategy={verticalListSortingStrategy}>
                    <Stack spacing={1}>
                      {sectionOrder.map((sectionId, index) => (
                        <>
                          {index > 0 && <Divider key={`divider-${sectionId}`} />}
                          {renderSection(sectionId)}
                        </>
                      ))}
                    </Stack>
                  </SortableContext>
                </DndContext>
              </Box>
            </Box>
          ) : (
            <Box sx={{ textAlign: 'center', py: 8 }}>
              <Typography color="text.secondary" variant="h6" gutterBottom>
                Select an attribute
              </Typography>
              <Typography color="text.secondary" variant="body2">
                Click on an attribute in the table to view its details
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingAttribute ? 'Edit Attribute' : 'Add Attribute'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Name"
              fullWidth
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
            {editingAttribute && (
              <TextField
                label="API Key"
                fullWidth
                value={formData.apiKey}
                onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                helperText="Used in API requests (e.g., street_name, streetName)"
              />
            )}
            <FormControl fullWidth>
              <InputLabel>Type</InputLabel>
              <Select
                value={formData.attributeType}
                label="Type"
                onChange={(e) => setFormData({ ...formData, attributeType: e.target.value })}
              >
                <MenuItem value="text">Text</MenuItem>
                <MenuItem value="number">Number</MenuItem>
                <MenuItem value="boolean">Boolean</MenuItem>
                <MenuItem value="date">Date</MenuItem>
                <MenuItem value="datetime">DateTime</MenuItem>
                <MenuItem value="json">JSON</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Description"
              fullWidth
              multiline
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={formData.isRequired}
                  onChange={(e) => setFormData({ ...formData, isRequired: e.target.checked })}
                />
              }
              label="Required"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} variant="contained" color="primary">
            {editingAttribute ? 'Save' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
