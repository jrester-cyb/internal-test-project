import { useState, useEffect, useRef, type ReactNode } from 'react'
import { Box, Typography, Paper, Table, TableBody, TableCell, TableHead, TableRow, Button, Stack, IconButton, Chip, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Select, MenuItem, FormControl, InputLabel, FormControlLabel, Checkbox, CircularProgress, Collapse, Divider, Tooltip, Autocomplete, Popover, Drawer, useMediaQuery, useTheme } from '@mui/material'
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, DragIndicator as DragIndicatorIcon, Search as SearchIcon, ExpandMore as ExpandMoreIcon, ExpandLess as ExpandLessIcon, Lock as LockIcon, LockOpen as LockOpenIcon, CompareArrows as CompareArrowsIcon, VisibilityOff as HideIcon, Visibility as ShowIcon, FilterList as FilterIcon, Close as CloseIcon, Share as ShareIcon, OpenInNew as OpenInNewIcon } from '@mui/icons-material'
import ActionButtons from '../components/ActionButtons'
import type { AssetTypeAttribute } from '../types'
import { useLoaderData, useParams, useSearchParams, useRouteLoaderData } from 'react-router-dom'
import { updateAssetTypeAttribute, deleteAssetTypeAttribute, createAssetTypeAttribute, reorderAssetTypeAttributes, fetchAssetAttributeDefinitionsFromUrl, hideAssetTypeAttribute, unhideAssetTypeAttribute, fetchAssetAttributeByApiKey, fetchAttributeTags, fetchGlobalAttributeDefinition, fetchAssetAttributeDefinitions } from '../api/assets'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import AttributeChoicesSection from '../components/AttributeChoicesSection'
import ConfirmDialog from '../components/ConfirmDialog'
import CopyableText from '../components/CopyableText'
import TruncatedText from '../components/TruncatedText'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { FixedSizeList as List } from 'react-window'

