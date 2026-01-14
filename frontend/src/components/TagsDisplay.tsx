import { useState } from 'react'
import { Box, Chip, Dialog, DialogTitle, DialogContent } from '@mui/material'

interface TagsDisplayProps {
  tags: string[]
  maxVisible?: number
  label?: string
  size?: 'small' | 'medium'
  onTagClick?: (tag: string) => void
}

export default function TagsDisplay({ tags, maxVisible = 2, label = 'Tags', size = 'small', onTagClick }: TagsDisplayProps) {
  const [dialogOpen, setDialogOpen] = useState(false)

  if (!tags || tags.length === 0) return null

  const visibleTags = tags.slice(0, maxVisible)
  const remainingCount = tags.length - maxVisible

  const handleTagClick = (tag: string) => (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onTagClick) {
      onTagClick(tag)
      setDialogOpen(false) // Close dialog if open
    }
  }

  const chipSx = size === 'small'
    ? {
      height: 18,
      fontSize: '0.65rem',
      maxWidth: 80,
      cursor: onTagClick ? 'pointer' : 'default',
      '& .MuiChip-label': { px: 0.75, overflow: 'hidden', textOverflow: 'ellipsis' }
    }
    : {
      maxWidth: 120,
      cursor: onTagClick ? 'pointer' : 'default',
      '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' }
    }

  const moreChipSx = size === 'small'
    ? { height: 18, fontSize: '0.65rem', cursor: 'pointer', flexShrink: 0, '& .MuiChip-label': { px: 0.75 } }
    : { cursor: 'pointer', flexShrink: 0 }

  return (
    <>
      <Box sx={{ display: 'flex', flexWrap: 'nowrap', gap: 0.5, overflow: 'hidden' }}>
        {visibleTags.map(tag => (
          <Chip
            key={tag}
            label={tag}
            size={size}
            variant="outlined"
            onClick={onTagClick ? handleTagClick(tag) : undefined}
            sx={chipSx}
          />
        ))}
        {remainingCount > 0 && (
          <Chip
            label={`+${remainingCount}`}
            size={size}
            variant="outlined"
            color="primary"
            onClick={(e) => {
              e.stopPropagation()
              setDialogOpen(true)
            }}
            sx={moreChipSx}
          />
        )}
      </Box>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{label}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, pt: 1 }}>
            {tags.map(tag => (
              <Chip
                key={tag}
                label={tag}
                size="small"
                variant="outlined"
                onClick={onTagClick ? handleTagClick(tag) : undefined}
                sx={onTagClick ? { cursor: 'pointer' } : undefined}
              />
            ))}
          </Box>
        </DialogContent>
      </Dialog>
    </>
  )
}
