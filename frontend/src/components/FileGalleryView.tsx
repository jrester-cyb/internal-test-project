import React, { useRef, useEffect, useCallback } from 'react'
import { Box, Typography, IconButton, CircularProgress, Skeleton } from '@mui/material'
import {
  Folder as FolderIcon,
  InsertDriveFile as FileIcon,
  Image as ImageIcon,
  Description as DocumentIcon,
  VideoFile as VideoIcon,
  AudioFile as AudioIcon,
  MoreVert as MoreVertIcon,
} from '@mui/icons-material'
import type { FileNode } from '../api/assets'

const resourceTypeIcons: Record<string, React.ReactElement> = {
  directory: <FolderIcon />,
  file: <FileIcon />,
  image: <ImageIcon />,
  document: <DocumentIcon />,
  video: <VideoIcon />,
  audio: <AudioIcon />,
}

function splitFilename(filename: string): { name: string; extension: string } {
  const lastDotIndex = filename.lastIndexOf('.')
  if (lastDotIndex === -1 || lastDotIndex === 0) {
    return { name: filename, extension: '' }
  }
  return {
    name: filename.substring(0, lastDotIndex),
    extension: filename.substring(lastDotIndex),
  }
}

interface FileGalleryViewProps {
  items: (FileNode | null)[]
  totalCount?: number
  onNavigate: (item: FileNode) => void
  onContextMenu: (event: React.MouseEvent, item: FileNode) => void
  onMenuClick: (event: React.MouseEvent, item: FileNode) => void
  onItemsRendered?: (startIndex: number, stopIndex: number) => void
}

export default function FileGalleryView({
  items,
  totalCount = 0,
  onNavigate,
  onContextMenu,
  onMenuClick,
  onItemsRendered,
}: FileGalleryViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map())

  // Set up intersection observer to track visible items
  useEffect(() => {
    if (!onItemsRendered) return

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const visibleIndices: number[] = []
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const index = Number(entry.target.getAttribute('data-index'))
            if (!isNaN(index)) {
              visibleIndices.push(index)
            }
          }
        })

        if (visibleIndices.length > 0) {
          const min = Math.min(...visibleIndices)
          const max = Math.max(...visibleIndices)
          onItemsRendered(min, max)
        }
      },
      { root: containerRef.current, rootMargin: '100px', threshold: 0.1 }
    )

    itemRefs.current.forEach((ref) => {
      if (ref) observerRef.current?.observe(ref)
    })

    return () => {
      observerRef.current?.disconnect()
    }
  }, [onItemsRendered, items.length])

  const setItemRef = useCallback((index: number, element: HTMLDivElement | null) => {
    if (element) {
      itemRefs.current.set(index, element)
      observerRef.current?.observe(element)
    } else {
      const existing = itemRefs.current.get(index)
      if (existing) {
        observerRef.current?.unobserve(existing)
        itemRefs.current.delete(index)
      }
    }
  }, [])

  const displayItems = totalCount ? items.slice(0, totalCount) : items

  return (
    <Box ref={containerRef} sx={{ p: 2, overflowY: 'auto', height: '100%' }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: 2,
        }}
      >
        {displayItems.map((item, index) => {
          const { name, extension } = item ? splitFilename(item.name) : { name: '', extension: '' }

          return (
            <Box
              key={index}
              ref={(el) => setItemRef(index, el)}
              data-index={index}
              onContextMenu={(e) => item && onContextMenu(e, item)}
              onClick={() => item?.isDirectory && onNavigate(item)}
              sx={{
                height: 160,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                p: 2,
                borderRadius: 1,
                cursor: item?.isDirectory ? 'pointer' : 'default',
                position: 'relative',
                '&:hover': {
                  bgcolor: item ? 'action.hover' : 'transparent',
                },
              }}
            >
              {!item ? (
                <>
                  <Skeleton variant="circular" width={64} height={64} sx={{ mb: 1.5 }} />
                  <Skeleton variant="text" width="80%" />
                </>
              ) : (
                <>
                  <Box sx={{ mb: 1.5 }}>
                    {React.cloneElement(
                      resourceTypeIcons[item.resourceType] || <FileIcon />,
                      { sx: { fontSize: 64, color: 'action.active' } }
                    )}
                  </Box>
                  <Typography
                    variant="body2"
                    title={item.name}
                    fontWeight={item.isDirectory ? 500 : 400}
                    sx={{
                      textAlign: 'center',
                      width: '100%',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {name}{extension}
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation()
                      onMenuClick(e, item)
                    }}
                    sx={{ position: 'absolute', top: 4, right: 4 }}
                  >
                    <MoreVertIcon fontSize="small" />
                  </IconButton>
                </>
              )}
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}
