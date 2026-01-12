import { useState, useCallback } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  ListItemButton,
  Collapse,
  CircularProgress,
  Divider,
  IconButton,
  Chip,
} from '@mui/material'
import {
  AccountTree as ParentIcon,
  SubdirectoryArrowRight as ChildIcon,
  ExpandMore as ExpandMoreIcon,
  ChevronRight as ChevronRightIcon,
  OpenInNew as OpenIcon,
} from '@mui/icons-material'
import type { RelatedAsset, RelatedAssetsResponse } from '../api/assets'

interface TreeNodeProps {
  asset: RelatedAsset
  workspaceId: string
  currentAssetId?: string
  depth?: number
  isParent?: boolean
}

function TreeNode({ asset, workspaceId, currentAssetId, depth = 0, isParent = false }: TreeNodeProps) {
  const isCurrentAsset = asset.id === currentAssetId
  const [expanded, setExpanded] = useState(false)
  const [children, setChildren] = useState<RelatedAsset[] | null>(null)
  const [loading, setLoading] = useState(false)

  const handleToggle = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (expanded) {
      setExpanded(false)
      return
    }

    if (children === null && asset.hasChildren) {
      setLoading(true)
      try {
        const response = await fetch(asset.relatedUrl)
        if (response.ok) {
          const data: RelatedAssetsResponse = await response.json()
          setChildren(data.children)
        }
      } catch (err) {
        console.error('Failed to fetch children:', err)
      } finally {
        setLoading(false)
      }
    }

    setExpanded(true)
  }, [expanded, children, asset.relatedUrl, asset.hasChildren])

  const paddingLeft = depth * 2

  return (
    <>
      <ListItem
        disablePadding
        sx={{ pl: paddingLeft }}
        secondaryAction={
          <IconButton
            component={RouterLink}
            to={`/workspaces/${workspaceId}/asset-types/${asset.assetType}/assets/${asset.id}`}
            target="_blank"
            rel="noopener noreferrer"
            size="small"
            sx={{ opacity: 0.6, '&:hover': { opacity: 1 } }}
          >
            <OpenIcon fontSize="small" />
          </IconButton>
        }
      >
        <ListItemButton
          onClick={asset.hasChildren ? handleToggle : undefined}
          disableRipple
          sx={{
            borderRadius: 1,
            py: 0.5,
            cursor: asset.hasChildren ? 'pointer' : 'default',
            '&:hover': { bgcolor: 'transparent' },
          }}
        >
          {asset.hasChildren ? (
            <ListItemIcon sx={{ minWidth: 28 }}>
              {loading ? (
                <CircularProgress size={16} />
              ) : expanded ? (
                <ExpandMoreIcon fontSize="small" />
              ) : (
                <ChevronRightIcon fontSize="small" />
              )}
            </ListItemIcon>
          ) : (
            <ListItemIcon sx={{ minWidth: 28 }}>
              {isParent ? (
                <ParentIcon color="primary" fontSize="small" />
              ) : (
                <ChildIcon color="secondary" fontSize="small" />
              )}
            </ListItemIcon>
          )}
          <ListItemText
            primary={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2">{asset.name}</Typography>
                {isCurrentAsset && (
                  <Chip label="Current" size="small" color="primary" sx={{ height: 20, fontSize: '0.7rem' }} />
                )}
              </Box>
            }
            secondary={
              <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {isParent && (
                  <>
                    <Typography variant="caption" color="text.secondary">Parent</Typography>
                    <Typography variant="caption" color="text.disabled">•</Typography>
                  </>
                )}
                <Typography variant="caption" color="text.secondary">{asset.assetTypeName}</Typography>
                {asset.hasChildren && !isParent && (
                  <>
                    <Typography variant="caption" color="text.disabled">•</Typography>
                    <Typography variant="caption" color="text.disabled">has children</Typography>
                  </>
                )}
              </Box>
            }
          />
        </ListItemButton>
      </ListItem>

      {asset.hasChildren && (
        <Collapse in={expanded} timeout="auto" unmountOnExit>
          <List disablePadding>
            {children?.map((child) => (
              <TreeNode
                key={child.id}
                asset={child}
                workspaceId={workspaceId}
                currentAssetId={currentAssetId}
                depth={depth + 1}
              />
            ))}
          </List>
        </Collapse>
      )}
    </>
  )
}

interface RelatedAssetsTreeProps {
  relatedAssets: RelatedAssetsResponse
  workspaceId: string
  currentAssetId?: string
  loading?: boolean
  error?: string | null
}

export default function RelatedAssetsTree({
  relatedAssets,
  workspaceId,
  currentAssetId,
  loading,
  error,
}: RelatedAssetsTreeProps) {
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
        <CircularProgress size={24} />
      </Box>
    )
  }

  if (error) {
    return (
      <Typography color="error" variant="body2">
        {error}
      </Typography>
    )
  }

  if (!relatedAssets || (!relatedAssets.parent && relatedAssets.children.length === 0)) {
    return (
      <Typography color="text.secondary" variant="body2">
        No related assets
      </Typography>
    )
  }

  return (
    <Box>
      {relatedAssets.parent && (
        <Box sx={{ maxHeight: 150, overflow: 'auto', mb: 1 }}>
          <List dense disablePadding>
            <TreeNode
              asset={relatedAssets.parent}
              workspaceId={workspaceId}
              currentAssetId={currentAssetId}
              isParent
            />
          </List>
        </Box>
      )}
      {relatedAssets.parent && relatedAssets.children.length > 0 && <Divider sx={{ my: 1 }} />}
      {relatedAssets.children.length > 0 && (
        <>
          <Typography variant="caption" color="text.secondary" sx={{ pl: 1, pb: 0.5, display: 'block' }}>
            Children ({relatedAssets.children.length})
          </Typography>
          <List dense disablePadding>
            {relatedAssets.children.map((child) => (
              <TreeNode
                key={child.id}
                asset={child}
                workspaceId={workspaceId}
                currentAssetId={currentAssetId}
              />
            ))}
          </List>
        </>
      )}
    </Box>
  )
}
