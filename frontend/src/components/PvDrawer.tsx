import { useEffect, useState, useRef } from 'react'
import { Box, Paper, Slide, Typography, IconButton } from '@mui/material'
import { DragHandle as DragHandleIcon, Close as CloseIcon, ChevronRight as ChevronRightIcon } from '@mui/icons-material'

interface PvDrawerProps {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
}

export default function PvDrawer({ isOpen, onClose, children }: PvDrawerProps) {
  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = localStorage.getItem('assetDetailsPanelWidth')
    return saved ? parseInt(saved, 10) : 380
  }) // Default width in pixels
  const [isResizing, setIsResizing] = useState(false)
  const [isDraggable, setIsDraggable] = useState(true)
  const [preventClick, setPreventClick] = useState(false)
  const [isSliding, setIsSliding] = useState(false)
  const [slideOffset, setSlideOffset] = useState(0)
  const resizeRef = useRef<HTMLDivElement>(null)

  // Check screen size and update draggable state
  useEffect(() => {
    const checkScreenSize = () => {
      const minScreenWidth = 760 // Minimum screen width to allow dragging (380 for drawer + 380 for content)
      setIsDraggable(window.innerWidth >= minScreenWidth)
    }

    checkScreenSize()
    window.addEventListener('resize', checkScreenSize)

    return () => {
      window.removeEventListener('resize', checkScreenSize)
    }
  }, [])

  const handleResizeStart = (e: React.MouseEvent) => {
    if (!isDraggable) return
    e.preventDefault()
    setIsResizing(true)
  }

  const handleResizeClick = () => {
    // Don't close if this click was part of a double-click
    if (preventClick) {
      setPreventClick(false)
      return
    }
    onClose()
  }


  // Resize functionality
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return
      const newWidth = window.innerWidth - e.clientX
      const minWidth = 380
      if (newWidth < minWidth) {
        if (!isSliding) {
          setIsSliding(true)
        }
        setSlideOffset(minWidth - newWidth)
      } else {
        if (isSliding) {
          setIsSliding(false)
        }
        const clampedWidth = Math.max(minWidth, Math.min(window.innerWidth - 200, newWidth))
        setPanelWidth(clampedWidth)
        localStorage.setItem('assetDetailsPanelWidth', clampedWidth.toString())
      }
    }

    const handleMouseUp = () => {
      if (isSliding) {
        onClose()
      }
      setIsResizing(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'ew-resize'
      document.body.style.userSelect = 'none'
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing, isSliding, slideOffset, panelWidth, onClose])

  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setIsSliding(false)
        setSlideOffset(0)
      }, 350)
    }
  }, [isOpen])

  // Extracted style for Slide component to avoid nested ternary
  let slideStyle: React.CSSProperties | undefined;
  if (isDraggable) {
    slideStyle = isSliding ? { transform: `translateX(${slideOffset}px)`, transition: 'none' } : undefined;
  } else {
    slideStyle = {
      position: 'absolute',
      top: 56,
      bottom: 56,
      left: 0,
      right: 0
    };
  }

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', overflow: 'hidden', pointerEvents: 'none', zIndex: 999 }}>
      <Slide
        direction={isDraggable ? "left" : "up"}
        in={isOpen}
        appear={false}
        timeout={300}
        container={isDraggable ? undefined : document.body}
        style={slideStyle}
      >
        <Paper
          elevation={0}
          sx={{
            pointerEvents: 'auto',
            position: 'fixed',
            top: isDraggable ? 64 : 56, // Higher up on mobile (56px instead of 64px)
            left: isDraggable ? 'auto' : 0,
            right: 0,
            bottom: isDraggable ? 0 : 56, // Leave 56px for bottom nav on mobile
            width: isDraggable ? `${panelWidth}px` : '100%',
            height: isDraggable ? 'auto' : 'calc(100vh - 112px)', // 56px top + 56px bottom
            zIndex: 1000,
            borderLeft: isDraggable ? 1 : 0,
            borderColor: 'divider',
            borderRadius: isDraggable ? undefined : 0, // Remove rounded borders on mobile
            display: 'flex',
            flexDirection: 'row',
            transition: isDraggable && !isResizing ? 'width 0.3s ease-in-out' : 'none'
          }}
        >
          {/* Resize Handle */}
          {isDraggable && (
            <Box
              ref={resizeRef}
              onMouseDown={handleResizeStart}
              onClick={handleResizeClick}
              sx={{
                width: '12px',
                cursor: 'pointer',
                backgroundColor: 'background.paper',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                '&:hover': {
                  backgroundColor: 'action.hover',
                  '& .resize-dots': {
                    opacity: 0
                  },
                  '& .close-arrow': {
                    opacity: 1
                  }
                }
              }}
            >
              <Box
                className="resize-dots"
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 0.25,
                  opacity: 0.6,
                  transition: 'opacity 0.2s ease'
                }}
              >
                <Box sx={{ width: '2px', height: '2px', bgcolor: 'text.secondary', borderRadius: '50%' }} />
                <Box sx={{ width: '2px', height: '2px', bgcolor: 'text.secondary', borderRadius: '50%' }} />
                <Box sx={{ width: '2px', height: '2px', bgcolor: 'text.secondary', borderRadius: '50%' }} />
              </Box>

              <ChevronRightIcon
                className="close-arrow"
                sx={{
                  position: 'absolute',
                  opacity: 0,
                  transition: 'opacity 0.2s ease',
                  fontSize: 16,
                  color: 'text.secondary'
                }}
              />
            </Box>
          )}

          {/* Main Content */}
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {children}
          </Box>
        </Paper>
      </Slide>
    </div>
  )
}