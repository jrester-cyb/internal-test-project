import { useState, useEffect, useRef } from 'react'
import { Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Button, Stack, IconButton, Chip, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Select, MenuItem, FormControl, InputLabel, FormControlLabel, Checkbox, CircularProgress } from '@mui/material'
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, DragIndicator as DragIndicatorIcon } from '@mui/icons-material'
import type { AssetTypeAttribute } from '../types'
import { useLoaderData, useParams, useRevalidator } from 'react-router-dom'
import { updateAssetTypeAttribute, deleteAssetTypeAttribute, createAssetTypeAttribute, reorderAssetTypeAttributes, fetchAssetAttributeDefinitions, fetchAssetAttributeDefinitionsFromUrl } from '../api/assets'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'

export default function AssetTypeAttributesPage() {
  const loaderData = useLoaderData() as {
    initialData: AssetTypeAttribute[]
    initialNextUrl: string | null
    count: number
    assetTypeId: string
  }

  const { initialData, initialNextUrl, count } = loaderData

  const { assetTypeId } = useParams()
  const revalidator = useRevalidator()
  const tableContainerRef = useRef<HTMLDivElement>(null)
  const fetchInProgressRef = useRef(false)

  const [allAttributes, setAllAttributes] = useState(initialData || [])
  const [nextUrl, setNextUrl] = useState<string | null>(initialNextUrl)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(!!initialNextUrl)

  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingAttribute, setEditingAttribute] = useState<AssetTypeAttribute | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    apiKey: '',
    attributeType: 'text',
    isRequired: false,
    description: ''
  })

  // Reset when loader data changes (e.g., after revalidation)
  useEffect(() => {
    setAllAttributes(initialData || [])
    setNextUrl(initialNextUrl)
    setHasMore(!!initialNextUrl)
  }, [initialData, initialNextUrl])

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Infinite scroll handler
  useEffect(() => {
    const handleScroll = async () => {
      const container = tableContainerRef.current
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

    const container = tableContainerRef.current
    if (container) {
      container.addEventListener('scroll', handleScroll)
      return () => container.removeEventListener('scroll', handleScroll)
    }
  }, [assetTypeId, nextUrl, isLoadingMore, hasMore, allAttributes.length, count])

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
        await reorderAssetTypeAttributes(assetTypeId!, updates)
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

  const handleSave = async () => {
    try {
      const dataToSave = editingAttribute
        ? formData
        : { ...formData, order: count }

      if (editingAttribute) {
        const updatedAttr = await updateAssetTypeAttribute(assetTypeId!, editingAttribute.id, dataToSave)
        // Update existing attribute in local state
        setAllAttributes(prev => prev.map(attr =>
          attr.id === editingAttribute.id ? { ...attr, ...updatedAttr } : attr
        ))
      } else {
        const newAttr = await createAssetTypeAttribute(assetTypeId!, dataToSave)
        // Add new attribute to local state
        setAllAttributes(prev => [...prev, newAttr])
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
      await deleteAssetTypeAttribute(assetTypeId!, attr.id)
      // Remove from local state
      setAllAttributes(prev => prev.filter(a => a.id !== attr.id))
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

  function SortableRow({ attr }: { attr: AssetTypeAttribute }) {
    const {
      attributes: dndAttributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: attr.id })

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    }

    return (
      <TableRow ref={setNodeRef} style={style} hover>
        <TableCell sx={{ minWidth: '40px', padding: '8px' }}>
          <IconButton size="small" {...dndAttributes} {...listeners} sx={{ cursor: 'grab', '&:active': { cursor: 'grabbing' } }}>
            <DragIndicatorIcon fontSize="small" />
          </IconButton>
        </TableCell>
        <TableCell sx={{ fontWeight: 600, minWidth: '150px' }}>{attr.name}</TableCell>
        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.875rem', minWidth: '150px' }}>{attr.apiKey}</TableCell>
        <TableCell sx={{ minWidth: '100px' }}>
          <Chip
            label={attr.attributeType}
            color={getTypeColor(attr.attributeType) as any}
            size="small"
          />
        </TableCell>
        <TableCell sx={{ minWidth: '100px' }}>
          {attr.isRequired ? (
            <Chip label="Required" color="error" size="small" />
          ) : (
            <Chip label="Optional" variant="outlined" size="small" />
          )}
        </TableCell>
        <TableCell sx={{ maxWidth: '300px', minWidth: '200px' }}>{attr.description || '-'}</TableCell>
        <TableCell sx={{ minWidth: '100px' }}>
          <Stack direction="row" spacing={1}>
            <IconButton size="small" color="primary" onClick={() => handleEdit(attr)}>
              <EditIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" color="error" onClick={() => handleDelete(attr)}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Stack>
        </TableCell>
      </TableRow>
    )
  }

  return (
    <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: 'grey.50' }}>
      <Box
        sx={{ flexGrow: 1, overflowY: 'hidden', p: 3 }}
      >
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h5" component="h2">Attributes</Typography>
          <Stack direction="row" spacing={2} alignItems="center">
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              color="primary"
              onClick={handleAdd}
            >
              Add Attribute
            </Button>
            <Typography color="text.secondary">
              Showing {allAttributes.length} of {count}
            </Typography>
          </Stack>
        </Stack>

        <TableContainer ref={tableContainerRef} component={Paper} sx={{ maxHeight: 'calc(100vh - 250px)', overflow: 'auto' }}>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            modifiers={[restrictToVerticalAxis]}
          >
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600, width: '40px', minWidth: '40px' }}></TableCell>
                  <TableCell sx={{ fontWeight: 600, minWidth: '150px' }}>Name</TableCell>
                  <TableCell sx={{ fontWeight: 600, minWidth: '150px' }}>API Key</TableCell>
                  <TableCell sx={{ fontWeight: 600, minWidth: '100px' }}>Type</TableCell>
                  <TableCell sx={{ fontWeight: 600, minWidth: '100px' }}>Required</TableCell>
                  <TableCell sx={{ fontWeight: 600, minWidth: '200px' }}>Description</TableCell>
                  <TableCell sx={{ fontWeight: 600, width: '100px', minWidth: '100px' }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <SortableContext items={allAttributes.map(a => a.id)} strategy={verticalListSortingStrategy}>
                  {allAttributes.map(attr => (
                    <SortableRow key={attr.id} attr={attr} />
                  ))}
                </SortableContext>
              </TableBody>
            </Table>
          </DndContext>
        </TableContainer>

        {isLoadingMore && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <CircularProgress size={24} />
          </Box>
        )}

        {count === 0 && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography color="text.secondary" gutterBottom>
              No attributes configured
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Add attributes to define the fields for this asset type
            </Typography>
          </Box>
        )}

        {count > 0 && allAttributes.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography color="text.secondary">
              No attributes found
            </Typography>
          </Box>
        )}
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
            <TextField
              label="API Key"
              fullWidth
              value={formData.apiKey}
              onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
              helperText="Used in API requests (e.g., street_name, streetName)"
            />
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
