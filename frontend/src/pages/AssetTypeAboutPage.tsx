import { useState, useRef, useEffect } from 'react'
import { useParams, useMatches, useRevalidator } from 'react-router-dom'
import {
  Box,
  Typography,
  Grid,
  Paper,
  TextField,
  Slider,
  Button,
  Stack,
  CircularProgress,
  Snackbar,
  Alert,
} from '@mui/material'
import { AssetTypeAuditLogSection } from '@app/components/AssetAuditLogSection'
import { updateAssetType } from '@app/api/assets'
import { invalidateCache, cacheKeys } from '@app/utils/prefetchCache'
import type { AssetType } from '@app/types'

export default function AssetTypeAboutPage() {
  const { assetTypeId, workspaceId, organizationId } = useParams<{
    assetTypeId: string
    workspaceId: string
    organizationId: string
  }>()

  // Get asset type data from parent route loader via useMatches
  const matches = useMatches()
  const assetTypeMatch = matches.find(m => m.pathname.endsWith(`/${assetTypeId}`))
  const assetType = assetTypeMatch?.data as AssetType | undefined
  const revalidator = useRevalidator()

  // Local state for form
  const [minRenderZoom, setMinRenderZoom] = useState<number>(assetType?.minRenderZoom ?? 0)
  const [maxRenderZoom, setMaxRenderZoom] = useState<number>(assetType?.maxRenderZoom ?? 22)
  const [isSaving, setIsSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  })

  // Track the last saved values to avoid resetting after save
  const lastSavedRef = useRef<{ min: number; max: number } | null>(null)

  // Sync local state when assetType data changes from server (e.g., initial load or navigation)
  useEffect(() => {
    if (!assetType) return

    const serverMin = assetType.minRenderZoom ?? 0
    const serverMax = assetType.maxRenderZoom ?? 22

    // If we just saved these values, don't reset from potentially stale server data
    if (lastSavedRef.current) {
      if (lastSavedRef.current.min === serverMin && lastSavedRef.current.max === serverMax) {
        // Server caught up with our save, clear the ref
        lastSavedRef.current = null
      }
      // Either way, don't overwrite local state right after a save
      return
    }

    // Only sync if no local changes and values differ
    if (!hasChanges) {
      if (minRenderZoom !== serverMin) setMinRenderZoom(serverMin)
      if (maxRenderZoom !== serverMax) setMaxRenderZoom(serverMax)
    }
  }, [assetType?.minRenderZoom, assetType?.maxRenderZoom])

  const handleZoomChange = (_: Event, value: number | number[]) => {
    if (Array.isArray(value)) {
      setMinRenderZoom(value[0])
      setMaxRenderZoom(value[1])
      setHasChanges(true)
    }
  }

  const handleSave = async () => {
    if (!organizationId || !assetTypeId) return

    setIsSaving(true)
    try {
      await updateAssetType(organizationId, workspaceId, assetTypeId, {
        minRenderZoom,
        maxRenderZoom,
      })

      // Invalidate the cache for this asset type
      invalidateCache(cacheKeys.assetTypeDetail(organizationId, workspaceId, assetTypeId))

      // Also invalidate the asset types list cache
      invalidateCache(cacheKeys.assetTypes(organizationId, workspaceId))

      // Track what we just saved to prevent the useEffect from resetting local state
      lastSavedRef.current = { min: minRenderZoom, max: maxRenderZoom }

      setHasChanges(false)
      setSnackbar({ open: true, message: 'Map visibility settings saved successfully', severity: 'success' })

      // Revalidate to refresh the route data
      revalidator.revalidate()
    } catch (error) {
      console.error('Failed to update asset type:', error)
      setSnackbar({ open: true, message: 'Failed to save changes', severity: 'error' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = () => {
    setMinRenderZoom(assetType?.minRenderZoom ?? 0)
    setMaxRenderZoom(assetType?.maxRenderZoom ?? 22)
    setHasChanges(false)
  }

  const zoomMarks = [
    { value: 0, label: '0' },
    { value: 5, label: '5' },
    { value: 10, label: '10' },
    { value: 15, label: '15' },
    { value: 22, label: '22' },
  ]

  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      <Typography variant="h4" gutterBottom>
        About
      </Typography>

      <Grid container spacing={3}>
        {/* Map Visibility Settings */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Map Visibility
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Control at which zoom levels assets of this type are visible on the map.
              Assets will only appear when the map zoom level is within this range.
            </Typography>

            <Box sx={{ px: 2, mb: 3 }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Render Zoom Range
              </Typography>
              <Slider
                value={[minRenderZoom, maxRenderZoom]}
                onChange={handleZoomChange}
                valueLabelDisplay="auto"
                min={0}
                max={22}
                marks={zoomMarks}
                disableSwap
              />
              <Stack direction="row" justifyContent="space-between" sx={{ mt: 1 }}>
                <TextField
                  label="Min Zoom"
                  type="number"
                  size="small"
                  value={minRenderZoom}
                  onChange={(e) => {
                    const val = Math.max(0, Math.min(22, parseInt(e.target.value) || 0))
                    setMinRenderZoom(val)
                    setHasChanges(true)
                  }}
                  inputProps={{ min: 0, max: 22 }}
                  sx={{ width: 100 }}
                />
                <TextField
                  label="Max Zoom"
                  type="number"
                  size="small"
                  value={maxRenderZoom}
                  onChange={(e) => {
                    const val = Math.max(0, Math.min(22, parseInt(e.target.value) || 22))
                    setMaxRenderZoom(val)
                    setHasChanges(true)
                  }}
                  inputProps={{ min: 0, max: 22 }}
                  sx={{ width: 100 }}
                />
              </Stack>
            </Box>

            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
              Zoom 0 = World view, Zoom 10 = City level, Zoom 15 = Street level, Zoom 22 = Maximum detail
            </Typography>

            <Stack direction="row" spacing={2} justifyContent="flex-end">
              <Button
                variant="outlined"
                onClick={handleReset}
                disabled={!hasChanges || isSaving}
              >
                Reset
              </Button>
              <Button
                variant="contained"
                onClick={handleSave}
                disabled={!hasChanges || isSaving}
                startIcon={isSaving ? <CircularProgress size={16} /> : null}
              >
                {isSaving ? 'Saving...' : 'Save'}
              </Button>
            </Stack>
          </Paper>
        </Grid>

        {/* Audit Log */}
        <Grid size={{ xs: 12, md: 6 }}>
          {assetTypeId && workspaceId && (
            <AssetTypeAuditLogSection assetTypeId={assetTypeId} workspaceId={workspaceId} />
          )}
        </Grid>
      </Grid>

      {/* Success/Error Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
          severity={snackbar.severity}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  )
}
