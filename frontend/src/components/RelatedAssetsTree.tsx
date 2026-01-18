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
  IconButton,
  Chip,
  Button,
  useTheme,
} from '@mui/material'
import {
  ExpandMore as ExpandMoreIcon,
  ChevronRight as ChevronRightIcon,
  OpenInNew as OpenIcon,
  Circle as LeafIcon,
} from '@mui/icons-material'
import CopyableText from '@app/components/CopyableText'
import type { RelatedAsset, RelatedAssetsResponse } from '@app/api/assets'
import { authFetch } from '@app/api/authFetch'

const PAGE_SIZE = 50

interface TreeNodeProps {
  asset: RelatedAsset
  organizationId: string
  workspaceId: string
  currentAssetId?: string
  currentAssetChildren?: RelatedAsset[]
  depth?: number
  initialExpanded?: boolean
  initialChildren?: RelatedAsset[]
}

function TreeNode({
  asset,
  organizationId,
  workspaceId,
  currentAssetId,
  currentAssetChildren,
  depth = 0,
  initialExpanded = false,
  initialChildren,
}: TreeNodeProps) {
  const theme = useTheme()
  const chipColor = theme.palette.mode === 'dark' ? 'secondary' : 'primary'
  const isCurrentAsset = asset.id === currentAssetId

  // If this is the current asset and we have pre-loaded children for it, use them
  const effectiveInitialChildren = isCurrentAsset && currentAssetChildren
    ? currentAssetChildren
    : initialChildren
  const effectiveInitialExpanded = isCurrentAsset && currentAssetChildren && currentAssetChildren.length > 0
    ? true
    : initialExpanded

  const [expanded, setExpanded] = useState(effectiveInitialExpanded)
  const [children, setChildren] = useState<RelatedAsset[] | null>(effectiveInitialChildren ?? null)
  const [loading, setLoading] = useState(false)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const hasChildren = asset.hasChildren || (effectiveInitialChildren && effectiveInitialChildren.length > 0)

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
        const response = await authFetch(asset.relatedUrl)
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
          !isCurrentAsset ? (
            <IconButton
              component={RouterLink}
              to={`/organizations/${organizationId}/workspaces/${workspaceId}/asset-types/${asset.assetType}/assets/${asset.id}`}
              target="_blank"
              rel="noopener noreferrer"
              size="small"
              sx={{ opacity: 0.6, '&:hover': { opacity: 1 } }}
            >
              <OpenIcon fontSize="small" />
            </IconButton>
          ) : undefined
        }
      >
        <ListItemButton
          onClick={hasChildren ? handleToggle : undefined}
          disableRipple
          sx={{
            borderRadius: 1,
            py: 0.5,
            cursor: hasChildren ? 'pointer' : 'default',
            '&:hover': { bgcolor: 'transparent' },
            ...(isCurrentAsset && {
              bgcolor: 'action.selected',
              '&:hover': { bgcolor: 'action.selected' },
            }),
          }}
        >
          <ListItemIcon sx={{ minWidth: 28 }}>
            {hasChildren ? (
              loading ? (
                <CircularProgress size={16} />
              ) : expanded ? (
                <ExpandMoreIcon fontSize="small" />
              ) : (
                <ChevronRightIcon fontSize="small" />
              )
            ) : (
              <LeafIcon sx={{ fontSize: 8, ml: 0.75 }} color="disabled" />
            )}
          </ListItemIcon>
          <ListItemText
            primary={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CopyableText variant="body2" sx={{ fontWeight: isCurrentAsset ? 600 : 400 }} iconSize="inherit">
                  {asset.name}
                </CopyableText>
                {isCurrentAsset && (
                  <Chip label="Current" size="small" color={chipColor} sx={{ height: 18, fontSize: '0.65rem' }} />
                )}
              </Box>
            }
            secondary={
              <Typography variant="caption" color="text.secondary">{asset.assetTypeName}</Typography>
            }
          />
        </ListItemButton>
      </ListItem>

      {hasChildren && (
        <Collapse in={expanded} timeout="auto" unmountOnExit>
          <List disablePadding>
            {children?.slice(0, visibleCount).map((child) => (
              <TreeNode
                key={child.id}
                asset={child}
                organizationId={organizationId}
                workspaceId={workspaceId}
                currentAssetId={currentAssetId}
                currentAssetChildren={currentAssetChildren}
                depth={depth + 1}
              />
            ))}
            {children && children.length > visibleCount && (
              <ListItem sx={{ pl: (depth + 1) * 2 }}>
                <Button
                  size="small"
                  onClick={() => setVisibleCount(prev => prev + PAGE_SIZE)}
                  sx={{ textTransform: 'none' }}
                >
                  Show {Math.min(PAGE_SIZE, children.length - visibleCount)} more ({children.length - visibleCount} remaining)
                </Button>
              </ListItem>
            )}
          </List>
        </Collapse>
      )}
    </>
  )
}

interface RelatedAssetsTreeProps {
  relatedAssets: RelatedAssetsResponse | null
  currentAsset: RelatedAsset
  organizationId: string
  workspaceId: string
  loading?: boolean
  error?: string | null
}

export default function RelatedAssetsTree({
  relatedAssets,
  currentAsset,
  organizationId,
  workspaceId,
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

  if (!relatedAssets) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
        <CircularProgress size={24} />
      </Box>
    )
  }

  // Build the tree: if we have a parent, parent is root with current + siblings as children
  // Otherwise, current asset is root (even if no children)

  if (relatedAssets.parent) {
    // Create a virtual representation of current asset with its children pre-loaded
    const currentWithChildren: RelatedAsset = {
      ...currentAsset,
      hasChildren: relatedAssets.children.length > 0,
    }

    // Sort siblings by name, then put current asset first
    const sortedSiblings = [...relatedAssets.siblings].sort((a, b) =>
      a.name.localeCompare(b.name)
    )
    const parentChildren = [currentWithChildren, ...sortedSiblings]

    // Create parent with hasChildren reflecting the actual children
    const parentWithChildren: RelatedAsset = {
      ...relatedAssets.parent,
      hasChildren: true,
    }

    return (
      <List dense disablePadding>
        <TreeNode
          asset={parentWithChildren}
          organizationId={organizationId}
          workspaceId={workspaceId}
          currentAssetId={currentAsset.id}
          currentAssetChildren={relatedAssets.children}
          initialExpanded
          initialChildren={parentChildren.map(child =>
            child.id === currentAsset.id
              ? { ...child, hasChildren: relatedAssets.children.length > 0 }
              : child
          )}
        />
      </List>
    )
  }

  // No parent - current asset is the root
  const currentWithChildren: RelatedAsset = {
    ...currentAsset,
    hasChildren: relatedAssets.children.length > 0,
  }

  return (
    <List dense disablePadding>
      <TreeNode
        asset={currentWithChildren}
        organizationId={organizationId}
        workspaceId={workspaceId}
        currentAssetId={currentAsset.id}
        currentAssetChildren={relatedAssets.children}
        initialExpanded={relatedAssets.children.length > 0}
        initialChildren={relatedAssets.children}
      />
    </List>
  )
}