export default function AssetTypeAttributesPage() {
  const loaderData = useLoaderData() as {
    initialData: AssetTypeAttribute[]
    initialNextUrl: string | null
    count: number
    assetTypeId: string
    workspaceId: string
    includeHidden?: boolean
  }

  const { initialData, initialNextUrl, count, includeHidden: initialIncludeHidden } = loaderData

  const { assetTypeId, workspaceId } = useParams()
  const workspaceData = useRouteLoaderData('workspace-route') as { organization?: string } | undefined
  const organizationId = workspaceData?.organization

  const [searchParams, setSearchParams] = useSearchParams()
  const listRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const fetchInProgressRef = useRef(false)
  const nextUrlRef = useRef<string | null>(initialNextUrl)

  const [allAttributes, setAllAttributes] = useState(initialData || [])
  const [nextUrl, setNextUrl] = useState<string | null>(initialNextUrl)
  const [listHeight, setListHeight] = useState(600)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [selectedAttribute, setSelectedAttribute] = useState<AssetTypeAttribute | null>(null)
  const [selectedAttributeAssetCount, setSelectedAttributeAssetCount] = useState<number | null>(null)
  const [isLoadingCount, setIsLoadingCount] = useState(false)
  const [leftColumnWidth, setLeftColumnWidth] = useState(50) // percentage
  const [leftColumnPixelWidth, setLeftColumnPixelWidth] = useState(500)
  const [isDraggingDivider, setIsDraggingDivider] = useState(false)
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null)
  const [filterAnchorEl, setFilterAnchorEl] = useState<null | HTMLElement>(null)
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '')
  const [includeHidden, setIncludeHidden] = useState(initialIncludeHidden || false)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [excludedScopes, setExcludedScopes] = useState<string[]>([])
  const [globalDefinition, setGlobalDefinition] = useState<AssetTypeAttribute | null>(null)
  const [isLoadingGlobalDefinition, setIsLoadingGlobalDefinition] = useState(false)
  const [showingGlobalDefinition, setShowingGlobalDefinition] = useState(false)
  const [isRefetching, setIsRefetching] = useState(false) // Loading state for filter-triggered refetch

  // Responsive breakpoint detection - use lg (1200px) to include iPads in landscape
  const theme = useTheme()
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('lg'))

  // Calculate if there's enough space to show the Scope column
  // Fixed columns: drag (40px) + scope (100px) + actions (48px) = 188px
  // We want at least 200px for the name column
  const showScopeColumn = leftColumnPixelWidth >= 388
  const showHiddenChip = leftColumnPixelWidth > 350

  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    title: string
    message: string
    confirmLabel: string
    confirmColor: 'primary' | 'error' | 'warning'
    onConfirm: () => void
  }>({ open: false, title: '', message: '', confirmLabel: 'Confirm', confirmColor: 'primary', onConfirm: () => { } })

  const closeConfirmDialog = () => setConfirmDialog(prev => ({ ...prev, open: false }))

  // Filter attributes - only hidden filtering is client-side, scope/tags are server-side
  const displayedAttributes = allAttributes.filter(attr => {
    // Filter by hidden status (client-side only)
    if (!includeHidden && attr.isHidden) return false
    return true
  })

  // If selected attribute is filtered out, deselect it
  useEffect(() => {
    if (selectedAttribute && !displayedAttributes.some(attr => attr.id === selectedAttribute.id)) {
      setSelectedAttribute(null)
    }
  }, [displayedAttributes, selectedAttribute])

  // Track previous filter values to detect changes
  const prevFiltersRef = useRef({ excludedScopes, selectedTags })

  // Refetch when scope or tag filters change
  useEffect(() => {
    const prev = prevFiltersRef.current
    const filtersChanged =
      JSON.stringify(prev.excludedScopes) !== JSON.stringify(excludedScopes) ||
      JSON.stringify(prev.selectedTags) !== JSON.stringify(selectedTags)

    prevFiltersRef.current = { excludedScopes, selectedTags }

    if (filtersChanged && workspaceId && assetTypeId) {
      const doRefetch = async () => {
        setIsRefetching(true)
        try {
          const response = await fetchAssetAttributeDefinitions(workspaceId, assetTypeId, 1, 25, {
            search: searchTerm || undefined,
            includeHidden,
            excludeScopes: excludedScopes.length > 0 ? excludedScopes : undefined,
            tags: selectedTags.length > 0 ? selectedTags : undefined,
          })
          setAllAttributes(response.results || [])
          setNextUrl(response.next || null)
        } catch (error) {
          console.error('Failed to refetch attributes:', error)
        } finally {
          setIsRefetching(false)
        }
      }
      doRefetch()
    }
  }, [excludedScopes, selectedTags, workspaceId, assetTypeId, searchTerm, includeHidden])

  // Reset global definition view when selected attribute changes
  useEffect(() => {
    setShowingGlobalDefinition(false)
    setGlobalDefinition(null)
  }, [selectedAttribute?.id])

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    info: true,
    configuration: false,
    choices: false,
    system: false
  })
  const [sectionOrder, setSectionOrder] = useState<string[]>(() => {
    const saved = localStorage.getItem('attributeDetailsSectionOrder')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        // Validate that it contains all expected sections
        if (Array.isArray(parsed) && parsed.length === 4 &&
          parsed.includes('info') && parsed.includes('configuration') && parsed.includes('choices') && parsed.includes('system')) {
          return parsed
        }
      } catch {
        // Invalid JSON, use default
      }
    }
    return ['info', 'configuration', 'choices', 'system']
  })

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
        const newOrder = arrayMove(prev, oldIndex, newIndex)
        localStorage.setItem('attributeDetailsSectionOrder', JSON.stringify(newOrder))
        return newOrder
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
    description: '',
    defaultValue: undefined as any,
    tags: [] as string[]
  })
  const [isApiKeyUnlocked, setIsApiKeyUnlocked] = useState(false)
  const [isApiKeyManuallyEdited, setIsApiKeyManuallyEdited] = useState(false)
  const [typeChangeDialogOpen, setTypeChangeDialogOpen] = useState(false)
  const [pendingTypeChange, setPendingTypeChange] = useState<string | null>(null)
  const [availableTags, setAvailableTags] = useState<string[]>([])

  // Fetch available tags when filter popover opens
  useEffect(() => {
    if (filterAnchorEl && workspaceId && assetTypeId) {
      fetchAttributeTags(workspaceId, assetTypeId)
        .then(tags => setAvailableTags(tags))
        .catch(err => console.error('Failed to fetch tags:', err))
    }
  }, [filterAnchorEl, workspaceId, assetTypeId])

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
  }, [searchTerm])

  // Reset to loader data when it changes
  useEffect(() => {
    setAllAttributes(initialData || [])
    setNextUrl(initialNextUrl)
  }, [initialData, initialNextUrl])

  // Initialize search term from URL on mount only
  useEffect(() => {
    const initialSearch = searchParams.get('search')
    if (initialSearch && searchTerm !== initialSearch) {
      setSearchTerm(initialSearch)
    }
  }, []) // Only run on mount

  // Auto-select attribute from URL param on load
  useEffect(() => {
    const selectedId = searchParams.get('selected')
    if (selectedId && allAttributes.length > 0 && !selectedAttribute) {
      const attr = allAttributes.find(a => a.id === selectedId)
      if (attr) {
        setSelectedAttribute(attr)
      }
    }
  }, [allAttributes]) // Only run when attributes load

  // Keep URL in sync with selected attribute
  useEffect(() => {
    const newParams = new URLSearchParams(searchParams)
    if (selectedAttribute) {
      newParams.set('selected', selectedAttribute.id)
    } else {
      newParams.delete('selected')
    }
    // Only update if different to avoid loops
    if (newParams.get('selected') !== searchParams.get('selected')) {
      setSearchParams(newParams, { replace: true })
    }
  }, [selectedAttribute])

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Keep nextUrlRef in sync with nextUrl state
  nextUrlRef.current = nextUrl

  // Fetch more items when user scrolls near the end of the list
  const handleItemsRendered = ({ visibleStopIndex }: { visibleStartIndex: number; visibleStopIndex: number }) => {
    // Fetch more when we're within 5 items of the end
    const THRESHOLD = 5
    const shouldFetch = visibleStopIndex >= displayedAttributes.length - THRESHOLD
    // Check if there are more items using nextUrl
    const hasMoreItems = !!nextUrl

    if (shouldFetch && hasMoreItems && !fetchInProgressRef.current && workspaceId && assetTypeId) {
      // Set immediately and synchronously before any async work
      fetchInProgressRef.current = true
      setIsLoadingMore(true)

      // Use the nextUrl directly - it already has the correct page params
      fetchAssetAttributeDefinitionsFromUrl(nextUrl)
        .then(response => {
          const newAttributes = response.results || []

          if (newAttributes.length > 0) {
            setAllAttributes(prev => {
              const existingIds = new Set(prev.map(attr => attr.id))
              const uniqueNewAttributes = newAttributes.filter((attr: AssetTypeAttribute) => !existingIds.has(attr.id))
              // Keep hidden items at the end
              const combined = [...prev, ...uniqueNewAttributes]
              const visible = combined.filter(attr => !attr.isHidden)
              const hidden = combined.filter(attr => attr.isHidden)
              return [...visible, ...hidden]
            })
            setNextUrl(response.next || null)
          } else {
            setNextUrl(null)
          }
        })
        .catch(error => {
          console.error('Failed to load more attributes:', error)
        })
        .finally(() => {
          fetchInProgressRef.current = false
          setIsLoadingMore(false)
        })
    }
  }

  // Fetch asset count when attribute is selected
  useEffect(() => {
    if (!selectedAttribute) {
      setSelectedAttributeAssetCount(null)
      return
    }

    const url = selectedAttribute.assetCountUrl
    if (!url) {
      setSelectedAttributeAssetCount(null)
      return
    }

    const fetchCount = async () => {
      setIsLoadingCount(true)
      try {
        const response = await fetch(url)
        if (!response.ok) throw new Error('Failed to fetch asset count')
        const data = await response.json()
        setSelectedAttributeAssetCount(data.count)
      } catch (error) {
        console.error('Failed to fetch asset count:', error)
        setSelectedAttributeAssetCount(0)
      } finally {
        setIsLoadingCount(false)
      }
    }

    fetchCount()
  }, [selectedAttribute?.id, selectedAttribute?.assetCountUrl])

  // Update list height when container size changes
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateHeight = () => {
      const rect = container.getBoundingClientRect()
      if (rect.height > 0) {
        setListHeight(rect.height)
      }
      if (rect.width > 0) {
        setLeftColumnPixelWidth(rect.width)
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
      // Find indices in displayedAttributes (what user sees and drags)
      const oldDisplayIndex = displayedAttributes.findIndex((attr) => attr.id === active.id)
      const newDisplayIndex = displayedAttributes.findIndex((attr) => attr.id === over.id)

      // Reorder the displayed items
      const newDisplayedOrder = arrayMove(displayedAttributes, oldDisplayIndex, newDisplayIndex)

      // Rebuild allAttributes: keep hidden in place, update visible order
      // We need to interleave the visible items back into all items
      const hiddenItems = allAttributes.filter(attr => attr.isHidden)
      const updatedAttributes = [...newDisplayedOrder, ...hiddenItems].map((attr, index) => ({
        ...attr,
        order: index
      }))

      setAllAttributes(updatedAttributes)

      // Update orders in the backend - send just the IDs in order
      try {
        const updates = updatedAttributes.map(attr => attr.id)
        await reorderAssetTypeAttributes(workspaceId!, assetTypeId!, updates)
      } catch (error) {
        console.error('Failed to update attribute order:', error)
        alert('Failed to update attribute order')
        // Revert local state on error
        setAllAttributes(allAttributes)
      }
    }
  }

  const openEditDialog = (attr: AssetTypeAttribute) => {
    setEditingAttribute(attr)
    setFormData({
      name: attr.name,
      apiKey: attr.apiKey,
      attributeType: attr.attributeType,
      isRequired: attr.isRequired,
      description: attr.description || '',
      defaultValue: attr.defaultValue,
      tags: attr.tags || []
    })
    setIsApiKeyUnlocked(false)
    setEditDialogOpen(true)
  }

  const handleEdit = (attr: AssetTypeAttribute) => {
    // Check if this is a global attribute - warn about creating an override
    const isBaseAttribute = !attr.workspace && !attr.isOverride
    if (isBaseAttribute) {
      setConfirmDialog({
        open: true,
        title: '⚠️ Create Workspace Override',
        message: `Editing "${attr.name}" will create a workspace-specific override.\n\nThis will:\n• Disconnect this attribute from the global definition\n• Existing assets in this workspace will lose their values for this attribute\n• Future changes to the global attribute won't apply to this workspace\n\nAre you sure you want to proceed?`,
        confirmLabel: 'Create Override',
        confirmColor: 'warning',
        onConfirm: () => {
          closeConfirmDialog()
          openEditDialog(attr)
        }
      })
      return
    }
    openEditDialog(attr)
  }

  const handleAdd = () => {
    setEditingAttribute(null)
    setFormData({
      name: '',
      apiKey: '',
      attributeType: 'text',
      isRequired: false,
      description: '',
      defaultValue: undefined,
      tags: []
    })
    setIsApiKeyUnlocked(false)
    setIsApiKeyManuallyEdited(false)
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
        : { ...formData, order: count }

      if (editingAttribute) {
        const updatedAttr = await updateAssetTypeAttribute(workspaceId!, assetTypeId!, editingAttribute.id, dataToSave)

        // When editing a base attribute, the backend may create a new override with a different ID
        // Use apiKey to match and replace the correct row
        if (updatedAttr.id !== editingAttribute.id) {
          // New override was created - replace by apiKey
          setAllAttributes(prev => prev.map(attr =>
            attr.apiKey === updatedAttr.apiKey ? updatedAttr : attr
          ))
        } else {
          // Same attribute updated
          setAllAttributes(prev => prev.map(attr =>
            attr.id === editingAttribute.id ? { ...attr, ...updatedAttr } : attr
          ))
        }

        // Update selected attribute
        if (selectedAttribute?.id === editingAttribute.id || selectedAttribute?.apiKey === updatedAttr.apiKey) {
          setSelectedAttribute(updatedAttr)
        }
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

  const handleDelete = (attr: AssetTypeAttribute) => {
    // Check if this is a base attribute - if so, suggest hiding instead
    const isBaseAttribute = !attr.workspace
    if (isBaseAttribute) {
      setConfirmDialog({
        open: true,
        title: 'Cannot Delete Base Attribute',
        message: `"${attr.name}" is a base attribute shared across workspaces. It cannot be deleted from this workspace.\n\nWould you like to hide it instead? (You can unhide it later)`,
        confirmLabel: 'Hide Instead',
        confirmColor: 'warning',
        onConfirm: () => {
          closeConfirmDialog()
          handleHide(attr)
        }
      })
      return
    }

    setConfirmDialog({
      open: true,
      title: 'Delete Attribute',
      message: `Are you sure you want to delete the attribute "${attr.name}"? This action cannot be undone.`,
      confirmLabel: 'Delete',
      confirmColor: 'error',
      onConfirm: () => {
        closeConfirmDialog()
        performDelete(attr)
      }
    })
  }

  const performDelete = async (attr: AssetTypeAttribute) => {

    try {
      const apiKey = attr.apiKey
      const isOverride = attr.isOverride

      await deleteAssetTypeAttribute(workspaceId!, assetTypeId!, attr.id)

      if (isOverride) {
        // This was an override - fetch the base attribute to replace it
        const baseAttr = await fetchAssetAttributeByApiKey(workspaceId!, assetTypeId!, apiKey)
        if (baseAttr) {
          // Replace the override with the base attribute
          setAllAttributes(prev => prev.map(a =>
            a.id === attr.id || a.apiKey === apiKey ? baseAttr : a
          ))
          // Update selected attribute to show the base
          if (selectedAttribute?.id === attr.id || selectedAttribute?.apiKey === apiKey) {
            setSelectedAttribute(baseAttr)
          }
        } else {
          // No base found (shouldn't happen), remove from list
          setAllAttributes(prev => prev.filter(a => a.id !== attr.id))
          if (selectedAttribute?.id === attr.id) {
            setSelectedAttribute(null)
          }
        }
      } else {
        // This was an extension - remove from list
        setAllAttributes(prev => prev.filter(a => a.id !== attr.id))
        if (selectedAttribute?.id === attr.id) {
          setSelectedAttribute(null)
        }
      }
    } catch (error: any) {
      console.error('Failed to delete attribute:', error)
      // Check if it's a permission error suggesting to use hide
      if (error.message?.includes('hide')) {
        setConfirmDialog({
          open: true,
          title: 'Delete Failed',
          message: `${error.message}\n\nWould you like to hide it instead?`,
          confirmLabel: 'Hide Instead',
          confirmColor: 'warning',
          onConfirm: () => {
            closeConfirmDialog()
            handleHide(attr)
          }
        })
      } else {
        alert('Failed to delete attribute: ' + error.message)
      }
    }
  }

  const handleHide = async (attr: AssetTypeAttribute) => {
    try {
      const hiddenAttr = await hideAssetTypeAttribute(workspaceId!, assetTypeId!, attr.id)

      // Update the attribute in place with isHidden flag
      setAllAttributes(prev => prev.map(a =>
        a.id === attr.id || a.apiKey === hiddenAttr.apiKey
          ? { ...hiddenAttr, isHidden: true }
          : a
      ))

      // Handle selection when hiding
      if (selectedAttribute?.id === attr.id || selectedAttribute?.apiKey === hiddenAttr.apiKey) {
        if (includeHidden) {
          // If showing hidden, just update the selected attribute
          setSelectedAttribute({ ...hiddenAttr, isHidden: true })
        } else {
          // If not showing hidden, select next visible attribute
          const currentVisibleIndex = displayedAttributes.findIndex(a => a.id === attr.id || a.apiKey === hiddenAttr.apiKey)
          const visibleWithoutCurrent = displayedAttributes.filter(a => a.id !== attr.id && a.apiKey !== hiddenAttr.apiKey)

          if (visibleWithoutCurrent.length === 0) {
            setSelectedAttribute(null)
          } else if (currentVisibleIndex < visibleWithoutCurrent.length) {
            setSelectedAttribute(visibleWithoutCurrent[currentVisibleIndex])
          } else {
            setSelectedAttribute(visibleWithoutCurrent[0])
          }
        }
      }
    } catch (error) {
      console.error('Failed to hide attribute:', error)
      alert('Failed to hide attribute')
    }
  }

  const handleUnhide = async (attr: AssetTypeAttribute) => {
    try {
      const updatedAttr = await unhideAssetTypeAttribute(workspaceId!, assetTypeId!, attr.id)

      // Update the row in place - the returned attribute replaces the current one
      // (may be base attribute if override was deleted, or same attribute if just unhidden)
      setAllAttributes(prev => prev.map(a =>
        a.id === attr.id || a.apiKey === updatedAttr.apiKey
          ? { ...updatedAttr }
          : a
      ))

      if (selectedAttribute?.id === attr.id || selectedAttribute?.apiKey === updatedAttr.apiKey) {
        setSelectedAttribute({ ...updatedAttr })
      }
    } catch (error) {
      console.error('Failed to unhide attribute:', error)
      alert('Failed to unhide attribute')
    }
  }

  function SortableRow({ attr, style: virtualStyle }: { attr: AssetTypeAttribute, style: React.CSSProperties }) {
    const isHidden = attr.isHidden
    const {
      attributes: dndAttributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: attr.id, disabled: isHidden })

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
              <IconButton
                size="small"
                {...(isHidden ? {} : dndAttributes)}
                {...(isHidden ? {} : listeners)}
                sx={{
                  cursor: isHidden ? 'not-allowed' : 'grab',
                  '&:active': { cursor: isHidden ? 'not-allowed' : 'grabbing' },
                  opacity: isHidden ? 0.3 : 1
                }}
                disabled={isHidden}
              >
                <DragIndicatorIcon fontSize="small" />
              </IconButton>
            </TableCell>
            <TableCell sx={{ fontWeight: 600, maxWidth: 0 }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0, overflow: 'hidden' }}>
                <CopyableText sx={{ fontWeight: 600 }}>
                  {attr.name}
                </CopyableText>
                {attr.isHidden && showHiddenChip && (
                  <Tooltip title="Hidden in this workspace only" arrow>
                    <Chip
                      icon={<HideIcon sx={{ fontSize: '14px !important' }} />}
                      label="Hidden"
                      size="small"
                      color="default"
                      variant="outlined"
                      sx={{
                        height: 20,
                        '& .MuiChip-label': { px: 0.75, fontSize: '0.7rem' },
                        opacity: 0.7,
                        flexShrink: 0
                      }}
                    />
                  </Tooltip>
                )}
              </Stack>
            </TableCell>
            {showScopeColumn && (
              <TableCell sx={{ width: '100px' }}>
                {attr.isOverride ? (
                  <Chip
                    label="Override"
                    size="small"
                    color="warning"
                    variant="outlined"
                    sx={{ height: 20, '& .MuiChip-label': { px: 0.75, fontSize: '0.7rem' } }}
                  />
                ) : attr.workspace ? (
                  <Chip
                    label="Local"
                    size="small"
                    color="info"
                    variant="outlined"
                    sx={{ height: 20, '& .MuiChip-label': { px: 0.75, fontSize: '0.7rem' } }}
                  />
                ) : (
                  <Chip
                    label="Global"
                    size="small"
                    color="success"
                    variant="outlined"
                    sx={{ height: 20, '& .MuiChip-label': { px: 0.75, fontSize: '0.7rem' } }}
                  />
                )}
              </TableCell>
            )}
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
      transition: isDragging ? transition : undefined,
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
              sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer', flexGrow: 1 }}
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

  // The attribute to display in the details pane - either global definition or selected
  const displayedAttribute = showingGlobalDefinition && globalDefinition ? globalDefinition : selectedAttribute

  const renderSection = (sectionId: string) => {
    if (!displayedAttribute) return null
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
            <Table size="small" sx={{ mt: 1 }}>
              <TableBody>
                <TableRow>
                  <TableCell sx={{ border: 0, pl: 0, py: 0.5, color: 'text.secondary', width: 100, verticalAlign: 'top' }}>Name</TableCell>
                  <TableCell sx={{ border: 0, py: 0.5, fontWeight: 600 }}>
                    <CopyableText>{displayedAttribute.name}</CopyableText>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={{ border: 0, pl: 0, py: 0.5, color: 'text.secondary', verticalAlign: 'top' }}>Description</TableCell>
                  <TableCell sx={{ border: 0, py: 0.5, color: displayedAttribute.description ? 'text.primary' : 'text.disabled', fontStyle: displayedAttribute.description ? 'normal' : 'italic' }}>
                    {displayedAttribute.description ? (
                      <TruncatedText maxLines={3} title="Description">{displayedAttribute.description}</TruncatedText>
                    ) : (
                      'No description'
                    )}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={{ border: 0, pl: 0, py: 0.5, color: 'text.secondary', verticalAlign: 'top' }}>
                    <Tooltip title="Count of assets using this attribute in the current workspace only" arrow>
                      <span style={{ cursor: 'help' }}>Usage</span>
                    </Tooltip>
                  </TableCell>
                  <TableCell sx={{ border: 0, py: 0.5 }}>
                    {isLoadingCount ? (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <CircularProgress size={16} />
                        <span>Loading...</span>
                      </Box>
                    ) : (
                      `${selectedAttributeAssetCount ?? 0} ${(selectedAttributeAssetCount ?? 0) === 1 ? 'asset' : 'assets'} in this workspace`
                    )}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={{ border: 0, pl: 0, py: 0.5, color: 'text.secondary', verticalAlign: 'top' }}>Scope</TableCell>
                  <TableCell sx={{ border: 0, py: 0.5 }}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                      {displayedAttribute.isOverride ? (
                        <>
                          <Chip
                            label="Override"
                            size="small"
                            color="warning"
                            variant="outlined"
                          />
                          {!showingGlobalDefinition && (
                            <Button
                              size="small"
                              variant="text"
                              startIcon={isLoadingGlobalDefinition ? <CircularProgress size={14} /> : <OpenInNewIcon />}
                              disabled={isLoadingGlobalDefinition}
                              onClick={async () => {
                                if (!assetTypeId || !selectedAttribute || !workspaceId) return
                                const orgId = selectedAttribute.organizationId
                                if (!orgId) {
                                  console.warn('Organization ID not available on attribute')
                                  return
                                }
                                setIsLoadingGlobalDefinition(true)
                                try {
                                  const globalDefId = selectedAttribute.baseAttributeId || selectedAttribute.id
                                  const globalDef = await fetchGlobalAttributeDefinition(orgId, assetTypeId, globalDefId, workspaceId)

                                  // Switch to global definition view first
                                  setGlobalDefinition(globalDef)
                                  setShowingGlobalDefinition(true)
                                  setIsLoadingGlobalDefinition(false)

                                  // Then fetch count after view has switched
                                  const countUrl = globalDef.assetCountUrl
                                  if (countUrl) {
                                    setIsLoadingCount(true)
                                    fetch(countUrl)
                                      .then(response => response.json())
                                      .then(data => setSelectedAttributeAssetCount(data.count))
                                      .catch(err => {
                                        console.error('Failed to fetch asset count:', err)
                                        setSelectedAttributeAssetCount(0)
                                      })
                                      .finally(() => setIsLoadingCount(false))
                                  } else {
                                    setSelectedAttributeAssetCount(null)
                                  }
                                } catch (err) {
                                  console.error('Failed to fetch global definition:', err)
                                  setIsLoadingGlobalDefinition(false)
                                }
                              }}
                              sx={{ textTransform: 'none', minWidth: 'auto' }}
                            >
                              View Global
                            </Button>
                          )}
                        </>
                      ) : displayedAttribute.workspace ? (
                        <Chip
                          label="Local"
                          size="small"
                          color="info"
                          variant="outlined"
                        />
                      ) : (
                        <Chip
                          label="Global"
                          size="small"
                          color="success"
                          variant="outlined"
                        />
                      )}
                      {displayedAttribute.isHidden && (
                        <Tooltip title="Hidden in this workspace only" arrow>
                          <Chip
                            icon={<HideIcon sx={{ fontSize: '14px !important' }} />}
                            label="Hidden"
                            size="small"
                            color="default"
                            variant="outlined"
                          />
                        </Tooltip>
                      )}
                      {displayedAttribute.workspaceName && (
                        <Typography variant="caption" color="text.secondary">
                          ({displayedAttribute.workspaceName})
                        </Typography>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={{ border: 0, pl: 0, py: 0.5, color: 'text.secondary', verticalAlign: 'top' }}>Tags</TableCell>
                  <TableCell sx={{ border: 0, py: 0.5 }}>
                    {displayedAttribute.tags && displayedAttribute.tags.length > 0 ? (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {displayedAttribute.tags.map((tag: string) => (
                          <Chip key={tag} label={tag} size="small" variant="outlined" />
                        ))}
                      </Box>
                    ) : (
                      <Typography variant="body2" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
                        No tags
                      </Typography>
                    )}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
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
            <Table size="small" sx={{ mt: 1 }}>
              <TableBody>
                <TableRow>
                  <TableCell sx={{ border: 0, pl: 0, py: 0.5, color: 'text.secondary', width: 100, verticalAlign: 'middle' }}>Type</TableCell>
                  <TableCell sx={{ border: 0, py: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box>
                      {displayedAttribute.attributeType.charAt(0).toUpperCase() + displayedAttribute.attributeType.slice(1)}
                    </Box>
                    {!showingGlobalDefinition && (
                      <Button
                        size="small"
                        variant="outlined"
                        color="warning"
                        startIcon={<CompareArrowsIcon />}
                        onClick={() => {
                          setEditingAttribute(selectedAttribute)
                          setFormData({
                            name: displayedAttribute.name,
                            apiKey: displayedAttribute.apiKey,
                            attributeType: displayedAttribute.attributeType,
                            isRequired: displayedAttribute.isRequired,
                            description: displayedAttribute.description || '',
                            defaultValue: displayedAttribute.defaultValue,
                            tags: displayedAttribute.tags || []
                          })
                          setPendingTypeChange(null)
                          setTypeChangeDialogOpen(true)
                        }}
                        sx={{
                          textTransform: 'none',
                          minWidth: 'auto'
                        }}
                      >
                        Convert Type
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={{ border: 0, pl: 0, py: 0.5, color: 'text.secondary', verticalAlign: 'middle' }}>Required</TableCell>
                  <TableCell sx={{ border: 0, py: 0.5 }}>
                    {displayedAttribute.isRequired ? (
                      <Chip label="Required" color="error" size="small" />
                    ) : (
                      <Chip label="Optional" variant="outlined" size="small" />
                    )}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={{ border: 0, pl: 0, py: 0.5, color: 'text.secondary', verticalAlign: 'middle' }}>API Key</TableCell>
                  <TableCell sx={{ border: 0, py: 0.5 }}>
                    <CopyableText sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>{displayedAttribute.apiKey}</CopyableText>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={{ border: 0, pl: 0, py: 0.5, color: 'text.secondary', verticalAlign: 'top' }}>Default</TableCell>
                  <TableCell sx={{ border: 0, py: 0.5, color: displayedAttribute.defaultValue !== undefined && displayedAttribute.defaultValue !== null ? 'text.primary' : 'text.disabled', fontStyle: displayedAttribute.defaultValue !== undefined && displayedAttribute.defaultValue !== null ? 'normal' : 'italic' }}>
                    {displayedAttribute.defaultValue !== undefined && displayedAttribute.defaultValue !== null
                      ? (typeof displayedAttribute.defaultValue === 'object'
                        ? JSON.stringify(displayedAttribute.defaultValue, null, 2)
                        : String(displayedAttribute.defaultValue))
                      : 'No default value'}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </DraggableSection>
        )
      case 'choices':
        return (
          <DraggableSection key="choices" id="choices">
            {({ dndAttributes, listeners }) => (
              <AttributeChoicesSection
                attribute={displayedAttribute}
                workspaceId={workspaceId!}
                assetTypeId={assetTypeId!}
                expanded={expandedSections.choices}
                onToggleExpanded={() => toggleSection('choices')}
                dragHandleProps={{ ...dndAttributes, ...listeners }}
                readOnly={showingGlobalDefinition}
              />
            )}
          </DraggableSection>
        )
      case 'system':
        return (
          <DraggableSection
            key="system"
            id="system"
            title="System Details"
            expanded={expandedSections.system}
            onToggle={() => toggleSection('system')}
          >
            <Box sx={{
              mt: 1,
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gap: 2,
              rowGap: 1.5
            }}>
              {displayedAttribute.apiUrl && (
                <>
                  <Typography variant="body2" color="text.secondary">API URL</Typography>
                  <TruncatedText sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{displayedAttribute.apiUrl}</TruncatedText>
                </>
              )}

              <Typography variant="body2" color="text.secondary">Asset Type ID</Typography>
              <CopyableText sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{assetTypeId || ''}</CopyableText>

              {displayedAttribute.baseAttributeId && (
                <>
                  <Typography variant="body2" color="text.secondary">Global Attribute ID</Typography>
                  <CopyableText sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{displayedAttribute.baseAttributeId}</CopyableText>
                </>
              )}

              <Typography variant="body2" color="text.secondary">ID</Typography>
              <CopyableText sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{displayedAttribute.id}</CopyableText>

              <Typography variant="body2" color="text.secondary">Order</Typography>
              <Typography variant="body2">{displayedAttribute.order}</Typography>

              {displayedAttribute.organizationId && (
                <>
                  <Typography variant="body2" color="text.secondary">Organization ID</Typography>
                  <CopyableText sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{displayedAttribute.organizationId}</CopyableText>
                </>
              )}

              {displayedAttribute.workspace && (
                <>
                  <Typography variant="body2" color="text.secondary">Workspace ID</Typography>
                  <CopyableText sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{displayedAttribute.workspace}</CopyableText>
                </>
              )}
            </Box>
          </DraggableSection>
        )
      default:
        return null
    }
  }

  // Details panel content - reused in both split view and drawer
  const detailsPanelContent = displayedAttribute ? (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3} sx={{ flexShrink: 0, p: 2, pb: 0 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ overflow: 'hidden' }}>
          {showingGlobalDefinition ? (
            <IconButton size="small" onClick={() => { setShowingGlobalDefinition(false); setGlobalDefinition(null) }} edge="start">
              <CloseIcon />
            </IconButton>
          ) : isSmallScreen && (
            <IconButton size="small" onClick={() => setSelectedAttribute(null)} edge="start">
              <CloseIcon />
            </IconButton>
          )}
          <Typography variant="h6" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {showingGlobalDefinition ? 'Global Definition' : 'Details'}
          </Typography>
        </Stack>
        {showingGlobalDefinition ? (
          <Chip label="Global" size="small" color="success" variant="outlined" />
        ) : (
          <ActionButtons
            width={isSmallScreen ? 0 : 100 - leftColumnWidth}
            actions={[
              ...(!selectedAttribute!.isHidden ? [{
                label: 'Edit',
                icon: <EditIcon fontSize="small" />,
                onClick: () => handleEdit(selectedAttribute!),
                color: 'primary' as const,
                variant: 'outlined' as const,
                minWidth: 20 // Show when right panel >= 20%
              }] : []),
              ...(selectedAttribute!.isHidden ? [{
                label: 'Unhide',
                icon: <ShowIcon fontSize="small" />,
                onClick: () => handleUnhide(selectedAttribute!),
                color: 'success' as const,
                variant: 'outlined' as const,
                minWidth: 30 // Show when right panel >= 30%
              }] : [{
                label: 'Hide',
                icon: <HideIcon fontSize="small" />,
                onClick: () => handleHide(selectedAttribute!),
                color: 'warning' as const,
                variant: 'outlined' as const,
                minWidth: 30 // Show when right panel >= 30%
              }]),
              // Share - always in menu
              {
                label: 'Share Attribute',
                icon: <ShareIcon fontSize="small" />,
                onClick: () => {
                  const url = new URL(window.location.href)
                  url.searchParams.set('search', selectedAttribute!.apiKey)
                  url.searchParams.set('selected', selectedAttribute!.id)
                  navigator.clipboard.writeText(url.toString())
                },
                color: 'primary' as const,
                minWidth: Infinity, // Always in menu
                dividerBefore: true
              },
              // Delete - always in menu, only for workspace attributes
              ...(selectedAttribute!.workspace && !selectedAttribute!.isHidden ? [{
                label: 'Delete',
                icon: <DeleteIcon fontSize="small" />,
                onClick: () => handleDelete(selectedAttribute!),
                color: 'error' as const,
                minWidth: Infinity // Always in menu
              }] : [])
            ]}
            menuAnchorEl={menuAnchorEl}
            setMenuAnchorEl={setMenuAnchorEl}
          />
        )}
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
  )

  return (
    <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: 'background.default', p: 2 }}>
      <Box data-resize-container sx={{ flexGrow: 1, display: 'flex', overflow: 'hidden', mb: 2, position: 'relative' }}>
        {/* Left Column - Table */}
        <Box sx={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', p: 2, width: isSmallScreen ? '100%' : `${leftColumnWidth}%`, bgcolor: 'background.paper', borderRadius: 1 }}>
          {/* Search Bar and Filter */}
          <Stack direction="row" spacing={1} sx={{ mb: 2 }} alignItems="center">
            <TextField
              size="small"
              placeholder="Search attributes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              sx={{ flexGrow: 1 }}
              InputProps={{
                startAdornment: <SearchIcon sx={{ color: 'text.secondary', mr: 1 }} />,
              }}
            />
            <Tooltip title={(selectedTags.length > 0 || excludedScopes.length > 0 || includeHidden) ? "Filters applied" : "Filter"} arrow placement="top">
              <IconButton
                size="small"
                onClick={(e) => setFilterAnchorEl(e.currentTarget)}
                sx={{
                  color: (selectedTags.length > 0 || excludedScopes.length > 0 || includeHidden)
                    ? (theme => theme.palette.mode === 'light' ? 'primary.main' : 'secondary.main')
                    : 'text.secondary',
                }}
              >
                <FilterIcon />
              </IconButton>
            </Tooltip>
            <Popover
              open={Boolean(filterAnchorEl)}
              anchorEl={filterAnchorEl}
              onClose={() => setFilterAnchorEl(null)}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
              <Box sx={{ p: 2, minWidth: 280 }}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
                  <Typography variant="subtitle2">Filter Options</Typography>
                  {isRefetching && <CircularProgress size={14} />}
                </Stack>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={includeHidden}
                      onChange={() => setIncludeHidden(!includeHidden)}
                      size="small"
                    />
                  }
                  label="Include hidden attributes"
                  sx={{ mb: 1.5, display: 'block' }}
                />
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
                        onClick={() => {
                          if (isExcluded) {
                            setExcludedScopes(excludedScopes.filter(s => s !== scope.value))
                          } else {
                            setExcludedScopes([...excludedScopes, scope.value])
                          }
                        }}
                        sx={{ cursor: 'pointer' }}
                      />
                    )
                  })}
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>Tags</Typography>
                <Autocomplete
                  multiple
                  size="small"
                  options={availableTags}
                  value={selectedTags}
                  onChange={(_, newValue) => setSelectedTags(newValue)}
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
              </Box>
            </Popover>
          </Stack>
          <Box ref={containerRef} sx={{ position: 'relative', flexGrow: 1, minHeight: 0, overflow: 'hidden' }}>
            <Box component={Paper} sx={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, maxWidth: '100%', display: 'flex', flexDirection: 'column' }}>
              {/* Table Header */}
              <Table size="small" sx={{ tableLayout: 'fixed' }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, width: '40px' }}></TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                    {showScopeColumn && (
                      <TableCell sx={{ fontWeight: 600, width: '100px' }}>Scope</TableCell>
                    )}
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
              {displayedAttributes.length === 0 ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 2, p: 4 }}>
                  <Typography variant="h6" color="text.secondary">
                    {searchTerm
                      ? 'No attributes found'
                      : (allAttributes.length > 0 && !includeHidden)
                        ? 'All attributes are hidden'
                        : 'No attributes yet'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {searchTerm
                      ? `No attributes match "${searchTerm}". Try a different search term.`
                      : (allAttributes.length > 0 && !includeHidden)
                        ? 'Toggle "Show hidden" to view hidden attributes.'
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
                  <SortableContext items={displayedAttributes.map(a => a.id)} strategy={verticalListSortingStrategy}>
                    <List
                      ref={listRef}
                      height={listHeight}
                      itemCount={displayedAttributes.length}
                      itemSize={53}
                      width="100%"
                      onItemsRendered={handleItemsRendered}
                    >
                      {({ index, style }) => {
                        const attr = displayedAttributes[index]
                        return <SortableRow key={attr.id} attr={attr} style={style} />
                      }}
                    </List>
                  </SortableContext>
                </DndContext>
              )}
            </Box>

            {isLoadingMore && (
              <Box sx={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)' }}>
                <CircularProgress size={24} />
              </Box>
            )}
          </Box>
        </Box>

        {/* Resizable Divider - hidden on small screens */}
        {!isSmallScreen && (
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
        )}

        {/* Right Column - Details Panel - hidden on small screens */}
        {!isSmallScreen && (
          <Box sx={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', width: `${100 - leftColumnWidth}%`, bgcolor: 'background.paper', borderRadius: 1 }}>
            {detailsPanelContent}
          </Box>
        )}
      </Box>

      {/* Details Drawer for small screens */}
      <Drawer
        anchor="right"
        open={isSmallScreen && !!selectedAttribute}
        onClose={() => setSelectedAttribute(null)}
        slotProps={{
          paper: {
            sx: { width: '100%', maxWidth: 400 }
          }
        }}
      >
        {detailsPanelContent}
      </Drawer>

      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingAttribute ? 'Edit Attribute' : 'Add Attribute'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Name"
              fullWidth
              value={formData.name}
              onChange={(e) => {
                const newName = e.target.value
                setFormData(prev => ({
                  ...prev,
                  name: newName,
                  // Auto-sync API key only if creating and user hasn't manually edited it
                  apiKey: !editingAttribute && !isApiKeyManuallyEdited ? generateApiKey(newName) : prev.apiKey
                }))
              }}
            />
            <TextField
              label="Description"
              fullWidth
              multiline
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
            <TextField
              label="API Key"
              fullWidth
              value={formData.apiKey}
              onChange={(e) => {
                setFormData({ ...formData, apiKey: e.target.value })
                // Mark as manually edited when creating
                if (!editingAttribute) {
                  setIsApiKeyManuallyEdited(true)
                }
              }}
              disabled={editingAttribute && !isApiKeyUnlocked}
              helperText={editingAttribute
                ? (isApiKeyUnlocked
                  ? "⚠️ Warning: Changing this may break integrations that depend on this attribute"
                  : "Click the lock icon to edit (used in API requests)")
                : "Auto-generated from name, but can be manually edited"}
              InputProps={editingAttribute ? {
                endAdornment: (
                  <IconButton
                    onClick={() => setIsApiKeyUnlocked(!isApiKeyUnlocked)}
                    edge="end"
                    size="small"
                    color={isApiKeyUnlocked ? "warning" : "default"}
                  >
                    {isApiKeyUnlocked ? <LockOpenIcon /> : <LockIcon />}
                  </IconButton>
                )
              } : undefined}
            />
            <FormControl fullWidth>
              <InputLabel>Type</InputLabel>
              <Select
                value={formData.attributeType}
                label="Type"
                disabled={editingAttribute ? true : false}
                onChange={(e) => {
                  setFormData({ ...formData, attributeType: e.target.value })
                }}
              >
                <MenuItem value="text">Text</MenuItem>
                <MenuItem value="number">Number</MenuItem>
                <MenuItem value="boolean">Boolean</MenuItem>
                <MenuItem value="date">Date</MenuItem>
                <MenuItem value="datetime">DateTime</MenuItem>
                <MenuItem value="json">JSON</MenuItem>
              </Select>
              {editingAttribute && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                  Type cannot be changed here. Use "Convert Type" button in the details panel.
                </Typography>
              )}
            </FormControl>
            {formData.attributeType === 'text' && (
              <TextField
                label="Default Value"
                fullWidth
                value={formData.defaultValue || ''}
                onChange={(e) => setFormData({ ...formData, defaultValue: e.target.value || undefined })}
                helperText="Optional default value for this attribute"
              />
            )}
            {formData.attributeType === 'number' && (
              <TextField
                label="Default Value"
                fullWidth
                type="number"
                value={formData.defaultValue ?? ''}
                onChange={(e) => setFormData({ ...formData, defaultValue: e.target.value ? Number(e.target.value) : undefined })}
                helperText="Optional default value for this attribute"
              />
            )}
            {formData.attributeType === 'boolean' && (
              <FormControl fullWidth>
                <InputLabel>Default Value</InputLabel>
                <Select
                  value={formData.defaultValue === undefined ? '' : String(formData.defaultValue)}
                  label="Default Value"
                  onChange={(e) => {
                    const val = e.target.value
                    setFormData({ ...formData, defaultValue: val === '' ? undefined : val === 'true' })
                  }}
                >
                  <MenuItem value=""><em>None</em></MenuItem>
                  <MenuItem value="true">True</MenuItem>
                  <MenuItem value="false">False</MenuItem>
                </Select>
              </FormControl>
            )}
            {formData.attributeType === 'date' && (
              <TextField
                label="Default Value"
                fullWidth
                type="date"
                value={formData.defaultValue || ''}
                onChange={(e) => setFormData({ ...formData, defaultValue: e.target.value || undefined })}
                InputLabelProps={{ shrink: true }}
                helperText="Optional default value for this attribute"
              />
            )}
            {formData.attributeType === 'datetime' && (
              <TextField
                label="Default Value"
                fullWidth
                type="datetime-local"
                value={formData.defaultValue ? formData.defaultValue.slice(0, 16) : ''}
                onChange={(e) => setFormData({ ...formData, defaultValue: e.target.value ? e.target.value + ':00Z' : undefined })}
                InputLabelProps={{ shrink: true }}
                helperText="Optional default value for this attribute"
              />
            )}
            {formData.attributeType === 'json' && (
              <TextField
                label="Default Value"
                fullWidth
                multiline
                rows={4}
                value={formData.defaultValue ? (typeof formData.defaultValue === 'string' ? formData.defaultValue : JSON.stringify(formData.defaultValue, null, 2)) : ''}
                onChange={(e) => {
                  try {
                    const val = e.target.value
                    if (!val) {
                      setFormData({ ...formData, defaultValue: undefined })
                    } else {
                      const parsed = JSON.parse(val)
                      setFormData({ ...formData, defaultValue: parsed })
                    }
                  } catch {
                    setFormData({ ...formData, defaultValue: e.target.value })
                  }
                }}
                helperText="Optional default value in JSON format"
                error={formData.defaultValue && typeof formData.defaultValue === 'string'}
              />
            )}
            <FormControlLabel
              control={
                <Checkbox
                  checked={formData.isRequired}
                  onChange={(e) => setFormData({ ...formData, isRequired: e.target.checked })}
                />
              }
              label="Required"
            />
            <Autocomplete
              multiple
              freeSolo
              options={availableTags}
              value={formData.tags}
              onChange={(_, newValue) => setFormData({ ...formData, tags: newValue as string[] })}
              renderTags={(value, getTagProps) =>
                value.map((option, index) => (
                  <Chip
                    variant="outlined"
                    label={option}
                    size="small"
                    {...getTagProps({ index })}
                    key={option}
                  />
                ))
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Tags"
                  placeholder="Add tags..."
                  helperText="Press Enter to add a tag. Used for grouping attributes."
                />
              )}
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

      <Dialog open={typeChangeDialogOpen} onClose={() => setTypeChangeDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>⚠️ Convert Attribute Type</DialogTitle>
        <DialogContent>
          <Typography gutterBottom>
            Converting the attribute type is a <strong>critical operation</strong> that can:
          </Typography>
          <ul>
            <li>Break existing data stored in this attribute</li>
            <li>Cause data loss or corruption</li>
            <li>Break integrations and API consumers</li>
            <li>Require data migration</li>
          </ul>
          <Typography color="error" sx={{ mt: 2, fontWeight: 'bold' }}>
            This action should only be performed with extreme caution and proper planning.
          </Typography>
          <FormControl fullWidth sx={{ mt: 3 }}>
            <InputLabel>New Type</InputLabel>
            <Select
              value={pendingTypeChange || formData.attributeType}
              label="New Type"
              onChange={(e) => setPendingTypeChange(e.target.value)}
            >
              <MenuItem value="text">Text</MenuItem>
              <MenuItem value="number">Number</MenuItem>
              <MenuItem value="boolean">Boolean</MenuItem>
              <MenuItem value="date">Date</MenuItem>
              <MenuItem value="datetime">DateTime</MenuItem>
              <MenuItem value="json">JSON</MenuItem>
            </Select>
          </FormControl>
          {pendingTypeChange && pendingTypeChange !== formData.attributeType && (
            <Typography sx={{ mt: 2 }}>
              Converting from <strong>{formData.attributeType}</strong> to <strong>{pendingTypeChange}</strong>
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setTypeChangeDialogOpen(false)
            setPendingTypeChange(null)
          }}>Cancel</Button>
          <Button
            onClick={() => {
              if (pendingTypeChange && pendingTypeChange !== formData.attributeType) {
                setFormData({ ...formData, attributeType: pendingTypeChange })
              }
              setTypeChangeDialogOpen(false)
              setPendingTypeChange(null)
            }}
            variant="contained"
            color="error"
            disabled={!pendingTypeChange || pendingTypeChange === formData.attributeType}
          >
            Convert Type
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        confirmColor={confirmDialog.confirmColor}
        onConfirm={confirmDialog.onConfirm}
        onCancel={closeConfirmDialog}
      />
    </Box>
  )
}
