import { useMemo } from 'react'
import { Card, CardContent, CardHeader, Box, Typography, Tooltip } from '@mui/material'
import { Article as ArticleIcon, VisibilityOff as VisibilityOffIcon, FilterAlt as FilterIcon, DragHandle as DragHandleIcon } from '@mui/icons-material'
import { VariableSizeList as List } from 'react-window'
import type { Asset, AssetTypeAttribute } from '../types'
import AttributeValueRenderer from './AttributeValueRenderer'
import AttributeFilterPopover from './AttributeFilterPopover'
import TagsDisplay from './TagsDisplay'

interface AttributesCardProps {
  asset: Asset
  attributes: AssetTypeAttribute[]
  showHidden: boolean
  onShowHiddenChange: (show: boolean) => void
  selectedTags: string[]
  onSelectedTagsChange: (tags: string[]) => void
  selectedTypes: string[]
  onSelectedTypesChange: (types: string[]) => void
  excludedScopes: string[]
  onExcludedScopesChange: (scopes: string[]) => void
  isLoading?: boolean
  dragHandleProps?: {
    attributes: any
    listeners: any
  }
}

export default function AttributesCard({
  asset,
  attributes,
  showHidden,
  onShowHiddenChange,
  selectedTags,
  onSelectedTagsChange,
  selectedTypes,
  onSelectedTypesChange,
  excludedScopes,
  onExcludedScopesChange,
  isLoading = false,
  dragHandleProps
}: AttributesCardProps) {
  // Get all unique tags from attributes
  const availableTags = useMemo(() => {
    const tagSet = new Set<string>()
    attributes.forEach(attr => {
      attr.tags?.forEach(tag => tagSet.add(tag))
    })
    return Array.from(tagSet).sort()
  }, [attributes])

  const hiddenCount = attributes.filter(attr => attr.isHidden).length

  return (
    <Card sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <CardHeader
        title="Attributes"
        action={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AttributeFilterPopover
              showHidden={showHidden}
              onShowHiddenChange={onShowHiddenChange}
              selectedTags={selectedTags}
              onSelectedTagsChange={onSelectedTagsChange}
              selectedTypes={selectedTypes}
              onSelectedTypesChange={onSelectedTypesChange}
              excludedScopes={excludedScopes}
              onExcludedScopesChange={onExcludedScopesChange}
              showScopeFilter={true}
              hiddenCount={hiddenCount}
              availableTags={availableTags}
              showTypeFilter={true}
              isLoading={isLoading}
            />
            {dragHandleProps && (
              <Tooltip title="Drag to reorder cards">
                <Box
                  {...dragHandleProps.attributes}
                  {...dragHandleProps.listeners}
                  sx={{
                    cursor: 'grab',
                    '&:active': { cursor: 'grabbing' },
                    p: 0.5,
                    borderRadius: 1,
                    '&:hover': { bgcolor: 'action.hover' }
                  }}
                >
                  <DragHandleIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
                </Box>
              </Tooltip>
            )}
          </Box>
        }
      />
      <CardContent sx={{ flex: 1, overflow: 'hidden', p: 0 }}>
        {(() => {
          // Filter attributes based on showHidden toggle and selected tags
          let displayAttributes = showHidden
            ? attributes
            : attributes.filter(attr => !attr.isHidden)

          // Filter by selected tags (if any)
          if (selectedTags.length > 0) {
            displayAttributes = displayAttributes.filter(attr =>
              attr.tags?.some(tag => selectedTags.includes(tag))
            )
          }

          // Filter by selected types (if any)
          if (selectedTypes.length > 0) {
            displayAttributes = displayAttributes.filter(attr =>
              attr.attributeType && selectedTypes.includes(attr.attributeType)
            )
          }

          // Filter by excluded scopes (if any)
          if (excludedScopes.length > 0) {
            displayAttributes = displayAttributes.filter(attr => {
              const scope = attr.scope || 'global'
              return !excludedScopes.includes(scope)
            })
          }

          if (displayAttributes.length === 0) {
            // Determine why there are no attributes to show a helpful message
            let message = 'No attributes'
            let icon = <ArticleIcon sx={{ mr: 1, verticalAlign: 'middle' }} />

            if (attributes.length === 0) {
              message = 'No attributes available'
              icon = <ArticleIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
            } else if (attributes.every(attr => attr.isHidden) && !showHidden) {
              message = 'All attributes are hidden for this asset type'
              icon = <VisibilityOffIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
            } else if (selectedTags.length > 0 || selectedTypes.length > 0 || excludedScopes.length > 0) {
              message = 'No attributes match the current filters'
              icon = <FilterIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
            }

            return (
              <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <Typography color="text.secondary" variant="h6" sx={{ display: 'flex', alignItems: 'center' }}>
                  {icon}
                  {message}
                </Typography>
              </Box>
            )
          }

          const AttributeRow = ({ index, style }: { index: number, style: React.CSSProperties }) => {
            const attr = displayAttributes[index]
            const value = asset.attributes?.[attr.apiKey]
            return (
              <Box
                style={style}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  px: 2,
                  py: 1,
                  '&:hover': {
                    bgcolor: 'action.hover',
                  },
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0, mr: 2 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 'medium', mb: 0.5 }}>
                    {attr.name}
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      {attr.attributeType || 'text'}
                    </Typography>
                    {attr.scope && attr.scope !== 'global' && (
                      <>
                        <Typography variant="caption" color="text.secondary">•</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {attr.scope}
                        </Typography>
                      </>
                    )}
                  </Box>
                  {attr.description && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                      {attr.description}
                    </Typography>
                  )}
                  {attr.tags && attr.tags.length > 0 && (
                    <TagsDisplay
                      tags={attr.tags}
                      label={`Tags for ${attr.name}`}
                      selectedTags={selectedTags}
                      onTagClick={(tag) => {
                        if (selectedTags.includes(tag)) {
                          // Remove tag if already selected (toggle off)
                          onSelectedTagsChange(selectedTags.filter(t => t !== tag))
                        } else {
                          // Add tag if not selected (toggle on)
                          onSelectedTagsChange([...selectedTags, tag])
                        }
                      }}
                    />
                  )}
                </Box>
                <Box sx={{ flex: 1, overflow: 'hidden' }}>
                  <AttributeValueRenderer attribute={attr} value={value} maxLines={3} />
                </Box>
              </Box>
            )
          }

          // Calculate row height based on content and attribute type
          const getRowHeight = (index: number) => {
            const attr = displayAttributes[index]
            const value = asset.attributes?.[attr.apiKey]
            const hasTags = attr.tags && attr.tags.length > 0
            const hasDescription = !!attr.description
            const padding = 24

            // Calculate left column height (name + type/scope chips + description + tags)
            let leftHeight = 28 // name line
            leftHeight += 28 // type/scope chips row
            if (hasDescription) {
              leftHeight += 36 // single line description + "see full text" link
            }
            if (hasTags && attr.tags) {
              leftHeight += 26 // single row of tags
            }

            // Calculate right column height based on value type
            // Add extra height for TruncatedText "see full text" link when content is long
            let rightHeight = 28
            if (value !== null && value !== undefined) {
              if (attr.attributeType === 'json' || typeof value === 'object') {
                const formatted = JSON.stringify(value, null, 2)
                const lines = Math.min(3, formatted.split('\n').length)
                rightHeight = (lines * 24) + 32
              } else if (attr.attributeType === 'boolean') {
                rightHeight = 32
              } else {
                const stringValue = String(value)
                const lines = Math.min(3, Math.ceil(stringValue.length / 50))
                rightHeight = (lines * 24) + (stringValue.length > 150 ? 32 : 0)
              }
            }

            return Math.max(leftHeight, rightHeight) + padding
          }

          return (
            <List
              height={320}
              itemCount={displayAttributes.length}
              itemSize={getRowHeight}
              width="100%"
            >
              {AttributeRow}
            </List>
          )
        })()}
      </CardContent>
    </Card>
  )
}