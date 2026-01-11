import { useState } from 'react'
import { Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Button, Stack, IconButton, Chip, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Select, MenuItem, FormControl, InputLabel, FormControlLabel, Checkbox, Pagination } from '@mui/material'
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, DragIndicator as DragIndicatorIcon } from '@mui/icons-material'
import type { AssetTypeAttribute } from '../types'
import { useLoaderData, useParams, useRevalidator, useSearchParams } from 'react-router-dom'
import { updateAssetTypeAttribute, deleteAssetTypeAttribute, createAssetTypeAttribute, reorderAssetTypeAttributes } from '../api/assets'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'

export default function AssetTypeAttributesPage() {
  const data = useLoaderData() as { attributes: AssetTypeAttribute[], count: number, page: number, pageSize: number }
  const attributes = data.attributes || []
  const count = data.count || 0
  const page = data.page || 1
  const pageSize = data.pageSize || 25
  const totalPages = Math.ceil(count / pageSize)

  const { assetTypeId } = useParams()
  const revalidator = useRevalidator()
  const [searchParams, setSearchParams] = useSearchParams()

  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingAttribute, setEditingAttribute] = useState<AssetTypeAttribute | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    apiKey: '',
    attributeType: 'text',
    isRequired: false,
    description: ''
  })

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handlePageChange = (_event: React.ChangeEvent<unknown>, newPage: number) => {
    const params = new URLSearchParams(searchParams)
    params.set('page', newPage.toString())
    setSearchParams(params)
  }

  const handlePageSizeChange = (event: any) => {
    const params = new URLSearchParams(searchParams)
    params.set('pageSize', event.target.value.toString())
    params.set('page', '1') // Reset to first page when changing page size
    setSearchParams(params)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = attributes.findIndex((attr) => attr.id === active.id)
      const newIndex = attributes.findIndex((attr) => attr.id === over.id)

      const newAttributes = arrayMove(attributes, oldIndex, newIndex)

      // Update the order field for all affected attributes
      const updatedAttributes = newAttributes.map((attr, index) => ({
        ...attr,
        order: ((page - 1) * pageSize) + index
      }))

      // Update orders in the backend with bulk API
      try {
        const updates = updatedAttributes.map(attr => ({
          id: attr.id,
          order: attr.order
        }))
        await reorderAssetTypeAttributes(assetTypeId!, updates)
        revalidator.revalidate()
      } catch (error) {
        console.error('Failed to update attribute order:', error)
        alert('Failed to update attribute order')
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
        await updateAssetTypeAttribute(assetTypeId!, editingAttribute.id, dataToSave)
      } else {
        await createAssetTypeAttribute(assetTypeId!, dataToSave)
      }
      setEditDialogOpen(false)
      revalidator.revalidate()
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
      revalidator.revalidate()
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
      <Box sx={{ flexGrow: 1, overflowY: 'auto', p: 3 }}>
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
            <FormControl size="small">
              <Select
                value={pageSize}
                onChange={handlePageSizeChange}
                sx={{ minWidth: 80 }}
              >
                <MenuItem value={10}>10</MenuItem>
                <MenuItem value={25}>25</MenuItem>
                <MenuItem value={50}>50</MenuItem>
                <MenuItem value={100}>100</MenuItem>
              </Select>
            </FormControl>
            <Typography color="text.secondary">
              Showing {((page - 1) * pageSize) + 1}-{Math.min(page * pageSize, count)} of {count}
            </Typography>
            <Pagination
              count={totalPages}
              page={page}
              onChange={handlePageChange}
              color="primary"
              size="small"
            />
          </Stack>
        </Stack>

        <TableContainer component={Paper} sx={{ maxHeight: 'calc(100vh - 250px)', overflow: 'auto' }}>
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
                <SortableContext items={attributes.map(a => a.id)} strategy={verticalListSortingStrategy}>
                  {attributes.map(attr => (
                    <SortableRow key={attr.id} attr={attr} />
                  ))}
                </SortableContext>
              </TableBody>
            </Table>
          </DndContext>
        </TableContainer>

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

        {count > 0 && attributes.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography color="text.secondary">
              No attributes on this page
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
